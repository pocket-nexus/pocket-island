/* island.pack, as tools/cook.ts writes it. Every record here has the size and
 * layout of its table in the pack; both sides check PACK_VERSION.
 *
 *   header       "PIPK", version, section count, the catalogue's hash
 *   sections     tag, offset, size, count (16 bytes each)
 *   ITEM 48 B    an item in catalogue order: its variants, kind, size, light
 *   VARI 40 B    a variant: its bytes in MESH, its draws, its bounds
 *   DRAW 20 B    a draw: vertices and indices from the variant's start,
 *                its texture (-1 none, -2 the sky), flags (1 blended,
 *                2 gives off light) and culling
 *   MESH         per variant: vertices (24 B each) and 16-bit indices
 *   TEXT 16 B    a texture: its levels in TEXD, size, format, level count
 *   TEXD         PICA200 texel data: ETC1 (format 5) or ETC1A4 (6), each level after the one before
 *   FINI 20 B    a wallpaper or flooring: its texture, span and trim colours
 *   ISLE 64 B    the island: the map's size, the player's part models and
 *                joints, the lamps outdoors
 *   MODL 16 B    an island model: its variant (after the furniture's), the
 *                radius of its shadow, flags, its bounding radius
 *   INST 20 B    a model standing on the island: which, flags (1: drawn as
 *                part of its chunk's model, kept for its shadow and light),
 *                where, its turn
 *
 * A vertex: position (4 x s16, tiles x 2048), normal (4 x s8, x 127),
 * colour (4 x u8), emission (4 x u8: rgb x strength / 4, alpha 255 for
 * always and 0 while the item is on), texture coordinate (2 x s16, x 1024). */
#ifndef ISLAND_PACK_H
#define ISLAND_PACK_H

#include <citro3d.h>
#include <stdbool.h>
#include <stdint.h>

#define PACK_VERSION 4
#define PACK_POS_SCALE (1.0f / 2048.0f)
#define PACK_UV_SCALE (1.0f / 1024.0f)
#define PACK_VERTEX_BYTES 24
#define PACK_TEXTURE_NONE (-1)
#define PACK_TEXTURE_SKY (-2)

enum { KIND_FLOOR = 0, KIND_MISC = 1, KIND_WALL = 2, KIND_CEILING = 3, KIND_RUG = 4 };
enum { ITEM_SWITCHES = 1, ITEM_LIGHT = 2, ITEM_WINDOW = 4 };

typedef struct {
  uint16_t first_variant, variant_count;
  uint8_t kind, flags;
  uint16_t pad;
  float size[2];
  float light_at[3];
  uint32_t light_color;
  float light_intensity, light_distance, halo;
  uint32_t pad2;
} PackItem;

typedef struct {
  uint32_t offset, size;
  uint16_t first_draw, draw_count;
  uint32_t triangles;
  float min[3], max[3];
} PackVariant;

/* A draw's blend: glass (drawn in the second pass), gives off light, the house's windows (lit by its rooms). */
enum { DRAW_GLASS = 1, DRAW_EMITS = 2, DRAW_HOUSE = 4 };

typedef struct {
  uint32_t vtx, vtx_count, idx, idx_count;
  int16_t texture;
  uint8_t blend, cull;
} PackDraw;

typedef struct {
  uint32_t offset, size;
  uint16_t width, height;
  uint8_t format, levels, pad[2];
} PackTexture;

typedef struct {
  uint8_t kind, pad;
  int16_t texture;
  float span[2];
  uint32_t skirting, cap;
} PackFinish;

/* MODL flags: a lamp, a chunk's ground and water, one of the player's parts, a cell of props (the cook's),
 * one of the island's things (drawn where the core lists it). */
enum { MODEL_LAMP = 1, MODEL_CHUNK = 2, MODEL_PART = 4, MODEL_CELL = 8, MODEL_THING = 16 };

typedef struct {
  uint16_t w, d;
  /* The player's parts as models: body, head, left arm, right arm, left leg, right leg. */
  uint16_t parts[6];
  float hip, hip_x, shoulder, shoulder_x, neck;
  float lamp_y, lamp_intensity, lamp_distance;
  uint32_t lamp_color;
  uint32_t pad[3];
} PackIsland;

typedef struct {
  uint32_t variant;
  float shadow;
  uint32_t flags;
  float radius;
} PackModel;

/* THNG: what the island's core lists to draw (things::show, items by number): its model and its shadow's
 * radius; a tool's hold in the right hand: the hand's place on the arm, the turn forward about x, and
 * the tip's distance along the tool's -y (where a line leaves the rod). */
typedef struct {
  uint16_t code, model;
  float shadow;
  float at[3];
  float turn, tip;
  uint32_t pad;
} PackThing;

/* INST flags */
enum { INSTANCE_BATCHED = 1 };

typedef struct {
  uint16_t model, flags;
  float x, y, z, yaw;
} PackInstance;

_Static_assert(sizeof(PackIsland) == 64, "ISLE");
_Static_assert(sizeof(PackModel) == 16, "MODL");
_Static_assert(sizeof(PackInstance) == 20, "INST");
_Static_assert(sizeof(PackThing) == 32, "THNG");
_Static_assert(sizeof(PackItem) == 48, "ITEM");
_Static_assert(sizeof(PackVariant) == 40, "VARI");
_Static_assert(sizeof(PackDraw) == 20, "DRAW");
_Static_assert(sizeof(PackTexture) == 16, "TEXT");
_Static_assert(sizeof(PackFinish) == 20, "FINI");

typedef struct {
  const PackItem *items;
  uint32_t item_count;
  const PackVariant *variants;
  uint32_t variant_count;
  const PackDraw *draws;
  uint32_t draw_count;
  const PackTexture *textures;
  uint32_t texture_count;
  const PackFinish *finishes;
  uint32_t finish_count;
  const PackIsland *island;
  const PackModel *models;
  uint32_t model_count;
  const PackInstance *instances;
  uint32_t instance_count;
  const PackThing *things;
  uint32_t thing_count;
  uint32_t catalogue;
  uint32_t bytes;
} Pack;

/* Reads the tables; the meshes and textures stay on the ROMFS until drawn.
 * False with `error` set when the pack is missing or of another version. */
bool pack_open(const char *path, Pack *out, char *error, size_t capacity);
void pack_close(void);
/* A variant's vertices and indices in linear memory, read on first use. NULL
 * when the read failed. */
const uint8_t *pack_variant(uint32_t variant);
/* A texture, uploaded on first use; NULL for an index out of range. */
C3D_Tex *pack_texture(int32_t index);
/* Bytes of meshes and textures resident. */
uint32_t pack_resident(void);

#endif
