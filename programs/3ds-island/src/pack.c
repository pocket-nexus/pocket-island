/* island.pack (pack.h): the tables in the heap, the meshes and textures read
 * from the ROMFS when something first draws them, and kept. */
#include "pack.h"

#include <3ds.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define TAG(a, b, c, d) ((uint32_t)(a) | ((uint32_t)(b) << 8) | ((uint32_t)(c) << 16) | ((uint32_t)(d) << 24))

typedef struct {
  uint32_t tag, offset, size, count;
} Section;

static FILE *file;
static Section sections[16];
static uint32_t section_count;
static Pack pack;
static uint8_t **meshes;
static C3D_Tex **textures;
static uint32_t resident;
static uint32_t mesh_base, texel_base;

static const Section *section(uint32_t tag) {
  for (uint32_t i = 0; i < section_count; i++)
    if (sections[i].tag == tag) return &sections[i];
  return NULL;
}

static void *table(uint32_t tag, uint32_t record, uint32_t *count) {
  const Section *s = section(tag);
  if (!s || s->size != s->count * record) return NULL;
  void *data = malloc(s->size ? s->size : 1);
  if (!data) return NULL;
  if (fseek(file, s->offset, SEEK_SET) != 0 || fread(data, 1, s->size, file) != s->size) {
    free(data);
    return NULL;
  }
  *count = s->count;
  return data;
}

bool pack_open(const char *path, Pack *out, char *error, size_t capacity) {
  file = fopen(path, "rb");
  if (!file) {
    snprintf(error, capacity, "%s is missing", path);
    return false;
  }
  uint32_t head[4];
  if (fread(head, 4, 4, file) != 4 || head[0] != TAG('P', 'I', 'P', 'K')) {
    snprintf(error, capacity, "%s is not an island pack", path);
    return false;
  }
  if (head[1] != PACK_VERSION || head[2] > 16 || fread(sections, sizeof(Section), head[2], file) != head[2]) {
    snprintf(error, capacity, "the pack is version %lu; this program reads %d", (unsigned long)head[1], PACK_VERSION);
    return false;
  }
  section_count = head[2];
  pack.catalogue = head[3];
  pack.items = table(TAG('I', 'T', 'E', 'M'), sizeof(PackItem), &pack.item_count);
  pack.variants = table(TAG('V', 'A', 'R', 'I'), sizeof(PackVariant), &pack.variant_count);
  pack.draws = table(TAG('D', 'R', 'A', 'W'), sizeof(PackDraw), &pack.draw_count);
  pack.textures = table(TAG('T', 'E', 'X', 'T'), sizeof(PackTexture), &pack.texture_count);
  pack.finishes = table(TAG('F', 'I', 'N', 'I'), sizeof(PackFinish), &pack.finish_count);
  uint32_t islands = 0;
  pack.island = table(TAG('I', 'S', 'L', 'E'), sizeof(PackIsland), &islands);
  pack.models = table(TAG('M', 'O', 'D', 'L'), sizeof(PackModel), &pack.model_count);
  pack.instances = table(TAG('I', 'N', 'S', 'T'), sizeof(PackInstance), &pack.instance_count);
  const Section *mesh = section(TAG('M', 'E', 'S', 'H')), *texd = section(TAG('T', 'E', 'X', 'D'));
  if (!pack.items || !pack.variants || !pack.draws || !pack.textures || !pack.finishes || !pack.island || !pack.models || !pack.instances || !mesh || !texd) {
    snprintf(error, capacity, "the pack lacks a table, or memory is short");
    return false;
  }
  mesh_base = mesh->offset;
  texel_base = texd->offset;
  fseek(file, 0, SEEK_END);
  pack.bytes = (uint32_t)ftell(file);
  meshes = calloc(pack.variant_count, sizeof *meshes);
  textures = calloc(pack.texture_count, sizeof *textures);
  if (!meshes || !textures) {
    snprintf(error, capacity, "no memory for the pack's index");
    return false;
  }
  *out = pack;
  return true;
}

void pack_close(void) {
  for (uint32_t i = 0; meshes && i < pack.variant_count; i++)
    if (meshes[i]) linearFree(meshes[i]);
  for (uint32_t i = 0; textures && i < pack.texture_count; i++)
    if (textures[i]) {
      C3D_TexDelete(textures[i]);
      free(textures[i]);
    }
  free(meshes);
  free(textures);
  meshes = NULL;
  textures = NULL;
  /* A file left open on the ROMFS is closed by the C library after the ROMFS is gone, and the program
   * faults on its way out. */
  if (file) fclose(file);
  file = NULL;
}

const uint8_t *pack_variant(uint32_t variant) {
  if (!file || variant >= pack.variant_count) return NULL;
  if (meshes[variant]) return meshes[variant];
  const PackVariant *v = &pack.variants[variant];
  uint8_t *data = linearAlloc(v->size ? v->size : 16);
  if (!data) return NULL;
  if (fseek(file, mesh_base + v->offset, SEEK_SET) != 0 || fread(data, 1, v->size, file) != v->size) {
    linearFree(data);
    return NULL;
  }
  GSPGPU_FlushDataCache(data, v->size);
  meshes[variant] = data;
  resident += v->size;
  return data;
}

static GPU_TEXCOLOR format_of(uint8_t format) {
  switch (format) {
    case 0: return GPU_RGBA8;
    case 1: return GPU_RGB8;
    case 2: return GPU_RGBA5551;
    case 4: return GPU_RGBA4;
    case 5: return GPU_ETC1;
    case 6: return GPU_ETC1A4;
    default: return GPU_RGB565;
  }
}

C3D_Tex *pack_texture(int32_t index) {
  if (!file || index < 0 || (uint32_t)index >= pack.texture_count) return NULL;
  if (textures[index]) return textures[index];
  const PackTexture *t = &pack.textures[index];
  C3D_Tex *tex = calloc(1, sizeof *tex);
  if (!tex) return NULL;
  C3D_TexInitParams params = {.width = t->width, .height = t->height, .maxLevel = (u8)(t->levels - 1), .format = format_of(t->format), .type = GPU_TEX_2D, .onVram = false};
  if (!C3D_TexInitWithParams(tex, NULL, params)) {
    free(tex);
    return NULL;
  }
  uint32_t bytes = C3D_TexCalcTotalSize(tex->size, params.maxLevel);
  if (bytes > t->size) bytes = t->size;
  if (fseek(file, texel_base + t->offset, SEEK_SET) != 0 || fread(tex->data, 1, bytes, file) != bytes) {
    C3D_TexDelete(tex);
    free(tex);
    return NULL;
  }
  C3D_TexFlush(tex);
  C3D_TexSetFilter(tex, GPU_LINEAR, GPU_LINEAR);
  C3D_TexSetFilterMipmap(tex, GPU_LINEAR);
  C3D_TexSetWrap(tex, GPU_REPEAT, GPU_REPEAT);
  textures[index] = tex;
  resident += bytes;
  return tex;
}

uint32_t pack_resident(void) { return resident; }
