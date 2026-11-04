/* island.pack, as tools/cook.ts writes it. Every record here has the size and
 * layout of its table in the pack; both sides check PACK_VERSION.
 *
 *   header       "PIPK", version, section count, the catalogue's hash
 *   sections     tag, offset, size, count (16 bytes each)
 *   ITEM 48 B    an item in catalogue order: its variants, kind, size, light
 *   VARI 40 B    a variant: its bytes in MESH, its draws, its bounds
 *   DRAW 20 B    a draw: vertices and indices from the variant's start,
 *                its texture (-1 none, -2 the sky), flags (1 blended,
 *                2 gives off light, 4 the house's windows) and culling
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
 *   THNG 32 B    what the core lists to draw (things::show, items by
 *                number): its model, its shadow's radius, how it is held
 *   LOOK 52 B    the light at a look of the day (src/scene/lighting.ts):
 *                the room's for each ceiling mode and look, then the island's
 *   SCEN 64 B    the room's shell and doormat (src/scene/shell.ts), the sea
 *                beyond the map
 *
 * A vertex: position (4 x s16, tiles x 2048), normal (4 x s8, x 127),
 * colour (4 x u8), emission (4 x u8: rgb x strength / 4, alpha 255 for
 * always and 0 while the item is on), texture coordinate (2 x s16, x 1024). */
#ifndef ISLAND_PACK_H
#define ISLAND_PACK_H

#include <citro3d.h>
#include <stdbool.h>
#include <stdint.h>

#define PACK_VERSION 7
/* The most a vertex's emission holds, as a share of which it is kept (tools/cook.ts EMISSION_SCALE). */
#define PACK_EMISSION_SCALE 4.0f
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

/* LOOK: the light at one of the day's looks, as the browser's (src/scene/lighting.ts): the room's for
 * each ceiling mode and look (LOOK_ROOM(mode, time)), then the island's (LOOK_ISLAND(time)). Colours
 * as the vertices' (r in the low byte). */
typedef struct {
  uint32_t key, sky, ground, background, window_top, window_bottom;
  float key_power, fill, env, window_strength, lamp, halo;
  uint32_t stars;
  /* The front light as a share of the key's power (the room's with the browser's share inside), the
   * lamps' reach, how much what glows does, and the console's shadows' strength (a lowering). */
  float front, lamp_reach, glow, shadow;
} PackLook;
#define LOOK_ROOM(mode, time) ((mode) * 3 + (time))
#define LOOK_ISLAND(time) (9 + (time))
_Static_assert(sizeof(PackLook) == 68, "LOOK");

/* VIEW: how the browser's view draws beyond each look's light, in tools/cook.ts's order. */
enum { VIEW_STARS = 16 };
typedef struct {
  /* The camera (src/scene/rig.ts RIG): the lens (degrees); the room's view pose and the island's
   * (pitch, how far it turns either way, the pitch it tilts within and the zoom); the pitch it keeps
   * within; outdoors the span across, the least, the least aspect, and the target over the player (up,
   * back); in the room the margins it fits and the target (a share of the walls' height up, of the
   * depth back); the near plane (a share of the distance, the least) and the far (times, more); the
   * time constants (s) it eases toward its goal with and after the player. */
  float fov;
  float room_pitch, room_yaw, room_pitch_lo, room_pitch_hi, room_zoom_lo, room_zoom_hi;
  float island_pitch, island_yaw, island_pitch_lo, island_pitch_hi, island_zoom_lo, island_zoom_hi;
  float pitch_lo, pitch_hi;
  float span, span_least, span_aspect, island_up, island_back;
  float fit_w, fit_h, room_lift, room_depth;
  float near, near_least, far, far_more;
  float ease, follow;
  /* The light (src/scene/lighting.ts): the key's and the front light's directions, a lamp's radius
   * and how far its light leans toward white. */
  float key_dir[3], front_dir[3], lamp_radius, lamp_lean;
  /* A lamp's halo (src/scene/view.ts HALO): its strength at four distances out (as a share of its
   * size), the white it leans to and how far, its strength at full. */
  float halo_stops[4][2];
  float halo_white[3], halo_lean, halo_opacity;
  /* What is held, lifted for each kind and how fast (s); a piece's pop as it comes (s, its swell, its
   * rise and the rise's turns) (LIFT, POP). */
  float lift_floor, lift_ceiling, lift_wall, lift_ease;
  float pop_seconds, pop_swell, pop_rise, pop_rise_turns;
  /* The selection's colours (as the vertices') and its pulse, radians a second (SELECTION). */
  uint32_t selected, refused;
  float pulse;
  /* The route's marker (src/scene/route.ts MARKER): its colours; a dot's radius, lift and strength;
   * the ring's inner and outer radius, lift, strength, breath and its rate; the wave's radii, lift,
   * strength, growth and rate; the coral dot's radius and lift. */
  uint32_t cream, coral;
  float dot_r, dot_lift, dot_alpha;
  float ring_inner, ring_outer, ring_lift, ring_alpha, ring_breathe, ring_rate;
  float wave_inner, wave_outer, wave_lift, wave_alpha, wave_grow, wave_rate;
  float centre_r, centre_lift;
  /* A window's night stars (src/scene/materials.ts STARS): their colour, how many, how big and where
   * each stands (shares across and down). */
  uint32_t star_color, star_count;
  float star_size;
  float stars[VIEW_STARS][2];
  /* The house's windows' glow under a cool ceiling light (src/island/windows.ts HOUSE_WINDOW; their
   * warm is in their emission), the sea floor's deepest (src/island/terrain.ts SEA_FLOOR), and the
   * console's shadows' colour (a lowering, tools/cook.ts CONSOLE_SHADOW). */
  uint32_t window_cool;
  float sea_floor;
  uint32_t shadow;
} PackView;
_Static_assert(sizeof(PackView) == 476, "VIEW");

/* SCEN: the room's shell (its walls' thickness, the slab under it, the skirting) and the doormat
 * inside its doorway (src/scene/shell.ts SHELL, DOORMAT), the sea's colour beyond the map, and the
 * fish's shadows and the fishing line (src/island/things.ts FISH_SHADOW, FISHING_LINE: their
 * strength in the alpha). */
typedef struct {
  float wall_t, slab, skirt_h, skirt_d;
  float mat_w, mat_d, mat_h, mat_inset, mat_border;
  uint32_t slab_color, cap_color, skirt_color, mat_border_color, mat_color, deep_sea;
  uint32_t fish_shadow, fishing_line;
  uint32_t pad;
} PackScene;
_Static_assert(sizeof(PackScene) == 72, "SCEN");
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
  const PackLook *looks;
  uint32_t look_count;
  const PackScene *scene;
  const PackView *view;
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
