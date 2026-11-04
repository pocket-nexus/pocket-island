/* The room on the 3DS (scene.h).
 *
 * The upper screen looks into the room from its open front, a little from
 * above, as the browser's camera rig does (src/scene/rig.ts): the distance
 * follows from the rectangle that must stay in view. The light is the
 * browser's (src/scene/lighting.ts) for each ceiling mode and time of day,
 * per vertex: a hemisphere, a key from above the front left, a front light,
 * and the four strongest lamps that are on. Furniture throws a soft shadow
 * onto what it stands on; a lamp that is on shows a halo.
 *
 * The touch screen's plan is the same room drawn from straight above, or one
 * wall seen face on, under the interface's list.
 *
 * Outdoors the upper screen shows the island as the browser does (src/world.ts,
 * src/scene/rig.ts): the camera follows the player north, under the sky's light
 * for the time of day; the ground, the water, the house and every prop are the
 * pack's island models where its instances put them, culled to the view; after
 * dark the lamps nearest the player light the ground. The player is six parts
 * turned about their joints by the pose the interface hands over. */
#include "scene.h"

#include <3ds.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#include "core.h"
#include "flat_shbin.h"
#include "room_shbin.h"

#define WALL_HEIGHT 3.0f
#define FOV_DEG 26.0f
#define LAMP_RADIUS 0.45f
#define LAMPS 4
/* The strength the light cache keeps the lamps' light at (the night's), and the emission's own scale it is kept in. */
#define LIT_NIGHT 1.2f
#define LIT_SCALE 4.0f
#define PI 3.14159265f

typedef struct {
  float r, g, b;
} Rgb;

static Rgb hex(uint32_t v) { return (Rgb){((v >> 16) & 255) / 255.0f, ((v >> 8) & 255) / 255.0f, (v & 255) / 255.0f}; }
static Rgb rgba(uint32_t v) { return (Rgb){(v & 255) / 255.0f, ((v >> 8) & 255) / 255.0f, ((v >> 16) & 255) / 255.0f}; }
static Rgb scale(Rgb c, float k) { return (Rgb){c.r * k, c.g * k, c.b * k}; }
static Rgb mixc(Rgb a, Rgb b, float t) { return (Rgb){a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t}; }
static float clampf(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ---------------------------------------------------------------- the light, from src/scene/lighting.ts */

static const Pack *P;

typedef struct {
  Rgb key, sky, ground;
  float key_power, fill, env;
  uint32_t background;
  Rgb window_top, window_bottom;
  bool stars;
  float window_strength;
  float lamp, halo;
} Look;

/* The pack's colours keep red in the low byte (as the vertices'); the looks keep 0xrrggbb. */
static uint32_t rrggbb(uint32_t c) { return (c & 255) << 16 | (c & 0xff00) | ((c >> 16) & 255); }

/* The room's light for a ceiling mode (0 warm, 1 cool, 2 off) at a look of the day (0 day, 1 dusk,
 * 2 night), as the browser's (the pack's LOOK, from src/scene/lighting.ts look). */
static Look look_for(uint32_t mode, uint32_t time) {
  const PackLook *p = &P->looks[LOOK_ROOM(mode > 2 ? 0 : mode, time > 2 ? 0 : time)];
  return (Look){
      .key = rgba(p->key), .sky = rgba(p->sky), .ground = rgba(p->ground), .key_power = p->key_power, .fill = p->fill, .env = p->env,
      .background = rrggbb(p->background), .window_top = rgba(p->window_top), .window_bottom = rgba(p->window_bottom),
      .stars = p->stars != 0, .window_strength = p->window_strength, .lamp = p->lamp, .halo = p->halo,
  };
}

/* The browser lights in linear light through a tone curve; this light is in the colours' own
 * space, so each term is scaled to give a face what the browser's picture shows it. */
static float tune[6] = {0.6f, 0.45f, 0.23f, 0.08f, 0.3f, 0.9f};
#define HEMI_FILL tune[0]
#define HEMI_ENV tune[1]
#define KEY_K tune[2]
#define FRONT_K tune[3]
#define LAMP_K tune[4]
#define LAMP_CAP tune[5]

void scene_tune(const float *values, uint32_t count) {
  for (uint32_t i = 0; i < count && i < 6; i++) tune[i] = values[i];
  scene_relight();
}

static const float KEY_DIR[3] = {-0.4364f, 0.8729f, 0.3317f};   /* (-0.5, 1, 0.38) normalised */
static const float FRONT_DIR[3] = {-0.2082f, 0.4997f, 0.8329f}; /* (-0.25, 0.6, 1) */

/* ---------------------------------------------------------------- state */

typedef struct {
  uint32_t id;
  uint32_t item, variant;
  float x, y, z, yaw;
  float shown[4]; /* x, y, z, yaw as drawn, easing toward the goal */
  float pop;
  bool on, fresh;
  uint32_t flags, layer;
} Instance;

typedef struct {
  float pos[3];
  float uv[2];
} FlatVertex;

static DVLB_s *room_dvlb, *flat_dvlb;
static shaderProgram_s room_prog, flat_prog;
static struct {
  int8_t mvp, model, scales, inst, tint, hemi, tilt, keydir, keycol, frontdir, frontcol, lamppos, lampcol, shade;
  int8_t lamp[4], anylamp, emits, turned;
} U;
static struct {
  int8_t mvp, color;
} F;
static C3D_Tex white_tex, blob_tex, halo_tex, sky_tex;

static Instance items[SCENE_MAX_ITEMS];
static uint32_t item_count;
static float marks[SCENE_MAX_MARKS * MARK_FIELDS];
static uint32_t mark_count;
static uint32_t room_w = 6, room_d = 6;
static int32_t wallpaper = -1, flooring = -1;
static uint32_t light_mode;
/* How much of each of the day's looks is in the light now (they add to 1): the clock's phase
 * (src/core/clock.ts) between two looks. */
static float w_day = 1, w_dusk, w_night;
static uint32_t phase_a, phase_b;
static float phase_t;
static Look look;
static bool halos_on = true, shadows_on = true;
static float clock_s;

/* The shell: vertices in the pack's layout, three draws (floor, walls, trim). */
static uint8_t *shell;
static uint32_t shell_bytes;
static struct {
  uint32_t first, count;
} shell_part[3];
static bool shell_dirty = true;

/* The most dots drawn along the way a tap sent the player. */
#define ROUTE_DOTS 48
/* Quads for shadows, halos, marks and the route, written each frame. */
/* What the island's things may add: a shadow under each, the fish's, the line. */
#define THING_QUADS 170
#define FLAT_MAX 6 * (SCENE_MAX_ITEMS * 2 + SCENE_MAX_MARKS * 5 + ROUTE_DOTS + THING_QUADS + 10)
/* One pool for each screen, each written on alternate frames: a frame's quads stay put until the GPU
 * has read them, whichever screen the driver submits first. */
static FlatVertex *flat[2][2];
static uint32_t flat_used, flat_frame, flat_pool;

/* The camera: goals the interface sets, eased toward. */
static struct {
  float yaw, pitch, zoom;
} cam_goal = {0, 0, 1}, cam_shown = {0, 0, 1};
static C3D_Mtx top_proj, top_view;
static float eye[3];
/* The eye's distance from the target, for the stereo offset and the far plane. */
static float top_distance;
/* The view's half angles' tangents and their secants, for culling (worked out once). */
static float tan_v, tan_h, sec_v, sec_h;

static struct {
  uint32_t mode, layers;
  float x0, y0, scale;
  uint32_t paper;
  bool dirty;
} plan = {.mode = PLAN_OFF, .layers = 3, .scale = 24, .paper = 0xf7efe0};

/* The plan is drawn into a canvas when it changes, and the canvas onto the touch screen each frame: a
 * still plan costs one quad. The canvas holds the picture as the rotated screen does (Pocket Studio's
 * preview canvas): picture up runs along +u, picture right along -v. */
static C3D_Tex plan_tex;
static C3D_RenderTarget *plan_rt;
static bool settled = true;
static uint32_t plan_renders;

static SceneStats stats;

/* ---------------------------------------------------------------- the island's state */

static uint32_t place = PLACE_ROOM;
static float player[PLAYER_FIELDS];
static float follow_goal[3], follow_shown[3];
static bool follow_set;
static C3D_Tex round_tex, ring_tex, dot_tex;
/* The game's clock, in seconds: the route's marker pulses by it. */
static float game_seconds;
/* The tool in the player's hand (an item). */
static uint32_t held_tool;
/* The lamps' light kept with what stands still (light_variant): which draws are lit by it, each
 * variant's own emission before it, and the lighting each was lit for. */
static uint8_t *draw_lit;
static uint8_t **own_emit;
static uint32_t *lit_for, lighting = 1;
/* Variants lit a frame at most: what comes into view together is lit over a few frames, drawn with
 * the shader's lamps until then, so that no frame pays for many. */
enum { LIGHT_PER_FRAME = 1 };
static uint32_t lit_this_frame;
/* The island's things the core lists to draw this frame (pi_things_view), VIEW_FIELDS numbers each. */
static const float *view_data;
static uint32_t view_count;
static float frame_ms_avg = 16.7f;
static uint64_t last_tick;

/* ---------------------------------------------------------------- textures made here */

static void texture_from(C3D_Tex *tex, uint32_t size, void (*texel)(float, float, uint8_t *)) {
  C3D_TexInit(tex, size, size, GPU_RGBA8);
  uint8_t *data = tex->data;
  for (uint32_t ty = 0; ty < size; ty += 8)
    for (uint32_t tx = 0; tx < size; tx += 8)
      for (uint32_t y = 0; y < 8; y++)
        for (uint32_t x = 0; x < 8; x++) {
          uint32_t row = size - 1 - (ty + y), column = tx + x;
          uint32_t morton = (x & 1) | ((y & 1) << 1) | ((x & 2) << 1) | ((y & 2) << 2) | ((x & 4) << 2) | ((y & 4) << 3);
          uint8_t rgba[4];
          texel((column + 0.5f) / size * 2 - 1, (row + 0.5f) / size * 2 - 1, rgba);
          uint8_t *out = data + (((ty / 8) * (size / 8) + tx / 8) * 64 + morton) * 4;
          out[0] = rgba[3], out[1] = rgba[2], out[2] = rgba[1], out[3] = rgba[0];
        }
  C3D_TexFlush(tex);
  C3D_TexSetFilter(tex, GPU_LINEAR, GPU_LINEAR);
  C3D_TexSetWrap(tex, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);
}

static void white_texel(float x, float y, uint8_t *o) {
  (void)x, (void)y;
  o[0] = o[1] = o[2] = o[3] = 255;
}

/* A soft rounded rectangle: the shadow under a footprint the quad is fitted to. */
static void blob_texel(float x, float y, uint8_t *o) {
  float r = powf(powf(fabsf(x), 4) + powf(fabsf(y), 4), 0.25f);
  float t = clampf((1.0f - r) / 0.45f, 0, 1);
  o[0] = o[1] = o[2] = 255;
  o[3] = (uint8_t)(255 * t * t * (3 - 2 * t));
}

/* A soft round shadow: under a tree, a rock, the player. */
static void round_texel(float x, float y, uint8_t *o) {
  float t = clampf((1.0f - sqrtf(x * x + y * y)) / 0.6f, 0, 1);
  o[0] = o[1] = o[2] = 255;
  o[3] = (uint8_t)(255 * t * t * (3 - 2 * t));
}

/* Where a walk ends: a ring with soft edges. */
static void ring_texel(float x, float y, uint8_t *o) {
  float r = sqrtf(x * x + y * y);
  float t = clampf(1.0f - fabsf(r - 0.76f) / 0.2f, 0, 1);
  o[0] = o[1] = o[2] = 255;
  o[3] = (uint8_t)(255 * clampf(t * 1.6f, 0, 1));
}

/* A dot along the way: round, with a crisp edge. */
static void dot_texel(float x, float y, uint8_t *o) {
  float t = clampf((0.92f - sqrtf(x * x + y * y)) / 0.14f, 0, 1);
  o[0] = o[1] = o[2] = 255;
  o[3] = (uint8_t)(255 * t);
}

/* The browser's halo: a bright middle that fades fast, then slowly. */
static void halo_texel(float x, float y, uint8_t *o) {
  float r = sqrtf(x * x + y * y);
  float a = r < 0.18f ? 0.42f - (0.42f - 0.16f) * r / 0.18f : r < 0.45f ? 0.16f - (0.16f - 0.04f) * (r - 0.18f) / 0.27f : r < 1 ? 0.04f * (1 - (r - 0.45f) / 0.55f) : 0;
  o[0] = o[1] = o[2] = 255;
  o[3] = (uint8_t)(255 * clampf(a, 0, 1));
}

static Rgb sky_top, sky_bottom;
static bool sky_stars;
static void sky_texel(float x, float y, uint8_t *o) {
  /* y runs -1 at the bottom row to 1 at the top. */
  Rgb c = mixc(sky_bottom, sky_top, (y + 1) / 2);
  if (sky_stars) {
    int cx = (int)((x + 1) * 16), cy = (int)((y + 1) * 16);
    if (((cx * 37 + cy * 53) % 41) == 0 && y > -0.3f) c = hex(0xfff8dc);
  }
  o[0] = (uint8_t)(255 * c.r), o[1] = (uint8_t)(255 * c.g), o[2] = (uint8_t)(255 * c.b), o[3] = 255;
}

/* ---------------------------------------------------------------- the shell, from src/scene/shell.ts */

typedef struct {
  int16_t p[4];
  int8_t n[4];
  uint8_t c[4];
  uint8_t e[4];
  int16_t uv[2];
} PackedVertex;
_Static_assert(sizeof(PackedVertex) == PACK_VERTEX_BYTES, "vertex");

static PackedVertex *shell_v;
static uint32_t shell_n, shell_cap;

static void shell_vertex(float x, float y, float z, float nx, float ny, float nz, Rgb c, float u, float v) {
  if (shell_n >= shell_cap) return;
  PackedVertex *o = &shell_v[shell_n++];
  o->p[0] = (int16_t)lroundf(x * 2048), o->p[1] = (int16_t)lroundf(y * 2048), o->p[2] = (int16_t)lroundf(z * 2048), o->p[3] = 0;
  o->n[0] = (int8_t)(nx * 127), o->n[1] = (int8_t)(ny * 127), o->n[2] = (int8_t)(nz * 127), o->n[3] = 0;
  o->c[0] = (uint8_t)(255 * c.r), o->c[1] = (uint8_t)(255 * c.g), o->c[2] = (uint8_t)(255 * c.b), o->c[3] = 255;
  memset(o->e, 0, 4);
  o->uv[0] = (int16_t)clampf(u * 1024, -32767, 32767), o->uv[1] = (int16_t)clampf(v * 1024, -32767, 32767);
}

/* A quad from four corners, counter-clockwise seen from where its normal points, as two triangles. */
static void shell_quad(const float a[3], const float b[3], const float c[3], const float d[3], const float n[3], Rgb color, const float uv[8]) {
  const float *corner[6] = {a, b, c, a, c, d};
  const int k[6] = {0, 1, 2, 0, 2, 3};
  for (int i = 0; i < 6; i++) shell_vertex(corner[i][0], corner[i][1], corner[i][2], n[0], n[1], n[2], color, uv[k[i] * 2], uv[k[i] * 2 + 1]);
}

static void shell_box(float cx, float cy, float cz, float sx, float sy, float sz, Rgb color, bool bottom) {
  const float x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  static const float uv[8] = {0, 0, 1, 0, 1, 1, 0, 1};
  /* +y, +z, -z, +x, -x, -y */
  shell_quad((float[]){x0, y1, z1}, (float[]){x1, y1, z1}, (float[]){x1, y1, z0}, (float[]){x0, y1, z0}, (float[]){0, 1, 0}, color, uv);
  shell_quad((float[]){x0, y0, z1}, (float[]){x1, y0, z1}, (float[]){x1, y1, z1}, (float[]){x0, y1, z1}, (float[]){0, 0, 1}, scale(color, 0.92f), uv);
  shell_quad((float[]){x1, y0, z0}, (float[]){x0, y0, z0}, (float[]){x0, y1, z0}, (float[]){x1, y1, z0}, (float[]){0, 0, -1}, color, uv);
  shell_quad((float[]){x1, y0, z1}, (float[]){x1, y0, z0}, (float[]){x1, y1, z0}, (float[]){x1, y1, z1}, (float[]){1, 0, 0}, color, uv);
  shell_quad((float[]){x0, y0, z0}, (float[]){x0, y0, z1}, (float[]){x0, y1, z1}, (float[]){x0, y1, z0}, (float[]){-1, 0, 0}, color, uv);
  if (bottom) shell_quad((float[]){x0, y0, z0}, (float[]){x1, y0, z0}, (float[]){x1, y0, z1}, (float[]){x0, y0, z1}, (float[]){0, -1, 0}, color, uv);
}

static void build_shell(void) {
  const float w = (float)room_w, d = (float)room_d, H = WALL_HEIGHT, hw = w / 2, hd = d / 2;
  shell_cap = 6 * 64;
  if (!shell) shell = linearAlloc(shell_cap * sizeof(PackedVertex));
  if (!shell) return;
  shell_v = (PackedVertex *)shell;
  shell_n = 0;
  const PackFinish *floor = flooring >= 0 && (uint32_t)flooring < P->finish_count ? &P->finishes[flooring] : NULL;
  const PackFinish *paper = wallpaper >= 0 && (uint32_t)wallpaper < P->finish_count ? &P->finishes[wallpaper] : NULL;
  const Rgb white = {1, 1, 1};
  /* The floor: the flooring repeats every `span` tiles. */
  float su = floor ? floor->span[0] : 2, sv = floor ? floor->span[1] : 2;
  shell_part[0].first = shell_n;
  shell_quad((float[]){-hw, 0, hd}, (float[]){hw, 0, hd}, (float[]){hw, 0, -hd}, (float[]){-hw, 0, -hd}, (float[]){0, 1, 0}, white,
             (float[]){0, 0, w / su, 0, w / su, d / sv, 0, d / sv});
  shell_part[0].count = shell_n - shell_part[0].first;
  /* The walls: one tile of wallpaper across, the wall's height tall. */
  float pu = paper ? paper->span[0] : 1;
  shell_part[1].first = shell_n;
  shell_quad((float[]){-hw, 0, -hd}, (float[]){hw, 0, -hd}, (float[]){hw, H, -hd}, (float[]){-hw, H, -hd}, (float[]){0, 0, 1}, white, (float[]){0, 0, w / pu, 0, w / pu, 1, 0, 1});
  shell_quad((float[]){-hw, 0, hd}, (float[]){-hw, 0, -hd}, (float[]){-hw, H, -hd}, (float[]){-hw, H, hd}, (float[]){1, 0, 0}, white, (float[]){d / pu, 0, 0, 0, 0, 1, d / pu, 1});
  shell_quad((float[]){hw, 0, -hd}, (float[]){hw, 0, hd}, (float[]){hw, H, hd}, (float[]){hw, H, -hd}, (float[]){-1, 0, 0}, white, (float[]){0, 0, d / pu, 0, d / pu, 1, 0, 1});
  shell_part[1].count = shell_n - shell_part[1].first;
  /* The slab under the room, the walls' bodies (their cut tops and front ends show), the skirting. */
  shell_part[2].first = shell_n;
  /* Its sizes and colours are the browser's (src/scene/shell.ts SHELL, DOORMAT; the pack's SCEN). */
  const PackScene *sc = P->scene;
  const float WALL_T = sc->wall_t, SLAB = sc->slab, SKIRT_H = sc->skirt_h, SKIRT_D = sc->skirt_d;
  Rgb cap = paper ? rgba(paper->cap) : rgba(sc->cap_color), skirt = paper ? rgba(paper->skirting) : rgba(sc->skirt_color);
  shell_box(0, -SLAB / 2 - 0.001f, -WALL_T / 2, w + WALL_T * 2, SLAB, d + WALL_T, rgba(sc->slab_color), false);
  shell_box(0, H / 2 - 0.01f, -hd - WALL_T / 2 - 0.002f, w + WALL_T * 2, H + 0.02f, WALL_T, cap, false);
  shell_box(-hw - WALL_T / 2 - 0.002f, H / 2 - 0.01f, -WALL_T / 2, WALL_T, H + 0.02f, d + WALL_T, cap, false);
  shell_box(hw + WALL_T / 2 + 0.002f, H / 2 - 0.01f, -WALL_T / 2, WALL_T, H + 0.02f, d + WALL_T, cap, false);
  shell_box(0, SKIRT_H / 2, -hd + SKIRT_D / 2, w, SKIRT_H, SKIRT_D, skirt, false);
  shell_box(-hw + SKIRT_D / 2, SKIRT_H / 2, 0, SKIRT_D, SKIRT_H, d, skirt, false);
  shell_box(hw - SKIRT_D / 2, SKIRT_H / 2, 0, SKIRT_D, SKIRT_H, d, skirt, false);
  /* The doormat inside the doorway. */
  const float mz = hd - sc->mat_d / 2 - sc->mat_inset, inner = 2 * sc->mat_border;
  shell_box(0, sc->mat_h / 2, mz, sc->mat_w, sc->mat_h, sc->mat_d, rgba(sc->mat_border_color), false);
  shell_box(0, sc->mat_h / 2 + 0.002f, mz, sc->mat_w - inner, sc->mat_h + 0.004f, sc->mat_d - inner, rgba(sc->mat_color), false);
  shell_part[2].count = shell_n - shell_part[2].first;
  shell_bytes = shell_n * sizeof(PackedVertex);
  GSPGPU_FlushDataCache(shell, shell_bytes);
  shell_dirty = false;
}

/* ---------------------------------------------------------------- setup */

static bool program(DVLB_s **dvlb, shaderProgram_s *prog, const u8 *bin, u32 size) {
  *dvlb = DVLB_ParseFile((u32 *)bin, size);
  if (!*dvlb) return false;
  shaderProgramInit(prog);
  return shaderProgramSetVsh(prog, &(*dvlb)->DVLE[0]) == 0;
}

bool scene_init(const Pack *pack) {
  P = pack;
  /* Without the pack (missing, or of another version) there is nothing to draw by: the interface
   * shows why (island.info().error). */
  if (!P->looks || !P->scene) return false;
  if (!program(&room_dvlb, &room_prog, room_shbin, room_shbin_size) || !program(&flat_dvlb, &flat_prog, flat_shbin, flat_shbin_size)) return false;
  shaderInstance_s *vs = room_prog.vertexShader;
#define LOC(field, name) U.field = shaderInstanceGetUniformLocation(vs, name)
  LOC(mvp, "mvp"), LOC(model, "model"), LOC(scales, "scales"), LOC(inst, "inst"), LOC(tint, "tint"), LOC(hemi, "hemi"), LOC(tilt, "tilt");
  LOC(keydir, "keydir"), LOC(keycol, "keycol"), LOC(frontdir, "frontdir"), LOC(frontcol, "frontcol"), LOC(lamppos, "lamppos"), LOC(lampcol, "lampcol"), LOC(shade, "shade");
  LOC(lamp[0], "lamp0"), LOC(lamp[1], "lamp1"), LOC(lamp[2], "lamp2"), LOC(lamp[3], "lamp3"), LOC(anylamp, "anylamp"), LOC(emits, "emits"), LOC(turned, "turned");
#undef LOC
  F.mvp = shaderInstanceGetUniformLocation(flat_prog.vertexShader, "mvp");
  F.color = shaderInstanceGetUniformLocation(flat_prog.vertexShader, "color");
  texture_from(&white_tex, 8, white_texel);
  draw_lit = calloc(P->draw_count + 1, 1);
  own_emit = calloc(P->variant_count + 1, sizeof *own_emit);
  lit_for = calloc(P->variant_count + 1, sizeof *lit_for);
  texture_from(&blob_tex, 64, blob_texel);
  texture_from(&halo_tex, 64, halo_texel);
  texture_from(&round_tex, 64, round_texel);
  texture_from(&ring_tex, 64, ring_texel);
  texture_from(&dot_tex, 32, dot_texel);
  C3D_TexInit(&sky_tex, 32, 32, GPU_RGBA8);
  for (int i = 0; i < 4; i++)
    if (!(flat[i / 2][i % 2] = linearAlloc(FLAT_MAX * sizeof(FlatVertex)))) return false;
  if (!C3D_TexInitVRAM(&plan_tex, 256, 512, GPU_RGBA8)) return false;
  C3D_TexSetFilter(&plan_tex, GPU_NEAREST, GPU_NEAREST);
  C3D_TexSetWrap(&plan_tex, GPU_CLAMP_TO_EDGE, GPU_CLAMP_TO_EDGE);
  plan_rt = C3D_RenderTargetCreateFromTex(&plan_tex, GPU_TEXFACE_2D, 0, GPU_RB_DEPTH16);
  if (!plan_rt) return false;
  scene_light(0, 0, 0, 0);
  last_tick = svcGetSystemTick();
  return true;
}

void scene_shutdown(void) {
  if (own_emit)
    for (uint32_t i = 0; i < P->variant_count; i++) free(own_emit[i]);
  free(own_emit), free(lit_for), free(draw_lit);
  own_emit = NULL, lit_for = NULL, draw_lit = NULL;
  if (plan_rt) C3D_RenderTargetDelete(plan_rt);
  C3D_TexDelete(&plan_tex);
  if (shell) linearFree(shell);
  for (int i = 0; i < 4; i++)
    if (flat[i / 2][i % 2]) linearFree(flat[i / 2][i % 2]);
  C3D_TexDelete(&white_tex);
  C3D_TexDelete(&blob_tex);
  C3D_TexDelete(&halo_tex);
  C3D_TexDelete(&round_tex);
  C3D_TexDelete(&ring_tex);
  C3D_TexDelete(&dot_tex);
  C3D_TexDelete(&sky_tex);
  shaderProgramFree(&room_prog);
  shaderProgramFree(&flat_prog);
  if (room_dvlb) DVLB_Free(room_dvlb);
  if (flat_dvlb) DVLB_Free(flat_dvlb);
}

/* ---------------------------------------------------------------- what the interface hands over */

void scene_room(uint32_t w, uint32_t d, int32_t paper, int32_t floor, const float *list, uint32_t count) {
  if (w != room_w || d != room_d || paper != wallpaper || floor != flooring) shell_dirty = true;
  room_w = w ? w : 6, room_d = d ? d : 6, wallpaper = paper, flooring = floor;
  if (count > SCENE_MAX_ITEMS) count = SCENE_MAX_ITEMS;
  static Instance next[SCENE_MAX_ITEMS];
  for (uint32_t i = 0; i < count; i++) {
    const float *f = list + i * ITEM_FIELDS;
    Instance n = {.id = (uint32_t)f[ITEM_ID], .item = (uint32_t)f[ITEM_INDEX], .variant = (uint32_t)f[ITEM_VARIANT], .x = f[ITEM_X], .y = f[ITEM_Y], .z = f[ITEM_Z], .yaw = f[ITEM_YAW],
                  .on = f[ITEM_ON] > 0.5f, .flags = (uint32_t)f[ITEM_FLAGS], .layer = (uint32_t)f[ITEM_LAYER]};
    /* An item that was here keeps where it is drawn and eases to where it now is. */
    Instance *was = NULL;
    for (uint32_t k = 0; k < item_count; k++)
      if (items[k].id == n.id) was = &items[k];
    if (was && was->item == n.item) {
      memcpy(n.shown, was->shown, sizeof n.shown);
      n.pop = was->pop;
    } else {
      n.shown[0] = n.x, n.shown[1] = n.y, n.shown[2] = n.z, n.shown[3] = n.yaw;
      n.pop = item_count ? 0 : 1;
    }
    next[i] = n;
  }
  memcpy(items, next, count * sizeof *items);
  item_count = count;
  plan.dirty = true;
}

void scene_marks(const float *list, uint32_t count) {
  if (count > SCENE_MAX_MARKS) count = SCENE_MAX_MARKS;
  memcpy(marks, list, count * MARK_FIELDS * sizeof(float));
  mark_count = count;
  plan.dirty = true;
}

/* Two looks mixed: colours and amounts in proportion, the stars once it is more night than not. */
static Look look_mix(Look a, Look b, float t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  Look l = a;
  l.key = mixc(a.key, b.key, t), l.sky = mixc(a.sky, b.sky, t), l.ground = mixc(a.ground, b.ground, t);
  l.key_power = a.key_power + (b.key_power - a.key_power) * t;
  l.fill = a.fill + (b.fill - a.fill) * t, l.env = a.env + (b.env - a.env) * t;
  Rgb bg = mixc(hex(a.background), hex(b.background), t);
  l.background = (uint32_t)(bg.r * 255) << 16 | (uint32_t)(bg.g * 255) << 8 | (uint32_t)(bg.b * 255);
  l.window_top = mixc(a.window_top, b.window_top, t), l.window_bottom = mixc(a.window_bottom, b.window_bottom, t);
  l.stars = t < 0.5f ? a.stars : b.stars;
  l.window_strength = a.window_strength + (b.window_strength - a.window_strength) * t;
  l.lamp = a.lamp + (b.lamp - a.lamp) * t, l.halo = a.halo + (b.halo - a.halo) * t;
  return l;
}

void scene_light(uint32_t mode, uint32_t a, uint32_t b, float t) {
  light_mode = mode > 2 ? 0 : mode;
  phase_a = a > 2 ? 0 : a, phase_b = b > 2 ? 0 : b, phase_t = clampf(t, 0, 1);
  float w[3] = {0, 0, 0};
  w[phase_a] += 1 - phase_t;
  w[phase_b] += phase_t;
  w_day = w[0], w_dusk = w[1], w_night = w[2];
  look = look_mix(look_for(light_mode, phase_a), look_for(light_mode, phase_b), phase_t);
  sky_top = look.window_top, sky_bottom = look.window_bottom, sky_stars = look.stars;
  C3D_TexDelete(&sky_tex);
  texture_from(&sky_tex, 32, sky_texel);
  plan.dirty = true;
}

/* The view's zoom as it starts, and as the ZL and ZR together put it back: outdoors nearer than the
 * browser's span of ground (on the small upper screen the player and what they reach want room),
 * the room framed whole. */
#define ISLAND_ZOOM 0.67f
static float default_zoom(void) { return place == PLACE_ISLAND ? ISLAND_ZOOM : 1.0f; }

void scene_camera(float yaw, float pitch, float zoom, bool reset) {
  if (reset) cam_goal.yaw = 0, cam_goal.pitch = 0, cam_goal.zoom = default_zoom();
  /* Outdoors the camera turns only a little, as the browser's does (src/scene/rig.ts). */
  bool out = place == PLACE_ISLAND;
  cam_goal.yaw = clampf(cam_goal.yaw + yaw, out ? -0.3f : -0.6f, out ? 0.3f : 0.6f);
  cam_goal.pitch = clampf(cam_goal.pitch + pitch, out ? -0.3f : -0.35f, out ? 0.35f : 0.55f);
  if (zoom > 0) cam_goal.zoom = clampf(cam_goal.zoom * zoom, out ? 0.6f : 0.5f, out ? 1.45f : 1.3f);
}

void scene_plan(uint32_t mode, float x0, float y0, float scale_px, uint32_t layers, uint32_t paper) {
  plan.mode = mode, plan.x0 = x0, plan.y0 = y0, plan.scale = scale_px, plan.layers = layers, plan.paper = paper;
  plan.dirty = true;
}

/* The player from the island's core, as the interface's scripts left it this frame: the place, where
 * the player stands (room tiles from the room's middle indoors), the pose; outdoors, the camera's
 * goal. A change of place puts the camera back and snaps it to the player. */
static void read_game(void) {
  const double *g = pi_game_state();
  uint32_t now = g[GS_PLACE] > 0.5 ? PLACE_ROOM : PLACE_ISLAND;
  bool changed = now != place || !follow_set;
  place = now;
  float x = (float)g[GS_X], y = (float)g[GS_Y], z = (float)g[GS_Z];
  if (place == PLACE_ROOM) x -= room_w / 2.0f, y = 0, z -= room_d / 2.0f;
  float yaw = (float)g[GS_YAW];
  game_seconds = (float)g[GS_SECONDS];
  held_tool = place == PLACE_ISLAND ? (uint32_t)g[GS_HELD] : 0;
  const double *p = pi_game_pose();
  float pose[PLAYER_FIELDS] = {x, y, z, yaw, (float)p[POSE_BOB], (float)p[POSE_LEAN], (float)p[POSE_HEAD], (float)p[POSE_ARM_L], (float)p[POSE_ARM_R],
                               (float)p[POSE_ARM_OUT], (float)p[POSE_LEG_L], (float)p[POSE_LEG_R], (float)p[POSE_BREATH], 1};
  memcpy(player, pose, sizeof player);
  if (place == PLACE_ISLAND) {
    follow_goal[0] = x, follow_goal[1] = y, follow_goal[2] = z;
    if (changed) memcpy(follow_shown, follow_goal, sizeof follow_shown);
    follow_set = true;
  }
  if (changed) {
    cam_goal.yaw = cam_goal.pitch = 0;
    cam_goal.zoom = default_zoom();
    cam_shown.zoom = cam_goal.zoom;
    plan.dirty = true;
  }
}

void scene_options(bool halos, bool shadows) {
  halos_on = halos;
  shadows_on = shadows;
}

/* ---------------------------------------------------------------- each frame */

static float ease(float from, float to, float k) { return from + (to - from) * k; }

void scene_step(float dt) {
  clock_s += dt;
  lit_this_frame = 0;
  flat_frame++;
  float q = 1 - expf(-dt / 0.12f);
  cam_shown.yaw = ease(cam_shown.yaw, cam_goal.yaw, q);
  cam_shown.pitch = ease(cam_shown.pitch, cam_goal.pitch, q);
  cam_shown.zoom = ease(cam_shown.zoom, cam_goal.zoom, q);
  float f = 1 - expf(-dt / 0.18f);
  for (int i = 0; i < 3; i++) follow_shown[i] = ease(follow_shown[i], follow_goal[i], f);
  float k = 1 - expf(-dt / 0.07f);
  bool was = settled;
  settled = true;
  for (uint32_t i = 0; i < item_count; i++) {
    Instance *it = &items[i];
    it->shown[0] = ease(it->shown[0], it->x, k);
    it->shown[1] = ease(it->shown[1], it->y + (it->flags & MARK_HELD ? 0.12f : 0), k);
    it->shown[2] = ease(it->shown[2], it->z, k);
    float dyaw = it->yaw - it->shown[3];
    while (dyaw > PI) dyaw -= 2 * PI;
    while (dyaw < -PI) dyaw += 2 * PI;
    it->shown[3] += dyaw * k;
    it->pop = fminf(1, it->pop + dt / 0.18f);
    float goal_y = it->y + (it->flags & MARK_HELD ? 0.12f : 0);
    if (fabsf(it->shown[0] - it->x) > 1e-3f || fabsf(it->shown[1] - goal_y) > 1e-3f || fabsf(it->shown[2] - it->z) > 1e-3f || fabsf(dyaw) > 1e-3f || it->pop < 1) settled = false;
  }
  /* The plan follows what eases, and is drawn once more when it comes to rest. */
  if (!settled || !was) plan.dirty = true;
  uint64_t now = svcGetSystemTick();
  float ms = (float)(now - last_tick) * 1000.0f / SYSCLOCK_ARM11;
  last_tick = now;
  frame_ms_avg += (ms - frame_ms_avg) * 0.05f;
  stats.frame_ms = frame_ms_avg;
  stats.fps = 1000.0f / frame_ms_avg;
  stats.gpu_ms = C3D_GetDrawingTime();
}

/* ---------------------------------------------------------------- drawing */

typedef struct {
  float hemi_sky[3], hemi_ground[3], key[3], front[3];
  float lamp_pos[LAMPS][4], lamp_col[LAMPS][4];
  /* How far each lamp's light reaches; 0 for a lamp that is not there. */
  float lamp_reach[LAMPS];
} Lights;

static Lights lights;

/* Each lamp's program runs only for what it can reach: the shell takes every lamp that is on, a piece
 * of furniture those within their distance of its bounds. */
static void lamps_for(const float centre[3], float radius) {
  bool any = false;
  for (int i = 0; i < LAMPS; i++) {
    bool reach = false;
    if (lights.lamp_reach[i] > 0) {
      float dx = centre[0] - lights.lamp_pos[i][0], dy = centre[1] - lights.lamp_pos[i][1], dz = centre[2] - lights.lamp_pos[i][2];
      float r = lights.lamp_reach[i] + radius;
      reach = radius < 0 || dx * dx + dy * dy + dz * dz < r * r;
    }
    C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.lamp[i], reach);
    any = any || reach;
  }
  C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.anylamp, any);
}


static void room_state(void) {
  C3D_BindProgram(&room_prog);
  C3D_AttrInfo *attr = C3D_GetAttrInfo();
  AttrInfo_Init(attr);
  AttrInfo_AddLoader(attr, 0, GPU_SHORT, 4);
  AttrInfo_AddLoader(attr, 1, GPU_BYTE, 4);
  AttrInfo_AddLoader(attr, 2, GPU_UNSIGNED_BYTE, 4);
  AttrInfo_AddLoader(attr, 3, GPU_UNSIGNED_BYTE, 4);
  AttrInfo_AddLoader(attr, 4, GPU_SHORT, 2);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.scales, PACK_POS_SCALE, 1.0f / 127, 1.0f / 255, PACK_UV_SCALE);
  /* The hemisphere as the shader takes it: the mean of the sky and the floor, and half their difference. */
  const float *sk = lights.hemi_sky, *gr = lights.hemi_ground;
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.hemi, (sk[0] + gr[0]) / 2, (sk[1] + gr[1]) / 2, (sk[2] + gr[2]) / 2, 0);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tilt, (sk[0] - gr[0]) / 2, (sk[1] - gr[1]) / 2, (sk[2] - gr[2]) / 2, 0);
  C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.turned, true);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.keydir, KEY_DIR[0], KEY_DIR[1], KEY_DIR[2], 0);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.keycol, lights.key[0], lights.key[1], lights.key[2], 0);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.frontdir, FRONT_DIR[0], FRONT_DIR[1], FRONT_DIR[2], 0);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.frontcol, lights.front[0], lights.front[1], lights.front[2], 0);
  for (int i = 0; i < LAMPS; i++) {
    C3D_FVUnifSet(GPU_VERTEX_SHADER, U.lamppos + i, lights.lamp_pos[i][0], lights.lamp_pos[i][1], lights.lamp_pos[i][2], lights.lamp_pos[i][3]);
    C3D_FVUnifSet(GPU_VERTEX_SHADER, U.lampcol + i, lights.lamp_col[i][0], lights.lamp_col[i][1], lights.lamp_col[i][2], lights.lamp_col[i][3]);
  }
  /* wrap: n.l x 0.75 + 0.25 */
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.shade, 0.75f, 0.25f, LAMP_CAP, 0);
  C3D_AlphaTest(true, GPU_GREATER, 32);
  C3D_TexEnv *env = C3D_GetTexEnv(0);
  C3D_TexEnvInit(env);
  C3D_TexEnvSrc(env, C3D_Both, GPU_TEXTURE0, GPU_PRIMARY_COLOR, 0);
  C3D_TexEnvFunc(env, C3D_Both, GPU_MODULATE);
  for (int i = 1; i < 6; i++) C3D_TexEnvInit(C3D_GetTexEnv(i));
}

static void flat_state(void) {
  C3D_BindProgram(&flat_prog);
  C3D_AttrInfo *attr = C3D_GetAttrInfo();
  AttrInfo_Init(attr);
  AttrInfo_AddLoader(attr, 0, GPU_FLOAT, 3);
  AttrInfo_AddLoader(attr, 1, GPU_FLOAT, 2);
  /* Shadows and halos fade to nothing at their edges. */
  C3D_AlphaTest(false, GPU_ALWAYS, 0);
  C3D_TexEnv *env = C3D_GetTexEnv(0);
  C3D_TexEnvInit(env);
  C3D_TexEnvSrc(env, C3D_Both, GPU_TEXTURE0, GPU_PRIMARY_COLOR, 0);
  C3D_TexEnvFunc(env, C3D_Both, GPU_MODULATE);
  for (int i = 1; i < 6; i++) C3D_TexEnvInit(C3D_GetTexEnv(i));
}

static void blend(int mode) {
  if (mode == 0) C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_ONE, GPU_ZERO, GPU_ONE, GPU_ZERO);
  else if (mode == 1) C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_SRC_ALPHA, GPU_ONE_MINUS_SRC_ALPHA, GPU_ONE, GPU_ONE_MINUS_SRC_ALPHA);
  else C3D_AlphaBlend(GPU_BLEND_ADD, GPU_BLEND_ADD, GPU_SRC_ALPHA, GPU_ONE, GPU_ZERO, GPU_ONE);
}

static void set_lights(bool plan_view) {
  memset(&lights, 0, sizeof lights);
  if (plan_view) {
    /* The plan is a picture of the room's layout: an even light from above, whatever the hour. */
    const float sky[3] = {0.78f, 0.76f, 0.72f}, ground[3] = {0.5f, 0.46f, 0.42f}, key[3] = {0.26f, 0.25f, 0.23f};
    memcpy(lights.hemi_sky, sky, sizeof sky), memcpy(lights.hemi_ground, ground, sizeof ground), memcpy(lights.key, key, sizeof key);
    return;
  }
  float hemi = look.fill * HEMI_FILL + look.env * HEMI_ENV;
  Rgb s = scale(look.sky, hemi), g = scale(look.ground, hemi), k = scale(look.key, look.key_power * KEY_K), f = scale(look.key, look.key_power * FRONT_K);
  lights.hemi_sky[0] = s.r, lights.hemi_sky[1] = s.g, lights.hemi_sky[2] = s.b;
  lights.hemi_ground[0] = g.r, lights.hemi_ground[1] = g.g, lights.hemi_ground[2] = g.b;
  lights.key[0] = k.r, lights.key[1] = k.g, lights.key[2] = k.b;
  lights.front[0] = f.r, lights.front[1] = f.g, lights.front[2] = f.b;
  /* The lamps that are on, strongest first, as far as the four go. */
  uint32_t chosen[LAMPS];
  float power[LAMPS];
  uint32_t n = 0;
  for (uint32_t i = 0; i < item_count; i++) {
    const Instance *it = &items[i];
    if (!it->on || it->item >= P->item_count) continue;
    const PackItem *def = &P->items[it->item];
    if (!(def->flags & ITEM_LIGHT)) continue;
    float p = def->light_intensity;
    uint32_t at = n < LAMPS ? n++ : LAMPS;
    if (at == LAMPS) {
      uint32_t weakest = 0;
      for (uint32_t k2 = 1; k2 < LAMPS; k2++)
        if (power[k2] < power[weakest]) weakest = k2;
      if (power[weakest] >= p) continue;
      at = weakest;
    }
    chosen[at] = i;
    power[at] = p;
  }
  stats.lamps = n;
  for (uint32_t k2 = 0; k2 < n; k2++) {
    const Instance *it = &items[chosen[k2]];
    const PackItem *def = &P->items[it->item];
    float c = cosf(it->shown[3]), s2 = sinf(it->shown[3]);
    const float *a = def->light_at;
    lights.lamp_pos[k2][0] = it->shown[0] + a[0] * c + a[2] * s2;
    lights.lamp_pos[k2][1] = it->shown[1] + a[1];
    lights.lamp_pos[k2][2] = it->shown[2] - a[0] * s2 + a[2] * c;
    lights.lamp_pos[k2][3] = LAMP_RADIUS * LAMP_RADIUS;
    /* Lamp light leans toward white, so a cream wall does not turn pink. */
    Rgb col = mixc(rgba(def->light_color), (Rgb){1, 1, 1}, 0.35f);
    float dist = def->light_distance * (light_mode == 2 ? 1.0f - 0.2f * w_night : 1.0f);
    col = scale(col, def->light_intensity * look.lamp * LAMP_K);
    lights.lamp_col[k2][0] = col.r, lights.lamp_col[k2][1] = col.g, lights.lamp_col[k2][2] = col.b;
    lights.lamp_col[k2][3] = dist > 0 ? 1.0f / (dist * dist) : 0;
    lights.lamp_reach[k2] = dist;
  }
}

/* The item's model matrix: where it is drawn, turned by yaw, popping in. */
static void model_of(const Instance *it, C3D_Mtx *m) {
  Mtx_Identity(m);
  Mtx_Translate(m, it->shown[0], it->shown[1], it->shown[2], true);
  Mtx_RotateY(m, it->shown[3], true);
  if (it->pop < 1) {
    float s = 0.6f + 0.4f * it->pop;
    Mtx_Scale(m, s, s, s);
  }
}

static C3D_Tex *texture_for(int16_t index) {
  if (index == PACK_TEXTURE_SKY) return &sky_tex;
  C3D_Tex *t = index >= 0 ? pack_texture(index) : NULL;
  return t ? t : &white_tex;
}

/* The plan's matrices mirror one axis: it draws both sides. */
static void set_cull(uint8_t cull, bool plan_view) {
  if (cull == 2 || plan_view) C3D_CullFace(GPU_CULL_NONE);
  else C3D_CullFace(cull == 1 ? GPU_CULL_FRONT_CCW : GPU_CULL_BACK_CCW);
}

/* One instance's draws of one pass (0 opaque, 1 glass). */
static void draw_instance(const Instance *it, const C3D_Mtx *viewproj, int pass, bool plan_view) {
  if (it->item >= P->item_count) return;
  const PackItem *def = &P->items[it->item];
  uint32_t vi = def->first_variant + (it->variant < def->variant_count ? it->variant : 0);
  if (vi >= P->variant_count) return;
  const PackVariant *v = &P->variants[vi];
  const uint8_t *data = pack_variant(vi);
  if (!data) return;
  C3D_Mtx model, mvp;
  model_of(it, &model);
  Mtx_Multiply(&mvp, viewproj, &model);
  {
    float c[3] = {(v->min[0] + v->max[0]) / 2, (v->min[1] + v->max[1]) / 2, (v->min[2] + v->max[2]) / 2};
    float e[3] = {(v->max[0] - v->min[0]) / 2, (v->max[1] - v->min[1]) / 2, (v->max[2] - v->min[2]) / 2};
    float cs = cosf(it->shown[3]), sn = sinf(it->shown[3]);
    float centre[3] = {it->shown[0] + c[0] * cs + c[2] * sn, it->shown[1] + c[1], it->shown[2] - c[0] * sn + c[2] * cs};
    lamps_for(centre, sqrtf(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]));
  }
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, U.mvp, &mvp);
  C3D_FVUnifMtx3x4(GPU_VERTEX_SHADER, U.model, &model);
  C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.turned, true);
  float glow = 0.3f + 0.7f * clampf((look.halo - 0.18f) / 0.82f, 0, 1);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, it->on ? 1.0f : 0.0f, 4.0f * (plan_view ? 0.6f : glow), 1.0f, 1.0f);
  /* A selection breathes a warm glow; an item that cannot go where it is held turns red. */
  float pulse = plan_view ? 0.6f : 0.5f + 0.5f * sinf(clock_s * 5.0f);
  if (it->flags & MARK_REFUSED) C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tint, 0.32f, -0.05f, -0.05f, 0);
  else if (it->flags & (MARK_SELECTED | MARK_HELD)) C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tint, 0.09f + 0.07f * pulse, 0.08f + 0.06f * pulse, 0.03f + 0.02f * pulse, 0);
  else C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tint, 0, 0, 0, 0);
  for (uint32_t k = 0; k < v->draw_count; k++) {
    const PackDraw *dr = &P->draws[v->first_draw + k];
    if ((dr->blend & 1) != pass || !dr->idx_count) continue;
    C3D_BufInfo *buf = C3D_GetBufInfo();
    BufInfo_Init(buf);
    BufInfo_Add(buf, data + dr->vtx, PACK_VERTEX_BYTES, 5, 0x43210);
    C3D_TexBind(0, texture_for(dr->texture));
    if (dr->texture == PACK_TEXTURE_SKY) C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, 1.0f, look.window_strength * 0.82f, 1.0f, 1.0f);
    set_cull(dr->cull, plan_view);
    C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.emits, (dr->blend & 2) != 0);
    C3D_DrawElements(GPU_TRIANGLES, (int)dr->idx_count, C3D_UNSIGNED_SHORT, data + dr->idx);
    if (dr->texture == PACK_TEXTURE_SKY) C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, it->on ? 1.0f : 0.0f, 4.0f * (plan_view ? 0.6f : glow), 1.0f, 1.0f);
    stats.draws++;
    stats.triangles += dr->idx_count / 3;
  }
}

static void draw_shell(const C3D_Mtx *viewproj, uint32_t parts, bool plan_view) {
  if (shell_dirty) build_shell();
  if (!shell) return;
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, U.mvp, viewproj);
  C3D_Mtx identity;
  Mtx_Identity(&identity);
  C3D_FVUnifMtx3x4(GPU_VERTEX_SHADER, U.model, &identity);
  C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.turned, false);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, 0, 0, 1, 1);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tint, 0, 0, 0, 0);
  lamps_for((float[]){0, 0, 0}, -1);
  C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.emits, false);
  C3D_BufInfo *buf = C3D_GetBufInfo();
  BufInfo_Init(buf);
  BufInfo_Add(buf, shell, PACK_VERTEX_BYTES, 5, 0x43210);
  const PackFinish *floor = flooring >= 0 && (uint32_t)flooring < P->finish_count ? &P->finishes[flooring] : NULL;
  const PackFinish *paper = wallpaper >= 0 && (uint32_t)wallpaper < P->finish_count ? &P->finishes[wallpaper] : NULL;
  C3D_CullFace(plan_view ? GPU_CULL_NONE : GPU_CULL_BACK_CCW);
  for (int k = 0; k < 3; k++) {
    if (!(parts & (1u << k)) || !shell_part[k].count) continue;
    C3D_TexBind(0, k == 0 ? texture_for(floor ? floor->texture : -1) : k == 1 ? texture_for(paper ? paper->texture : -1) : &white_tex);
    C3D_DrawArrays(GPU_TRIANGLES, (int)shell_part[k].first, (int)shell_part[k].count);
    stats.draws++;
    stats.triangles += shell_part[k].count / 3;
  }
}

/* ---------------------------------------------------------------- flat quads */

static FlatVertex *flat_begin(void) {
  if (flat_used + 6 > FLAT_MAX) return NULL;
  FlatVertex *v = flat[flat_pool][flat_frame & 1] + flat_used;
  flat_used += 6;
  return v;
}

static void flat_rect(FlatVertex *v, const float a[3], const float b[3], const float c[3], const float d[3]) {
  const float *corner[6] = {a, b, c, a, c, d};
  static const float uv[4][2] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};
  const int k[6] = {0, 1, 2, 0, 2, 3};
  for (int i = 0; i < 6; i++) {
    memcpy(v[i].pos, corner[i], 12);
    memcpy(v[i].uv, uv[k[i]], 8);
  }
}

static void flat_draw(const FlatVertex *v, const C3D_Mtx *mvp, C3D_Tex *tex, float r, float g, float b, float a) {
  C3D_BufInfo *buf = C3D_GetBufInfo();
  BufInfo_Init(buf);
  BufInfo_Add(buf, v, sizeof(FlatVertex), 2, 0x10);
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, F.mvp, mvp);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, F.color, r, g, b, a);
  C3D_TexBind(0, tex);
  C3D_DrawArrays(GPU_TRIANGLES, 0, 6);
  stats.draws++;
}

/* The footprint an item stands on, turned by its yaw. */
static void footprint(const Instance *it, const PackItem *def, float *hw, float *hd) {
  float q = fmodf(fabsf(it->yaw) / (PI / 2) + 0.5f, 2.0f);
  bool turned = q >= 1.0f;
  *hw = (turned ? def->size[1] : def->size[0]) / 2;
  *hd = (turned ? def->size[0] : def->size[1]) / 2;
}

static void draw_shadows(const C3D_Mtx *viewproj, bool plan_view) {
  if (!shadows_on) return;
  float strength = plan_view ? 0.22f : 0.3f * w_day + 0.3f * w_dusk + (light_mode == 2 ? 0.16f : 0.22f) * w_night;
  for (uint32_t i = 0; i < item_count; i++) {
    const Instance *it = &items[i];
    if (it->item >= P->item_count) continue;
    const PackItem *def = &P->items[it->item];
    if (def->kind != KIND_FLOOR && def->kind != KIND_MISC) continue;
    float hw, hd;
    footprint(it, def, &hw, &hd);
    /* A little larger than the footprint, and toward the back right, away from the key. */
    hw = hw * 1.06f + 0.12f, hd = hd * 1.06f + 0.12f;
    float x = it->shown[0] + 0.07f, z = it->shown[2] - 0.05f, y = it->shown[1] - (it->flags & MARK_HELD ? 0.12f : 0) + 0.03f;
    FlatVertex *v = flat_begin();
    if (!v) return;
    flat_rect(v, (float[]){x - hw, y, z + hd}, (float[]){x + hw, y, z + hd}, (float[]){x + hw, y, z - hd}, (float[]){x - hw, y, z - hd});
    flat_draw(v, viewproj, &blob_tex, 0.16f, 0.1f, 0.06f, strength * (it->flags & MARK_HELD ? 0.6f : 1.0f));
  }
}

static void draw_marks(const C3D_Mtx *viewproj, bool plan_view) {
  const float hw = room_w / 2.0f, hd = room_d / 2.0f;
  for (uint32_t i = 0; i < mark_count; i++) {
    const float *m = marks + i * MARK_FIELDS;
    uint32_t kind = (uint32_t)m[MARK_KIND] & 7;
    bool outline = ((uint32_t)m[MARK_KIND] & 8) != 0;
    float a0 = m[MARK_A0], b0 = m[MARK_B0], a1 = m[MARK_A1], b1 = m[MARK_B1], lift = m[MARK_LIFT];
    /* Corners in the room: a floor rectangle in room tiles (0..w, 0..d), a wall's in (u, v). */
    float c[4][3];
    if (kind == 0) {
      float x0 = a0 - hw, x1 = a1 - hw, z0 = b0 - hd, z1 = b1 - hd;
      float y = lift + (plan_view ? 2.6f : 0.045f);
      float q[4][3] = {{x0, y, z1}, {x1, y, z1}, {x1, y, z0}, {x0, y, z0}};
      memcpy(c, q, sizeof q);
    } else if (kind == 1) {
      float z = -hd + 0.03f;
      float q[4][3] = {{a0 - hw, b0, z}, {a1 - hw, b0, z}, {a1 - hw, b1, z}, {a0 - hw, b1, z}};
      memcpy(c, q, sizeof q);
    } else {
      float x = kind == 2 ? -hw + 0.03f : hw - 0.03f;
      float q[4][3] = {{x, b0, a0 - hd}, {x, b0, a1 - hd}, {x, b1, a1 - hd}, {x, b1, a0 - hd}};
      memcpy(c, q, sizeof q);
    }
    if (!outline) {
      FlatVertex *v = flat_begin();
      if (!v) return;
      flat_rect(v, c[0], c[1], c[2], c[3]);
      flat_draw(v, viewproj, &white_tex, m[MARK_R], m[MARK_G], m[MARK_B], m[MARK_ALPHA]);
      continue;
    }
    /* An outline: four thin strips along the edges. */
    float t = plan_view ? 0.06f : 0.05f;
    for (int e = 0; e < 4; e++) {
      const float *p = c[e], *q = c[(e + 1) & 3];
      float dir[3] = {q[0] - p[0], q[1] - p[1], q[2] - p[2]};
      float len = sqrtf(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
      if (len < 1e-4f) continue;
      /* inward: toward the centre of the rectangle */
      float mid[3] = {(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2, (c[0][2] + c[2][2]) / 2};
      float in[3] = {mid[0] - (p[0] + q[0]) / 2, mid[1] - (p[1] + q[1]) / 2, mid[2] - (p[2] + q[2]) / 2};
      float il = sqrtf(in[0] * in[0] + in[1] * in[1] + in[2] * in[2]);
      if (il < 1e-4f) continue;
      for (int k = 0; k < 3; k++) in[k] *= t / il;
      FlatVertex *v = flat_begin();
      if (!v) return;
      flat_rect(v, p, q, (float[]){q[0] + in[0], q[1] + in[1], q[2] + in[2]}, (float[]){p[0] + in[0], p[1] + in[1], p[2] + in[2]});
      flat_draw(v, viewproj, &white_tex, m[MARK_R], m[MARK_G], m[MARK_B], m[MARK_ALPHA]);
    }
  }
}

static void draw_halos(const C3D_Mtx *viewproj) {
  if (!halos_on) return;
  /* Facing the camera: the view's right and up in the room. */
  float right[3] = {top_view.r[0].x, top_view.r[0].y, top_view.r[0].z};
  float up[3] = {top_view.r[1].x, top_view.r[1].y, top_view.r[1].z};
  for (uint32_t i = 0; i < item_count; i++) {
    const Instance *it = &items[i];
    if (!it->on || it->item >= P->item_count) continue;
    const PackItem *def = &P->items[it->item];
    if (!(def->flags & ITEM_LIGHT) || def->halo <= 0) continue;
    float c = cosf(it->shown[3]), s = sinf(it->shown[3]);
    const float *a = def->light_at;
    float p[3] = {it->shown[0] + a[0] * c + a[2] * s, it->shown[1] + a[1], it->shown[2] - a[0] * s + a[2] * c};
    float h = def->halo / 2;
    FlatVertex *v = flat_begin();
    if (!v) return;
    float q[4][3];
    for (int k = 0; k < 4; k++) {
      float sx = k == 0 || k == 3 ? -h : h, sy = k < 2 ? -h : h;
      for (int j = 0; j < 3; j++) q[k][j] = p[j] + right[j] * sx + up[j] * sy;
    }
    flat_rect(v, q[0], q[1], q[2], q[3]);
    Rgb col = mixc(rgba(def->light_color), (Rgb){1, 0.97f, 0.9f}, 0.55f);
    flat_draw(v, viewproj, &halo_tex, col.r, col.g, col.b, 0.9f * look.halo);
  }
}

/* ---------------------------------------------------------------- the island */

static void common_state(void);

/* The sky's light for each time of day outdoors, as the browser's (the pack's LOOK, from
 * src/scene/lighting.ts outdoorLook; the night's lowered for the console by tools/cook.ts). */
typedef struct {
  uint32_t key, sky, ground, background;
  float key_power, fill, env, lamp;
} Outdoor;

static Outdoor outdoor_for(uint32_t time) {
  const PackLook *p = &P->looks[LOOK_ISLAND(time > 2 ? 0 : time)];
  return (Outdoor){rrggbb(p->key), rrggbb(p->sky), rrggbb(p->ground), rrggbb(p->background), p->key_power, p->fill, p->env, p->lamp};
}


static float night_glow(void) { return w_night + 0.55f * w_dusk; }

/* The island's lamps' strength for the hour (0 by day, 1.2 at night), for the light kept with what stands still. */
static float lamp_strength;

/* ---------------------------------------------------------------- the lamps' light, kept
 *
 * The lamps cost a vertex twice the rest of its light (room.v.pica's `lamp`, for each lamp that reaches
 * it), so near the house's three every frame was over its time. Most of what they light stands still
 * a while: the ground's chunks and the cells of props. Their vertices' light from the lamps is worked
 * out here, on the console, the first time each is drawn (as the shader would at the night's
 * strength) and kept in its emission beside the emission it had of its own, which is kept too; a
 * draw so lit takes no lamp in the shader, only the lamps' strength for the hour (draw_variant).
 * When what stands or the lamps change, `scene_relight` has all of it worked out again as it is next
 * drawn, as an island that is reshaped needs. What moves (the player, what lies about, the keeper)
 * keeps the shader's lamps. */
void scene_relight(void) { lighting++; }

static uint16_t read16(const uint8_t *p) { return (uint16_t)(p[0] | p[1] << 8); }


static void light_variant(uint32_t vi, const C3D_Mtx *m) {
  if (!draw_lit || vi >= P->variant_count || lit_for[vi] == lighting || lit_this_frame >= LIGHT_PER_FRAME) return;
  lit_this_frame++;
  uint8_t *data = (uint8_t *)pack_variant(vi);
  if (!data) return;
  const PackVariant *v = &P->variants[vi];
  const PackIsland *isl = P->island;
  /* Every lamp on the island, at its light's height. */
  float lamp[16][3];
  int lamps = 0;
  for (uint32_t i = 0; i < P->instance_count && lamps < 16; i++) {
    const PackInstance *in = &P->instances[i];
    if (in->model < P->model_count && P->models[in->model].flags & MODEL_LAMP) lamp[lamps][0] = in->x, lamp[lamps][1] = in->y + isl->lamp_y, lamp[lamps][2] = in->z, lamps++;
  }
  Rgb col = scale(mixc(rgba(isl->lamp_color), (Rgb){1, 1, 1}, 0.35f), isl->lamp_intensity * LAMP_K * LIT_NIGHT);
  const float c[3] = {col.r, col.g, col.b}, reach = isl->lamp_distance * isl->lamp_distance, cap = LAMP_CAP * LIT_NIGHT, r2 = LAMP_RADIUS * LAMP_RADIUS;
  uint32_t vertices = 0;
  for (uint32_t k = 0; k < v->draw_count; k++) vertices += P->draws[v->first_draw + k].vtx_count;
  /* Its own emission, kept the first time, to be lit from again. */
  if (!own_emit[vi]) {
    own_emit[vi] = malloc(vertices * 4 + 4);
    if (!own_emit[vi]) return;
    uint32_t at = 0;
    for (uint32_t k = 0; k < v->draw_count; k++) {
      const PackDraw *dr = &P->draws[v->first_draw + k];
      for (uint32_t i = 0; i < dr->vtx_count; i++, at++) memcpy(own_emit[vi] + at * 4, data + dr->vtx + i * PACK_VERTEX_BYTES + 16, 4);
    }
  }
  uint32_t at = 0;
  for (uint32_t k = 0; k < v->draw_count; k++) {
    const PackDraw *dr = &P->draws[v->first_draw + k];
    /* Glass and the house's windows keep the shader's lamps. */
    bool lit = lamps > 0 && !(dr->blend & (DRAW_GLASS | DRAW_HOUSE));
    for (uint32_t i = 0; i < dr->vtx_count; i++, at++) {
      uint8_t *vx = data + dr->vtx + i * PACK_VERTEX_BYTES;
      const uint8_t *own = own_emit[vi] + at * 4;
      memcpy(vx + 16, own, 4);
      /* One that always glows keeps its own; one that glows at night adds the lamps to it. */
      if (!lit || own[3]) continue;
      C3D_FVec p = Mtx_MultiplyFVec4(m, FVec4_New((int16_t)read16(vx) * PACK_POS_SCALE, (int16_t)read16(vx + 2) * PACK_POS_SCALE, (int16_t)read16(vx + 4) * PACK_POS_SCALE, 1));
      C3D_FVec n = Mtx_MultiplyFVec3(m, FVec3_New((int8_t)vx[8] / 127.0f, (int8_t)vx[9] / 127.0f, (int8_t)vx[10] / 127.0f));
      float sum[3] = {0, 0, 0};
      for (int q = 0; q < lamps; q++) {
        float dx = lamp[q][0] - p.x, dy = lamp[q][1] - p.y, dz = lamp[q][2] - p.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= reach) continue;
        float window = 1 - d2 / reach, d = sqrtf(d2) + 1e-6f;
        float ndl = fmaxf(0, 0.75f * (dx * n.x + dy * n.y + dz * n.z) / d + 0.25f);
        float k2 = window * window * ndl / (d2 + r2);
        for (int ch = 0; ch < 3; ch++) sum[ch] += fminf(cap, c[ch] * k2);
      }
      for (int ch = 0; ch < 3; ch++) {
        float e = own[ch] + vx[12 + ch] * sum[ch] / LIT_SCALE;
        vx[16 + ch] = (uint8_t)(e > 255 ? 255 : e + 0.5f);
      }
      vx[19] = 0;
    }
    draw_lit[v->first_draw + k] = lit;
  }
  GSPGPU_FlushDataCache(data, v->size);
  lit_for[vi] = lighting;
}

/* How the rooms light the house's windows from outside (src/island/house.ts houseLight): all of their
 * glow under the ceiling light, a little from the lamps that are on when it is off, none when nothing
 * is; a cool ceiling light whiter. Worked out once a frame. */
static float house_glow = 1;
static bool house_cool;
static void house_light(void) {
  house_cool = light_mode == 1;
  if (light_mode != 2) {
    house_glow = 1;
    return;
  }
  uint32_t on = 0;
  for (uint32_t i = 0; i < item_count; i++) {
    const Instance *it = &items[i];
    if (it->on && it->item < P->item_count && P->items[it->item].flags & ITEM_LIGHT) on++;
  }
  house_glow = on ? fminf(0.6f, 0.25f + 0.12f * (float)on) : 0;
}

/* The island's light at the clock's phase: the two looks either side mixed. */
static Outdoor outdoor_now(void) {
  Outdoor a = outdoor_for(phase_a), b = outdoor_for(phase_b);
  float t = phase_t;
  Outdoor o = a;
  Rgb k = mixc(hex(a.key), hex(b.key), t), s = mixc(hex(a.sky), hex(b.sky), t), g = mixc(hex(a.ground), hex(b.ground), t), bg = mixc(hex(a.background), hex(b.background), t);
#define PACK(c) ((uint32_t)((c).r * 255) << 16 | (uint32_t)((c).g * 255) << 8 | (uint32_t)((c).b * 255))
  o.key = PACK(k), o.sky = PACK(s), o.ground = PACK(g), o.background = PACK(bg);
#undef PACK
  o.key_power = a.key_power + (b.key_power - a.key_power) * t;
  o.fill = a.fill + (b.fill - a.fill) * t, o.env = a.env + (b.env - a.env) * t, o.lamp = a.lamp + (b.lamp - a.lamp) * t;
  return o;
}

static void set_island_lights(void) {
  memset(&lights, 0, sizeof lights);
  house_light();
  Outdoor o = outdoor_now();
  float hemi = o.fill * HEMI_FILL + o.env * HEMI_ENV;
  Rgb s = scale(hex(o.sky), hemi), g = scale(hex(o.ground), hemi), k = scale(hex(o.key), o.key_power * KEY_K), f = scale(hex(o.key), o.key_power * FRONT_K * 0.5f);
  lights.hemi_sky[0] = s.r, lights.hemi_sky[1] = s.g, lights.hemi_sky[2] = s.b;
  lights.hemi_ground[0] = g.r, lights.hemi_ground[1] = g.g, lights.hemi_ground[2] = g.b;
  lights.key[0] = k.r, lights.key[1] = k.g, lights.key[2] = k.b;
  lights.front[0] = f.r, lights.front[1] = f.g, lights.front[2] = f.b;
  stats.lamps = 0;
  lamp_strength = o.lamp;
  if (o.lamp <= 0) return;
  /* After dark, the lamps nearest the player. */
  const PackIsland *isl = P->island;
  uint32_t chosen[LAMPS];
  float near[LAMPS];
  uint32_t n = 0;
  for (uint32_t i = 0; i < P->instance_count; i++) {
    const PackInstance *in = &P->instances[i];
    if (in->model >= P->model_count || !(P->models[in->model].flags & MODEL_LAMP)) continue;
    float dx = in->x - follow_shown[0], dz = in->z - follow_shown[2], d = dx * dx + dz * dz;
    uint32_t at = n < LAMPS ? n++ : LAMPS;
    if (at == LAMPS) {
      uint32_t far = 0;
      for (uint32_t q = 1; q < LAMPS; q++)
        if (near[q] > near[far]) far = q;
      if (near[far] <= d) continue;
      at = far;
    }
    chosen[at] = i, near[at] = d;
  }
  stats.lamps = n;
  Rgb col = scale(mixc(rgba(isl->lamp_color), (Rgb){1, 1, 1}, 0.35f), isl->lamp_intensity * o.lamp * LAMP_K);
  for (uint32_t q = 0; q < n; q++) {
    const PackInstance *in = &P->instances[chosen[q]];
    lights.lamp_pos[q][0] = in->x, lights.lamp_pos[q][1] = in->y + isl->lamp_y, lights.lamp_pos[q][2] = in->z;
    lights.lamp_pos[q][3] = LAMP_RADIUS * LAMP_RADIUS;
    lights.lamp_col[q][0] = col.r, lights.lamp_col[q][1] = col.g, lights.lamp_col[q][2] = col.b;
    lights.lamp_col[q][3] = 1.0f / (isl->lamp_distance * isl->lamp_distance);
    lights.lamp_reach[q] = isl->lamp_distance;
  }
}

/* Whether a sphere is in front of the upper screen's camera, from the view (with room for the other eye). */
static bool in_view(const float c[3], float r) {
  const C3D_Mtx *v = &top_view;
  float vx = v->r[0].x * c[0] + v->r[0].y * c[1] + v->r[0].z * c[2] + v->r[0].w;
  float vy = v->r[1].x * c[0] + v->r[1].y * c[1] + v->r[1].z * c[2] + v->r[1].w;
  float depth = -(v->r[2].x * c[0] + v->r[2].y * c[1] + v->r[2].z * c[2] + v->r[2].w);
  r += 0.6f;
  if (depth < -r || depth > top_distance * 3 + 20 + r) return false;
  return fabsf(vx) <= depth * tan_h + r * sec_h && fabsf(vy) <= depth * tan_v + r * sec_v;
}

/* One variant's draws of one pass under a model matrix; `glow` lights what glows after dark. */
static void draw_variant(uint32_t vi, const C3D_Mtx *model, const C3D_Mtx *viewproj, int pass, float glow, const float centre[3], float radius) {
  if (vi >= P->variant_count) return;
  const PackVariant *v = &P->variants[vi];
  bool any = false;
  for (uint32_t k = 0; k < v->draw_count; k++) any = any || (P->draws[v->first_draw + k].blend & 1) == pass;
  if (!any) return;
  const uint8_t *data = pack_variant(vi);
  if (!data) return;
  C3D_Mtx mvp;
  Mtx_Multiply(&mvp, viewproj, model);
  lamps_for(centre, radius);
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, U.mvp, &mvp);
  C3D_FVUnifMtx3x4(GPU_VERTEX_SHADER, U.model, model);
  /* A model that does not turn (only moves) leaves its normals as they are: three instructions a vertex. */
  bool turns = fabsf(model->r[0].y) > 1e-5f || fabsf(model->r[0].z) > 1e-5f || fabsf(model->r[1].x) > 1e-5f || fabsf(model->r[1].z) > 1e-5f || fabsf(model->r[2].x) > 1e-5f || fabsf(model->r[2].y) > 1e-5f;
  C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.turned, turns);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, glow, 4.0f, 1.0f, 1.0f);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tint, 0, 0, 0, 0);
  bool house = false, baked = false;
  for (uint32_t k = 0; k < v->draw_count; k++) {
    const PackDraw *dr = &P->draws[v->first_draw + k];
    /* The GPU hangs on a draw of no triangles (the cook leaves none, but a pack is read as it is). */
    if ((dr->blend & 1) != pass || !dr->idx_count) continue;
    /* The lamps' light kept in its emission (light_variant): no lamp worked out for each vertex, the
     * emission scaled by the lamps' strength for the hour (as kept at the night's). */
    bool lit = draw_lit && draw_lit[v->first_draw + k];
    if (lit != baked) {
      baked = !baked;
      if (baked) {
        for (int i = 0; i < LAMPS; i++) C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.lamp[i], false);
        C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.anylamp, false);
        C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, lamp_strength / LIT_NIGHT, LIT_SCALE, 1.0f, 1.0f);
      } else {
        lamps_for(centre, radius);
        C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, glow, 4.0f, 1.0f, 1.0f);
      }
      house = false;
    }
    /* The house's windows glow as its rooms are lit, at a little over half a lamp's strength so that
     * the light shows its colour instead of white: warm, or under a cool light less of the warm and a
     * cool tint. */
    if (((dr->blend & DRAW_HOUSE) != 0) != house) {
      house = !house;
      float g = house ? glow * house_glow * 0.55f : glow;
      bool cool = house && house_cool;
      C3D_FVUnifSet(GPU_VERTEX_SHADER, U.inst, cool ? g * 0.55f : g, 4.0f, 1.0f, 1.0f);
      C3D_FVUnifSet(GPU_VERTEX_SHADER, U.tint, cool ? 0.55f * g : 0, cool ? 0.75f * g : 0, cool ? 1.0f * g : 0, 0);
    }
    C3D_BufInfo *buf = C3D_GetBufInfo();
    BufInfo_Init(buf);
    BufInfo_Add(buf, data + dr->vtx, PACK_VERTEX_BYTES, 5, 0x43210);
    C3D_TexBind(0, texture_for(dr->texture));
    set_cull(dr->cull, false);
    C3D_BoolUnifSet(GPU_VERTEX_SHADER, U.emits, lit || (dr->blend & DRAW_EMITS) != 0);
    C3D_DrawElements(GPU_TRIANGLES, (int)dr->idx_count, C3D_UNSIGNED_SHORT, data + dr->idx);
    stats.draws++;
    stats.triangles += dr->idx_count / 3;
  }
  /* The next variant's lamps are its own (lamps_for); the instance's glow is set again by it. */
}

/* The player: the root where it stands, the body at the hips, the head at the neck, arms at the
 * shoulders and legs at the hips, each turned as src/character/pose.ts turns it. */
static void player_matrices(C3D_Mtx out[6]) {
  const PackIsland *isl = P->island;
  const float *p = player;
  C3D_Mtx root, body;
  Mtx_Identity(&root);
  Mtx_Translate(&root, p[PLAYER_X], p[PLAYER_Y], p[PLAYER_Z], true);
  Mtx_RotateY(&root, p[PLAYER_YAW], true);
  body = root;
  Mtx_Translate(&body, 0, isl->hip + p[PLAYER_BOB], 0, true);
  Mtx_RotateX(&body, p[PLAYER_LEAN], true);
  Mtx_Scale(&body, 1 - p[PLAYER_BREATH] * 0.5f, 1 + p[PLAYER_BREATH], 1 - p[PLAYER_BREATH] * 0.5f);
  out[0] = body;
  out[1] = body;
  Mtx_Translate(&out[1], 0, isl->neck - isl->hip, 0, true);
  Mtx_RotateX(&out[1], p[PLAYER_HEAD], true);
  for (int side = 0; side < 2; side++) {
    C3D_Mtx *arm = &out[2 + side];
    *arm = body;
    Mtx_Translate(arm, side ? -isl->shoulder_x : isl->shoulder_x, isl->shoulder - isl->hip, 0, true);
    Mtx_RotateX(arm, side ? p[PLAYER_ARM_R] : p[PLAYER_ARM_L], true);
    Mtx_RotateZ(arm, side ? -p[PLAYER_ARM_OUT] : p[PLAYER_ARM_OUT], true);
    C3D_Mtx *leg = &out[4 + side];
    *leg = root;
    Mtx_Translate(leg, side ? -isl->hip_x : isl->hip_x, isl->hip, 0, true);
    Mtx_RotateX(leg, side ? p[PLAYER_LEG_R] : p[PLAYER_LEG_L], true);
  }
}

/* The model the core's number `code` is drawn with (the pack's THNG), or NULL. */
static const PackThing *thing_for(uint32_t code) {
  for (uint32_t i = 0; i < P->thing_count; i++)
    if (P->things[i].code == code) return P->things[i].model < P->model_count ? &P->things[i] : NULL;
  return NULL;
}

/* The tool in the right hand: the arm's matrix, then the hand's place and the turn forward. */
static bool tool_matrix(const C3D_Mtx *arm, const PackThing *t, C3D_Mtx *out) {
  if (!t) return false;
  *out = *arm;
  Mtx_Translate(out, t->at[0], t->at[1], t->at[2], true);
  Mtx_RotateX(out, t->turn, true);
  return true;
}

static void draw_player(const C3D_Mtx *viewproj, int pass) {
  if (player[PLAYER_SHOWN] < 0.5f || !P->island) return;
  C3D_Mtx parts[6];
  player_matrices(parts);
  const float centre[3] = {player[PLAYER_X], player[PLAYER_Y] + 0.6f, player[PLAYER_Z]};
  for (int k = 0; k < 6; k++) {
    uint16_t m = P->island->parts[k];
    if (m < P->model_count) draw_variant(P->models[m].variant, &parts[k], viewproj, pass, 0, centre, 0.7f);
  }
  C3D_Mtx tool;
  const PackThing *t = held_tool ? thing_for(held_tool) : NULL;
  if (tool_matrix(&parts[3], t, &tool)) draw_variant(P->models[t->model].variant, &tool, viewproj, pass, 0, centre, 0.9f);
}

/* The island's things where the core lists them: what lies about, the fruit on the trees, where a fossil
 * is buried, the float (dipped as the core says). The fish are shadows (draw_island_shadows), a shaken
 * tree is not swayed here (it is drawn with its cell). */
static void draw_things(const C3D_Mtx *viewproj, int pass) {
  for (uint32_t e = 0; e < view_count; e++) {
    const float *v = view_data + e * VIEW_FIELDS;
    uint32_t code = (uint32_t)v[VIEW_WHAT];
    if (code == SHOW_FISH || code == SHOW_SHAKE) continue;
    const PackThing *t = thing_for(code);
    if (!t) continue;
    const PackModel *md = &P->models[t->model];
    float y = v[VIEW_Y] - (code == SHOW_FLOAT ? v[VIEW_VALUE] : 0);
    const float c[3] = {v[VIEW_X], y, v[VIEW_Z]};
    if (!in_view(c, md->radius + 0.1f)) continue;
    C3D_Mtx m;
    Mtx_Identity(&m);
    Mtx_Translate(&m, c[0], c[1], c[2], true);
    if (v[VIEW_YAW] != 0) Mtx_RotateY(&m, v[VIEW_YAW], true);
    draw_variant(md->variant, &m, viewproj, pass, 0, c, md->radius);
  }
}

/* The fishing line, from the rod's tip to the float: a thin band turned to the camera. */
static void draw_line(const C3D_Mtx *viewproj) {
  if (held_tool != ITEM_ROD || player[PLAYER_SHOWN] < 0.5f) return;
  const float *f = NULL;
  for (uint32_t e = 0; e < view_count && !f; e++)
    if ((uint32_t)view_data[e * VIEW_FIELDS + VIEW_WHAT] == SHOW_FLOAT) f = view_data + e * VIEW_FIELDS;
  const PackThing *t = thing_for(ITEM_ROD);
  C3D_Mtx parts[6], tool;
  if (!f || !t) return;
  player_matrices(parts);
  if (!tool_matrix(&parts[3], t, &tool)) return;
  C3D_FVec tip = Mtx_MultiplyFVec4(&tool, FVec4_New(0, -t->tip, 0, 1));
  float a[3] = {tip.x, tip.y, tip.z}, b[3] = {f[VIEW_X], f[VIEW_Y] - f[VIEW_VALUE] + 0.04f, f[VIEW_Z]};
  float d[3] = {b[0] - a[0], b[1] - a[1], b[2] - a[2]};
  /* Across the line and the eye's view of it. */
  float m[3] = {(a[0] + b[0]) / 2 - eye[0], (a[1] + b[1]) / 2 - eye[1], (a[2] + b[2]) / 2 - eye[2]};
  float side[3] = {d[1] * m[2] - d[2] * m[1], d[2] * m[0] - d[0] * m[2], d[0] * m[1] - d[1] * m[0]};
  float l = sqrtf(side[0] * side[0] + side[1] * side[1] + side[2] * side[2]);
  if (l < 1e-5f) return;
  const float w = 0.008f / l;
  FlatVertex *q = flat_begin();
  if (!q) return;
  flat_rect(q, (float[]){a[0] - side[0] * w, a[1] - side[1] * w, a[2] - side[2] * w}, (float[]){a[0] + side[0] * w, a[1] + side[1] * w, a[2] + side[2] * w},
            (float[]){b[0] + side[0] * w, b[1] + side[1] * w, b[2] + side[2] * w}, (float[]){b[0] - side[0] * w, b[1] - side[1] * w, b[2] - side[2] * w});
  flat_draw(q, viewproj, &white_tex, 1, 0.98f, 0.93f, 0.85f);
}

static void instance_matrix(const PackInstance *in, C3D_Mtx *m) {
  Mtx_Identity(m);
  Mtx_Translate(m, in->x, in->y, in->z, true);
  if (in->yaw != 0) Mtx_RotateY(m, in->yaw, true);
}

/* Many quads written one after another in the pool, drawn at once. */
static void flat_draw_run(const FlatVertex *first, uint32_t quads, const C3D_Mtx *mvp, C3D_Tex *tex, float r, float g, float b, float a) {
  if (!quads) return;
  C3D_BufInfo *buf = C3D_GetBufInfo();
  BufInfo_Init(buf);
  BufInfo_Add(buf, first, sizeof(FlatVertex), 2, 0x10);
  C3D_FVUnifMtx4x4(GPU_VERTEX_SHADER, F.mvp, mvp);
  C3D_FVUnifSet(GPU_VERTEX_SHADER, F.color, r, g, b, a);
  C3D_TexBind(0, tex);
  C3D_DrawArrays(GPU_TRIANGLES, 0, (int)quads * 6);
  stats.draws++;
}

/* Soft shadows under the props, the house and the player, toward the back right, away from the sun:
 * the round ones in one draw, the house's rounded rectangle in another. */
static void draw_island_shadows(const C3D_Mtx *viewproj) {
  if (!shadows_on) return;
  float strength = 0.3f * w_day + 0.24f * w_dusk + 0.16f * w_night;
  FlatVertex *first = NULL;
  uint32_t quads = 0;
  for (uint32_t i = 0; i < P->instance_count; i++) {
    const PackInstance *in = &P->instances[i];
    if (in->model >= P->model_count) continue;
    const PackModel *md = &P->models[in->model];
    if (md->shadow <= 0 || md->shadow >= 2) continue;
    const float c[3] = {in->x, in->y, in->z};
    if (!in_view(c, md->shadow + 1)) continue;
    FlatVertex *v = flat_begin();
    if (!v) break;
    if (!first) first = v;
    float r = md->shadow, x = in->x + r * 0.28f, z = in->z - r * 0.2f, y = in->y + 0.03f;
    flat_rect(v, (float[]){x - r, y, z + r}, (float[]){x + r, y, z + r}, (float[]){x + r, y, z - r}, (float[]){x - r, y, z - r});
    quads++;
  }
  if (player[PLAYER_SHOWN] >= 0.5f) {
    FlatVertex *v = flat_begin();
    if (v) {
      if (!first) first = v;
      float r = 0.34f, x = player[PLAYER_X] + 0.05f, z = player[PLAYER_Z] - 0.03f, y = player[PLAYER_Y] + 0.035f;
      flat_rect(v, (float[]){x - r, y, z + r}, (float[]){x + r, y, z + r}, (float[]){x + r, y, z - r}, (float[]){x - r, y, z - r});
      quads++;
    }
  }
  /* Under what lies about, in the same draw. */
  for (uint32_t e = 0; e < view_count; e++) {
    const float *v = view_data + e * VIEW_FIELDS;
    uint32_t code = (uint32_t)v[VIEW_WHAT];
    if (code == SHOW_FISH || code == SHOW_SHAKE || code == SHOW_FLOAT) continue;
    const PackThing *t = thing_for(code);
    if (!t || t->shadow <= 0) continue;
    const float c[3] = {v[VIEW_X], v[VIEW_Y], v[VIEW_Z]};
    if (!in_view(c, 0.5f)) continue;
    FlatVertex *q = flat_begin();
    if (!q) break;
    if (!first) first = q;
    float r = t->shadow, x = c[0] + 0.03f, z = c[2] - 0.02f, y = pi_island_height(c[0], c[2]) + 0.03f;
    flat_rect(q, (float[]){x - r, y, z + r}, (float[]){x + r, y, z + r}, (float[]){x + r, y, z - r}, (float[]){x - r, y, z - r});
    quads++;
  }
  flat_draw_run(first, quads, viewproj, &round_tex, 0.16f, 0.1f, 0.06f, strength * 1.1f);
  first = NULL, quads = 0;
  /* The fish: long shadows in the water, along their way. */
  for (uint32_t e = 0; e < view_count; e++) {
    const float *v = view_data + e * VIEW_FIELDS;
    if ((uint32_t)v[VIEW_WHAT] != SHOW_FISH) continue;
    const float c[3] = {v[VIEW_X], v[VIEW_Y], v[VIEW_Z]};
    if (!in_view(c, 0.6f)) continue;
    FlatVertex *q = flat_begin();
    if (!q) break;
    if (!first) first = q;
    float s = v[VIEW_VALUE], fx = sinf(v[VIEW_YAW]), fz = cosf(v[VIEW_YAW]);
    float lx = fx * 0.3f * s, lz = fz * 0.3f * s, wx = fz * 0.14f * s, wz = -fx * 0.14f * s, y = c[1] + 0.02f;
    flat_rect(q, (float[]){c[0] - lx - wx, y, c[2] - lz - wz}, (float[]){c[0] - lx + wx, y, c[2] - lz + wz}, (float[]){c[0] + lx + wx, y, c[2] + lz + wz},
              (float[]){c[0] + lx - wx, y, c[2] + lz - wz});
    quads++;
  }
  flat_draw_run(first, quads, viewproj, &round_tex, 0.06f, 0.16f, 0.22f, 0.62f);
  first = NULL, quads = 0;
  for (uint32_t i = 0; i < P->instance_count; i++) {
    const PackInstance *in = &P->instances[i];
    if (in->model >= P->model_count) continue;
    const PackModel *md = &P->models[in->model];
    if (md->shadow < 2) continue;
    const float c[3] = {in->x, in->y, in->z};
    if (!in_view(c, md->shadow + 1)) continue;
    FlatVertex *v = flat_begin();
    if (!v) break;
    if (!first) first = v;
    const PackVariant *pv = &P->variants[md->variant];
    float y = in->y + 0.03f, x0 = in->x + pv->min[0] + 0.1f, x1 = in->x + pv->max[0] + 0.3f, z0 = in->z + pv->min[2] - 0.2f, z1 = in->z + pv->max[2] + 0.1f;
    flat_rect(v, (float[]){x0, y, z1}, (float[]){x1, y, z1}, (float[]){x1, y, z0}, (float[]){x0, y, z0});
    quads++;
  }
  flat_draw_run(first, quads, viewproj, &blob_tex, 0.16f, 0.1f, 0.06f, strength);
}

static void draw_player_shadow(const C3D_Mtx *viewproj, float floor_y) {
  if (player[PLAYER_SHOWN] < 0.5f || !shadows_on) return;
  FlatVertex *v = flat_begin();
  if (!v) return;
  float r = 0.34f, x = player[PLAYER_X] + 0.05f, z = player[PLAYER_Z] - 0.03f, y = floor_y + 0.035f;
  flat_rect(v, (float[]){x - r, y, z + r}, (float[]){x + r, y, z + r}, (float[]){x + r, y, z - r}, (float[]){x - r, y, z - r});
  flat_draw(v, viewproj, &round_tex, 0.16f, 0.1f, 0.06f, 0.32f);
}

/* A quad lying on the ground at (x, z) in the scene: on the island's ground, or the room's floor. */
static bool ground_quad(FlatVertex **first, float x, float z, float r, float lift) {
  FlatVertex *v = flat_begin();
  if (!v) return false;
  if (!*first) *first = v;
  float y = (place == PLACE_ISLAND ? (float)pi_island_height(x, z) : 0) + lift;
  flat_rect(v, (float[]){x - r, y, z + r}, (float[]){x + r, y, z + r}, (float[]){x + r, y, z - r}, (float[]){x - r, y, z - r});
  return true;
}

/* Where a tap sent the player (src/scene/route.ts in the browser): dots that march along the way
 * toward its end, and at the end a ring that breathes and a wave that spreads from it. The way is the
 * corners the core has still to walk (pi_game_goal), in the place's tiles. */
static void draw_route(const C3D_Mtx *viewproj) {
  uint32_t n = pi_game_goal();
  if (!n) return;
  const double *path = pi_path();
  const float ox = place == PLACE_ISLAND ? 0 : -room_w / 2.0f, oz = place == PLACE_ISLAND ? 0 : -room_d / 2.0f;
  const float SPACING = 0.62f, NEAR = 0.35f, RING = 0.6f, t = game_seconds;
  float length = 0, ax = player[PLAYER_X], az = player[PLAYER_Z];
  for (uint32_t k = 0; k < n; k++) {
    float bx = (float)path[k * 2] + ox, bz = (float)path[k * 2 + 1] + oz;
    length += sqrtf((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    ax = bx, az = bz;
  }
  /* The dots stand at whole spacings back from the end, less a share that grows with the clock: on the
   * ground they march toward the end at a tile a second, whoever walks. */
  float back = SPACING - fmodf(t, SPACING), at = length - back - NEAR;
  float next = at >= 0 ? NEAR + fmodf(at, SPACING) : length;
  FlatVertex *first = NULL;
  uint32_t quads = 0;
  float walked = 0;
  ax = player[PLAYER_X], az = player[PLAYER_Z];
  for (uint32_t k = 0; k < n && quads < ROUTE_DOTS && next < length - RING; k++) {
    float bx = (float)path[k * 2] + ox, bz = (float)path[k * 2 + 1] + oz;
    float len = sqrtf((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    while (len > 0 && next <= walked + len && next < length - RING && quads < ROUTE_DOTS) {
      float f = (next - walked) / len;
      if (!ground_quad(&first, ax + (bx - ax) * f, az + (bz - az) * f, 0.085f, 0.07f)) break;
      quads++;
      next += SPACING;
    }
    walked += len;
    ax = bx, az = bz;
  }
  flat_draw_run(first, quads, viewproj, &dot_tex, 1, 0.99f, 0.94f, 0.9f);
  /* The end: a ring, a wave, and a coral dot in the middle. */
  const float ex = (float)path[(n - 1) * 2] + ox, ez = (float)path[(n - 1) * 2 + 1] + oz, wave = fmodf(t * 0.9f, 1.0f);
  first = NULL;
  if (ground_quad(&first, ex, ez, 0.42f + 0.05f * sinf(t * 5.5f), 0.08f)) flat_draw_run(first, 1, viewproj, &ring_tex, 1, 0.99f, 0.94f, 0.95f);
  first = NULL;
  if (ground_quad(&first, ex, ez, 0.4f + 0.55f * wave, 0.075f)) flat_draw_run(first, 1, viewproj, &ring_tex, 1, 0.99f, 0.94f, 0.7f * (1 - wave) * (1 - wave));
  first = NULL;
  if (ground_quad(&first, ex, ez, 0.13f, 0.085f)) flat_draw_run(first, 1, viewproj, &dot_tex, 0.95f, 0.5f, 0.42f, 1);
}

static void draw_island(const C3D_Mtx *viewproj) {
  set_island_lights();
  room_state();
  common_state();
  float glow = night_glow();
  /* The sea beyond the map: one plane under the sea floor, lit as the sea's surface is. */
  {
    flat_state();
    C3D_CullFace(GPU_CULL_NONE);
    blend(0);
    FlatVertex *v = flat_begin();
    if (v) {
      const float y = -1.28f, r = 400;
      float cx = follow_shown[0], cz = follow_shown[2];
      flat_rect(v, (float[]){cx - r, y, cz + r}, (float[]){cx + r, y, cz + r}, (float[]){cx + r, y, cz - r}, (float[]){cx - r, y, cz - r});
      float light = 0.0f;
      for (int k = 0; k < 3; k++) light += (lights.hemi_sky[k] + lights.key[k] * fmaxf(0, KEY_DIR[1] * 0.75f + 0.25f) + lights.front[k] * fmaxf(0, FRONT_DIR[1])) / 3;
      /* The sea's deep colour beyond the map (src/island/terrain.ts SEA.deep, as sRGB). */
      const Rgb deep = rgba(P->scene->deep_sea);
      flat_draw(v, viewproj, &white_tex, deep.r * light, deep.g * light, deep.b * light, 1);
    }
    room_state();
  }
  stats.instances = 0;
  for (int pass = 0; pass < 2; pass++) {
    if (pass == 1) {
      /* Shadows over the ground, under the water and everything standing. */
      flat_state();
      C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_COLOR);
      C3D_CullFace(GPU_CULL_NONE);
      blend(1);
      draw_island_shadows(viewproj);
      draw_route(viewproj);
      room_state();
      C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_COLOR);
      blend(1);
    }
    for (uint32_t i = 0; i < P->instance_count; i++) {
      const PackInstance *in = &P->instances[i];
      if (in->model >= P->model_count) continue;
      const PackModel *md = &P->models[in->model];
      if (md->flags & MODEL_PART || in->flags & INSTANCE_BATCHED) continue;
      const float c[3] = {in->x, in->y, in->z};
      if (!in_view(c, md->radius)) continue;
      if (pass == 0) stats.instances++;
      C3D_Mtx m;
      instance_matrix(in, &m);
      if (md->flags & (MODEL_CHUNK | MODEL_CELL)) light_variant(md->variant, &m);
      draw_variant(md->variant, &m, viewproj, pass, glow, c, md->radius);
    }
    draw_things(viewproj, pass);
    draw_player(viewproj, pass);
  }
  /* The fishing line, over everything but the halos. */
  flat_state();
  C3D_CullFace(GPU_CULL_NONE);
  blend(1);
  draw_line(viewproj);
  room_state();
  /* The lamps' halos after dark. */
  if (glow > 0.5f && halos_on) {
    flat_state();
    C3D_CullFace(GPU_CULL_NONE);
    blend(2);
    float right[3] = {top_view.r[0].x, top_view.r[0].y, top_view.r[0].z}, up[3] = {top_view.r[1].x, top_view.r[1].y, top_view.r[1].z};
    Rgb col = mixc(rgba(P->island->lamp_color), (Rgb){1, 0.97f, 0.9f}, 0.55f);
    for (uint32_t i = 0; i < P->instance_count; i++) {
      const PackInstance *in = &P->instances[i];
      if (in->model >= P->model_count || !(P->models[in->model].flags & MODEL_LAMP)) continue;
      float p[3] = {in->x, in->y + P->island->lamp_y, in->z};
      if (!in_view(p, 1)) continue;
      FlatVertex *v = flat_begin();
      if (!v) break;
      float q[4][3], h = 0.55f;
      for (int k = 0; k < 4; k++) {
        float sx = k == 0 || k == 3 ? -h : h, sy = k < 2 ? -h : h;
        for (int j = 0; j < 3; j++) q[k][j] = p[j] + right[j] * sx + up[j] * sy;
      }
      flat_rect(v, q[0], q[1], q[2], q[3]);
      flat_draw(v, viewproj, &halo_tex, col.r, col.g, col.b, 0.8f * glow);
    }
  }
  blend(0);
  C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_ALL);
  C3D_CullFace(GPU_CULL_BACK_CCW);
}

/* ---------------------------------------------------------------- the upper screen */


static void top_camera(void) {
  if (tan_v == 0) {
    tan_v = tanf(FOV_DEG * PI / 360.0f), tan_h = tan_v * 400.0f / 240.0f;
    sec_v = sqrtf(1 + tan_v * tan_v), sec_h = sqrtf(1 + tan_h * tan_h);
  }
  if (place == PLACE_ISLAND) {
    /* src/scene/rig.ts outdoors: a span of ground across, over the player's shoulder, facing north. */
    const float pitch = clampf(0.74f + cam_shown.pitch, 0.15f, 1.45f), yaw = cam_shown.yaw;
    const float aspect = 400.0f / 240.0f, half = FOV_DEG * PI / 360.0f;
    const float dist = fmaxf(19.0f / fmaxf(aspect, 1.2f), 9.0f) / 2 / tanf(half) * cam_shown.zoom;
    const float target[3] = {follow_shown[0], follow_shown[1] + 0.55f, follow_shown[2] - 0.6f};
    eye[0] = target[0] + sinf(yaw) * cosf(pitch) * dist;
    eye[1] = target[1] + sinf(pitch) * dist;
    eye[2] = target[2] + cosf(yaw) * cosf(pitch) * dist;
    top_distance = dist;
    Mtx_PerspTilt(&top_proj, FOV_DEG * PI / 180.0f, aspect, fmaxf(0.1f, dist * 0.2f), dist * 3 + 20, false);
    Mtx_LookAt(&top_view, FVec3_New(eye[0], eye[1], eye[2]), FVec3_New(target[0], target[1], target[2]), FVec3_New(0, 1, 0), false);
    return;
  }
  const float w = (float)room_w, d = (float)room_d;
  const float pitch = clampf(0.7f + cam_shown.pitch, 0.15f, 1.45f), yaw = cam_shown.yaw;
  const float aspect = 400.0f / 240.0f, half = FOV_DEG * PI / 360.0f;
  const float fit_w = w + 1.6f, fit_h = d * sinf(pitch) + WALL_HEIGHT * cosf(pitch) + 1.0f;
  const float dist = fmaxf(fit_h / 2 / tanf(half), fit_w / 2 / (tanf(half) * aspect)) * cam_shown.zoom;
  const float target[3] = {0, WALL_HEIGHT * 0.3f, d * -0.04f};
  eye[0] = target[0] + sinf(yaw) * cosf(pitch) * dist;
  eye[1] = target[1] + sinf(pitch) * dist;
  eye[2] = target[2] + cosf(yaw) * cosf(pitch) * dist;
  top_distance = dist;
  Mtx_PerspTilt(&top_proj, FOV_DEG * PI / 180.0f, aspect, fmaxf(0.1f, dist * 0.2f), dist * 3 + 20, false);
  Mtx_LookAt(&top_view, FVec3_New(eye[0], eye[1], eye[2]), FVec3_New(target[0], target[1], target[2]), FVec3_New(0, 1, 0), false);
}

/* One eye's projection: the eyes sit apart by the 3D slider's share of 0.04 of the distance to the
 * target, and the target stays on the screen's plane, where the HUD is (Pocket Studio's rig). */
static void eye_projection(C3D_Mtx *out, float side, float slider) {
  const float aspect = 400.0f / 240.0f, dist = top_distance;
  Mtx_PerspStereoTilt(out, FOV_DEG * PI / 180.0f, aspect, fmaxf(0.1f, dist * 0.2f), dist * 3 + 20, side * slider * 0.04f * dist, dist, false);
}

static void common_state(void) {
  C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_ALL);
  C3D_AlphaTest(true, GPU_GREATER, 32);
  C3D_StencilTest(false, GPU_ALWAYS, 0, 0xff, 0xff);
  C3D_FogGasMode(GPU_NO_FOG, GPU_PLAIN_DENSITY, false);
  C3D_SetScissor(GPU_SCISSOR_DISABLE, 0, 0, 0, 0);
  C3D_DepthMap(true, -1.0f, 0.0f);
  blend(0);
}

static void draw_room(const C3D_Mtx *viewproj, bool plan_view, uint32_t layers) {
  set_lights(plan_view);
  room_state();
  common_state();
  draw_shell(viewproj, plan_view ? (plan.mode == PLAN_FLOOR ? 5 : 6) : 7, plan_view);
  for (uint32_t i = 0; i < item_count; i++) {
    const Instance *it = &items[i];
    if (plan_view) {
      uint32_t layer = it->layer == ON_RUG ? 2 : it->layer == ON_WALL ? 4 : it->layer == ON_CEILING ? 8 : 1;
      if (!(layer & layers)) continue;
    }
    draw_instance(it, viewproj, 0, plan_view);
  }
  if (!plan_view) draw_player(viewproj, 0);
  flat_state();
  C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_COLOR);
  C3D_CullFace(GPU_CULL_NONE);
  blend(1);
  if (!plan_view || plan.mode == PLAN_FLOOR) draw_shadows(viewproj, plan_view);
  if (!plan_view) draw_player_shadow(viewproj, 0);
  if (!plan_view) draw_route(viewproj);
  /* On the plan a mark stands over whatever it marks. */
  if (plan_view) C3D_DepthTest(false, GPU_ALWAYS, GPU_WRITE_COLOR);
  draw_marks(viewproj, plan_view);
  room_state();
  C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_COLOR);
  blend(1);
  for (uint32_t i = 0; i < item_count; i++) {
    const Instance *it = &items[i];
    draw_instance(it, viewproj, 1, plan_view);
  }
  if (!plan_view) {
    flat_state();
    C3D_CullFace(GPU_CULL_NONE);
    blend(2);
    draw_halos(viewproj);
  }
  blend(0);
  C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_ALL);
  C3D_CullFace(GPU_CULL_BACK_CCW);
}

void scene_render_top(C3D_RenderTarget *target, C3D_RenderTarget *right) {
  uint64_t started = svcGetSystemTick();
  read_game();
  view_count = place == PLACE_ISLAND ? pi_things_view() : 0;
  view_data = pi_things_view_data();
  stats.draws = stats.triangles = 0;
  flat_pool = 0;
  flat_used = 0;
  top_camera();
  uint32_t bg = place == PLACE_ISLAND ? outdoor_now().background : look.background;
  uint32_t clear = ((bg >> 16) & 255) << 24 | ((bg >> 8) & 255) << 16 | (bg & 255) << 8 | 255;
  float slider = osGet3DSliderState();
  bool stereo = right && gfxIs3D() && slider > 0.01f;
  C3D_Mtx proj, viewproj;
  if (stereo) eye_projection(&proj, -1, slider);
  else proj = top_proj;
  Mtx_Multiply(&viewproj, &proj, &top_view);
  C3D_RenderTargetClear(target, C3D_CLEAR_ALL, clear, 0);
  C3D_FrameDrawOn(target);
  C3D_SetViewport(0, 0, 240, 400);
  if (place == PLACE_ISLAND) draw_island(&viewproj);
  else draw_room(&viewproj, false, 15);
  if (stereo) {
    eye_projection(&proj, 1, slider);
    Mtx_Multiply(&viewproj, &proj, &top_view);
    C3D_RenderTargetClear(right, C3D_CLEAR_ALL, clear, 0);
    C3D_FrameDrawOn(right);
    C3D_SetViewport(0, 0, 240, 400);
    if (place == PLACE_ISLAND) draw_island(&viewproj);
    else draw_room(&viewproj, false, 15);
    C3D_FrameDrawOn(target);
  }
  stats.stereo = stereo;
  GSPGPU_FlushDataCache(flat[0][flat_frame & 1], flat_used * sizeof(FlatVertex));
  float ms = (float)(svcGetSystemTick() - started) * 1000.0f / SYSCLOCK_ARM11;
  stats.render_ms += (ms - stats.render_ms) * 0.05f;
}

/* ---------------------------------------------------------------- the touch screen's plan */

/* The room seen straight down (or one wall face on), mapped onto the touch screen's pixels:
 * x across, y down, depth from how high (or how far out from the wall) a point is. */
static void plan_matrix(C3D_Mtx *out) {
  C3D_Mtx proj, view;
  Mtx_OrthoTilt(&proj, 0, 320, 240, 0, 0.1f, 40.0f, false);
  Mtx_Zeros(&view);
  const float s = plan.scale, hw = room_w / 2.0f, hd = room_d / 2.0f;
  view.r[3].w = 1;
  if (plan.mode == PLAN_FLOOR) {
    /* x: room x; y: room z; depth: height */
    view.r[0].x = s, view.r[0].w = plan.x0 + hw * s;
    view.r[1].z = s, view.r[1].w = plan.y0 + hd * s;
    view.r[2].y = 1, view.r[2].w = -10;
  } else if (plan.mode == PLAN_BACK) {
    view.r[0].x = s, view.r[0].w = plan.x0 + hw * s;
    view.r[1].y = -s, view.r[1].w = plan.y0 + WALL_HEIGHT * s;
    view.r[2].z = 1, view.r[2].w = -hd - 12;
  } else if (plan.mode == PLAN_LEFT) {
    /* Seen from inside, the back of the left wall is on the right. */
    view.r[0].z = -s, view.r[0].w = plan.x0 + hd * s;
    view.r[1].y = -s, view.r[1].w = plan.y0 + WALL_HEIGHT * s;
    view.r[2].x = 1, view.r[2].w = -hw - 12;
  } else {
    view.r[0].z = s, view.r[0].w = plan.x0 + hd * s;
    view.r[1].y = -s, view.r[1].w = plan.y0 + WALL_HEIGHT * s;
    view.r[2].x = -1, view.r[2].w = -hw - 12;
  }
  Mtx_Multiply(out, &proj, &view);
}

bool scene_render_plan(C3D_RenderTarget *target) {
  uint32_t p = plan.paper;
  uint32_t clear = ((p >> 16) & 255) << 24 | ((p >> 8) & 255) << 16 | (p & 255) << 8 | 255;
  bool rendered = false;
  if (plan.mode != PLAN_OFF && plan.dirty) {
    rendered = true;
    C3D_RenderTargetClear(plan_rt, C3D_CLEAR_ALL, clear, 0);
    C3D_FrameDrawOn(plan_rt);
    C3D_SetViewport(0, 0, 240, 320);
    C3D_Mtx mvp;
    plan_matrix(&mvp);
    flat_pool = 1;
    flat_used = 0;
    draw_room(&mvp, true, plan.mode == PLAN_FLOOR ? plan.layers : 4);
    plan.dirty = false;
    plan_renders++;
  }
  C3D_RenderTargetClear(target, C3D_CLEAR_ALL, clear, 0);
  C3D_FrameDrawOn(target);
  C3D_SetViewport(0, 0, 240, 320);
  if (plan.mode == PLAN_OFF) return true;
  /* The canvas, one quad over the whole screen, from the touch screen's pool (linear memory, which the
   * GPU reads). */
  flat_pool = 1;
  if (!rendered) flat_used = 0;
  FlatVertex *v = flat_begin();
  if (!v) return true;
  const float corners[4][2] = {{0, 240}, {320, 240}, {320, 0}, {0, 0}};
  const int order[6] = {0, 1, 2, 0, 2, 3};
  for (int i = 0; i < 6; i++) {
    const float *c = corners[order[i]];
    v[i].pos[0] = c[0], v[i].pos[1] = c[1], v[i].pos[2] = -1;
    v[i].uv[0] = (240 - c[1]) / 256.0f;
    v[i].uv[1] = (320 - c[0]) / 512.0f;
  }
  GSPGPU_FlushDataCache(flat[1][flat_frame & 1], flat_used * sizeof(FlatVertex));
  C3D_Mtx screen;
  Mtx_OrthoTilt(&screen, 0, 320, 240, 0, 0.1f, 10.0f, false);
  flat_state();
  C3D_DepthTest(false, GPU_ALWAYS, GPU_WRITE_COLOR);
  C3D_CullFace(GPU_CULL_NONE);
  blend(0);
  flat_draw(v, &screen, &plan_tex, 1, 1, 1, 1);
  C3D_DepthTest(true, GPU_GREATER, GPU_WRITE_ALL);
  return true;
}

SceneStats scene_stats(void) {
  stats.plan_renders = plan_renders;
  return stats;
}
