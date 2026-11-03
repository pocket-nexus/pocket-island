/* `globalThis.islandCore`: the island's core (crates/island-core) for the interface's scripts, the
 * same functions the browser gets from the WebAssembly module (src/core/abi.ts). Results in the
 * core's own buffers are typed arrays over them, not copies. */
#include "core_js.h"

#include "core.h"

static double num(JSContext *ctx, int argc, JSValueConst *argv, int i) {
  double d = 0;
  if (i < argc && JS_ToFloat64(ctx, &d, argv[i]) < 0) return 0;
  return d;
}

static JSValue js_pi_island_reset(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_reset((uint32_t)num(ctx, argc, argv, 0), (uint32_t)num(ctx, argc, argv, 1)) ? 1 : 0);
}

static JSValue js_pi_island_add_ramp(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_add_ramp(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), (uint32_t)num(ctx, argc, argv, 4), num(ctx, argc, argv, 5), num(ctx, argc, argv, 6)) ? 1 : 0);
}

static JSValue js_pi_island_add_bridge(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_add_bridge(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4)) ? 1 : 0);
}

static JSValue js_pi_island_set_house(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_island_set_house(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4), num(ctx, argc, argv, 5));
  return JS_UNDEFINED;
}

static JSValue js_pi_island_add_prop(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_add_prop(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2)) ? 1 : 0);
}

static JSValue js_pi_island_height(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewFloat64(ctx, pi_island_height(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1)));
}

static JSValue js_pi_island_standable(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_standable(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1)) ? 1 : 0);
}

static JSValue js_pi_island_fits(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_fits(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3)) ? 1 : 0);
}

static JSValue js_pi_island_at_door(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_at_door(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2)) ? 1 : 0);
}

static JSValue js_pi_walk_step(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_walk_step((uint32_t)num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4), num(ctx, argc, argv, 5), num(ctx, argc, argv, 6), num(ctx, argc, argv, 7), num(ctx, argc, argv, 8), num(ctx, argc, argv, 9) != 0, num(ctx, argc, argv, 10));
  return JS_UNDEFINED;
}

static JSValue js_pi_walk_path(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_walk_path((uint32_t)num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4), num(ctx, argc, argv, 5), num(ctx, argc, argv, 6), num(ctx, argc, argv, 7), num(ctx, argc, argv, 8)));
}

static JSValue js_pi_room_reset(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_room_reset(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1));
  return JS_UNDEFINED;
}

static JSValue js_pi_room_spec(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_room_spec((uint32_t)num(ctx, argc, argv, 0), (uint32_t)num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4) != 0, num(ctx, argc, argv, 5), num(ctx, argc, argv, 6), num(ctx, argc, argv, 7), num(ctx, argc, argv, 8), num(ctx, argc, argv, 9), num(ctx, argc, argv, 10)) ? 1 : 0);
}

static JSValue js_pi_room_add(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_room_add((uint32_t)num(ctx, argc, argv, 0), (uint32_t)num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), (uint32_t)num(ctx, argc, argv, 4), (uint32_t)num(ctx, argc, argv, 5), num(ctx, argc, argv, 6), num(ctx, argc, argv, 7), (int32_t)num(ctx, argc, argv, 8)));
}

static JSValue js_pi_room_ignore(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_room_ignore((uint32_t)num(ctx, argc, argv, 0), num(ctx, argc, argv, 1) != 0);
  return JS_UNDEFINED;
}

static JSValue js_pi_room_clear_ignored(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_room_clear_ignored();
  return JS_UNDEFINED;
}

static JSValue js_pi_room_commit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_room_commit();
  return JS_UNDEFINED;
}

static JSValue js_pi_rules_check(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_rules_check((int32_t)num(ctx, argc, argv, 0), (uint32_t)num(ctx, argc, argv, 1), (uint32_t)num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4), (uint32_t)num(ctx, argc, argv, 5), (uint32_t)num(ctx, argc, argv, 6), num(ctx, argc, argv, 7), num(ctx, argc, argv, 8), (int32_t)num(ctx, argc, argv, 9)));
}

static JSValue js_pi_rules_surface_at(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_rules_surface_at((uint32_t)num(ctx, argc, argv, 0), (uint32_t)num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3)));
}

static JSValue js_pi_room_fits(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_room_fits(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2)) ? 1 : 0);
}

static JSValue js_pi_room_out_of_door(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_room_out_of_door(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1)) ? 1 : 0);
}

static JSValue js_pi_room_nearest_free(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_room_nearest_free(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1));
  return JS_UNDEFINED;
}

static JSValue js_pi_room_entrance(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_room_entrance();
  return JS_UNDEFINED;
}

static JSValue js_pi_game_restore(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_game_restore(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3) != 0, num(ctx, argc, argv, 4), num(ctx, argc, argv, 5), num(ctx, argc, argv, 6));
  return JS_UNDEFINED;
}

static JSValue js_pi_game_enter(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_game_enter(num(ctx, argc, argv, 0) != 0));
}

static JSValue js_pi_game_exit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_game_exit(num(ctx, argc, argv, 0) != 0));
}

static JSValue js_pi_game_walk_to(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_game_walk_to(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2) != 0) ? 1 : 0);
}

static JSValue js_pi_game_step(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_game_step(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2) != 0, num(ctx, argc, argv, 3) != 0, num(ctx, argc, argv, 4)));
}

static JSValue js_pi_game_state(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_game_state();
  return JS_UNDEFINED;
}

static JSValue js_pi_game_goal(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_game_goal());
}

static JSValue js_pi_game_pose(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_game_pose();
  return JS_UNDEFINED;
}

/* A typed array over `count` elements of the core's memory at `at` (never freed: it is static). */
static JSValue view(JSContext *ctx, void *at, uint32_t bytes, uint32_t count, JSTypedArrayEnum type) {
  JSValue buffer = JS_NewArrayBuffer(ctx, (uint8_t *)at, bytes, NULL, NULL, false);
  JSValue args[3] = {buffer, JS_NewInt32(ctx, 0), JS_NewInt32(ctx, (int32_t)count)};
  JSValue array = JS_NewTypedArray(ctx, 3, args, type);
  JS_FreeValue(ctx, buffer);
  return array;
}

static JSValue js_tiles(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return view(ctx, pi_island_tiles((uint32_t)num(ctx, argc, argv, 0)), 128 * 128, 128 * 128, JS_TYPED_ARRAY_UINT8);
}

static const struct {
  const char *name;
  JSCFunction *fn;
  int length;
} FUNCTIONS[] = {
  {"pi_island_reset", js_pi_island_reset, 2},
  {"pi_island_add_ramp", js_pi_island_add_ramp, 7},
  {"pi_island_add_bridge", js_pi_island_add_bridge, 5},
  {"pi_island_set_house", js_pi_island_set_house, 6},
  {"pi_island_add_prop", js_pi_island_add_prop, 3},
  {"pi_island_height", js_pi_island_height, 2},
  {"pi_island_standable", js_pi_island_standable, 2},
  {"pi_island_fits", js_pi_island_fits, 4},
  {"pi_island_at_door", js_pi_island_at_door, 3},
  {"pi_walk_step", js_pi_walk_step, 11},
  {"pi_walk_path", js_pi_walk_path, 9},
  {"pi_room_reset", js_pi_room_reset, 2},
  {"pi_room_spec", js_pi_room_spec, 11},
  {"pi_room_add", js_pi_room_add, 9},
  {"pi_room_ignore", js_pi_room_ignore, 2},
  {"pi_room_clear_ignored", js_pi_room_clear_ignored, 0},
  {"pi_room_commit", js_pi_room_commit, 0},
  {"pi_rules_check", js_pi_rules_check, 10},
  {"pi_rules_surface_at", js_pi_rules_surface_at, 4},
  {"pi_room_fits", js_pi_room_fits, 3},
  {"pi_room_out_of_door", js_pi_room_out_of_door, 2},
  {"pi_room_nearest_free", js_pi_room_nearest_free, 2},
  {"pi_room_entrance", js_pi_room_entrance, 0},
  {"pi_game_restore", js_pi_game_restore, 7},
  {"pi_game_enter", js_pi_game_enter, 1},
  {"pi_game_exit", js_pi_game_exit, 1},
  {"pi_game_walk_to", js_pi_game_walk_to, 3},
  {"pi_game_step", js_pi_game_step, 5},
  {"pi_game_state", js_pi_game_state, 0},
  {"pi_game_goal", js_pi_game_goal, 0},
  {"pi_game_pose", js_pi_game_pose, 0},
};

void core_install(JSContext *ctx, JSValueConst global) {
  JSValue o = JS_NewObject(ctx);
  for (unsigned i = 0; i < sizeof FUNCTIONS / sizeof FUNCTIONS[0]; i++)
    JS_SetPropertyStr(ctx, o, FUNCTIONS[i].name, JS_NewCFunction(ctx, FUNCTIONS[i].fn, FUNCTIONS[i].name, FUNCTIONS[i].length));
  JS_SetPropertyStr(ctx, o, "tiles", JS_NewCFunction(ctx, js_tiles, "tiles", 1));
  JS_SetPropertyStr(ctx, o, "out", view(ctx, pi_out(), 32 * 8, 32, JS_TYPED_ARRAY_FLOAT64));
  JS_SetPropertyStr(ctx, o, "path", view(ctx, pi_path(), 512 * 8, 512, JS_TYPED_ARRAY_FLOAT64));
  JS_SetPropertyStr(ctx, global, "islandCore", o);
}
