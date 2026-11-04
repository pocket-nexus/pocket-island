/* The room on the 3DS: the upper screen's view and the touch screen's plan,
 * drawn from what the interface hands over (extension.c). */
#ifndef ISLAND_SCENE_H
#define ISLAND_SCENE_H

#include <citro3d.h>
#include <stdbool.h>
#include <stdint.h>

#include "pack.h"

#define SCENE_MAX_ITEMS 320
#define SCENE_MAX_MARKS 32

/* Where an item is, in the interface's numbers (Float32Array, 10 per item). */
enum { ITEM_ID, ITEM_INDEX, ITEM_VARIANT, ITEM_X, ITEM_Y, ITEM_Z, ITEM_YAW, ITEM_ON, ITEM_FLAGS, ITEM_LAYER, ITEM_FIELDS };
/* ITEM_FLAGS */
enum { MARK_SELECTED = 1, MARK_HELD = 2, MARK_REFUSED = 4 };
/* ITEM_LAYER: what the item stands on, for its shadow and the plan. */
enum { ON_FLOOR = 0, ON_RUG = 1, ON_SURFACE = 2, ON_WALL = 3, ON_CEILING = 4 };

/* A mark (Float32Array, 10 per mark): a rectangle on the floor or on a wall. */
enum { MARK_KIND, MARK_A0, MARK_B0, MARK_A1, MARK_B1, MARK_LIFT, MARK_R, MARK_G, MARK_B, MARK_ALPHA, MARK_FIELDS };
/* MARK_KIND: 0 a floor rectangle x0 z0 x1 z1 at height LIFT; 1..3 on the back, left, right wall,
 * u0 v0 u1 v1; +8 drawn as an outline. */

/* Where the player is (the island's core says): in the house (the room) or out on the island. */
enum { PLACE_ROOM = 0, PLACE_ISLAND = 1 };
/* The player as drawn: where it stands and faces, and the angles of its pose. In the room x and z
 * are from the room's middle. */
enum { PLAYER_X, PLAYER_Y, PLAYER_Z, PLAYER_YAW, PLAYER_BOB, PLAYER_LEAN, PLAYER_HEAD, PLAYER_ARM_L, PLAYER_ARM_R, PLAYER_ARM_OUT, PLAYER_LEG_L, PLAYER_LEG_R,
       PLAYER_SCALE_XZ, PLAYER_SCALE_Y, PLAYER_SHOWN, PLAYER_FIELDS };

/* The plan on the touch screen. */
enum { PLAN_OFF = 0, PLAN_FLOOR = 1, PLAN_BACK = 2, PLAN_LEFT = 3, PLAN_RIGHT = 4 };

typedef struct {
  uint32_t draws, triangles;
  float fps, frame_ms, gpu_ms;
  uint32_t lamps;
  uint32_t plan_renders;
  uint32_t instances;
  /* The CPU's time building the upper screen's commands, milliseconds (averaged). */
  float render_ms;
  bool stereo;
} SceneStats;

bool scene_init(const Pack *pack);
void scene_shutdown(void);

void scene_room(uint32_t w, uint32_t d, int32_t wallpaper, int32_t flooring, const float *items, uint32_t count);
void scene_marks(const float *marks, uint32_t count);
/* mode: 0 warm, 1 cool, 2 off; the clock's phase between two of the day's looks (0 day, 1 dusk,
 * 2 night), `t` of the way from `a` to `b` (src/core/clock.ts skyPhase). */
void scene_light(uint32_t mode, uint32_t a, uint32_t b, float t);
/* Turn and tilt the view by these radians, zoom by `zoom` (below 1 is closer); `reset` first. */
void scene_camera(float yaw, float pitch, float zoom, bool reset);
/* The plan: which, where its origin is on the touch screen (pixels), pixels per tile, the
 * layers it shows (1 floor, 2 rugs, 4 walls, 8 ceiling), and the paper's colour around it. */
void scene_plan(uint32_t mode, float x0, float y0, float scale, uint32_t layers, uint32_t paper);
/* Halos and shadows can be turned off. */
void scene_options(bool halos, bool shadows);
/* The light's balance, for tuning on the console: hemisphere from fill, from environment, key, front,
 * lamp, lamp cap. */
void scene_tune(const float *values, uint32_t count);
/* The lamps' light kept with what stands still is worked out again as it is next drawn: after the
 * lamps or what stands changes (the island reshaped), or the light's balance is tuned. */
void scene_relight(void);

/* Once a frame, before either screen is drawn. */
void scene_step(float dt);
void scene_render_top(C3D_RenderTarget *target, C3D_RenderTarget *right);
bool scene_render_plan(C3D_RenderTarget *target);
SceneStats scene_stats(void);

#endif
