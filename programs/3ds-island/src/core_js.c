/* `globalThis.islandCore`: the island's core (crates/island-core) for the interface's scripts, the
 * same functions the browser gets from the WebAssembly module (src/core/abi.ts). Results in the
 * core's own buffers are typed arrays over them, not copies. Written by tools/bindings.ts from
 * crates/island-core/src/ffi.rs: run it again rather than editing this. */
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

static JSValue js_pi_island_set_shop(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_island_set_shop(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), num(ctx, argc, argv, 3), num(ctx, argc, argv, 4), num(ctx, argc, argv, 5), num(ctx, argc, argv, 6));
  return JS_UNDEFINED;
}

static JSValue js_pi_island_add_prop(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_add_prop(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2)) ? 1 : 0);
}

static JSValue js_pi_island_add_tree(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_island_add_tree(num(ctx, argc, argv, 0), num(ctx, argc, argv, 1), num(ctx, argc, argv, 2), (uint32_t)num(ctx, argc, argv, 3), (uint32_t)num(ctx, argc, argv, 4)) ? 1 : 0);
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
  (void)argc, (void)argv;
  pi_room_clear_ignored();
  return JS_UNDEFINED;
}

static JSValue js_pi_room_commit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
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
  (void)argc, (void)argv;
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
  (void)argc, (void)argv;
  pi_game_state();
  return JS_UNDEFINED;
}

static JSValue js_pi_game_surface(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_game_surface());
}

static JSValue js_pi_game_act(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_game_act((uint32_t)num(ctx, argc, argv, 0)));
}

static JSValue js_pi_things_reset(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  pi_things_reset();
  return JS_UNDEFINED;
}

static JSValue js_pi_things_day(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_things_day(num(ctx, argc, argv, 0));
  return JS_UNDEFINED;
}

static JSValue js_pi_things_hint(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_things_hint((uint32_t)num(ctx, argc, argv, 0)));
}

static JSValue js_pi_things_cycle(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_things_cycle((int32_t)num(ctx, argc, argv, 0));
  return JS_UNDEFINED;
}

static JSValue js_pi_things_hold(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_things_hold((uint32_t)num(ctx, argc, argv, 0));
  return JS_UNDEFINED;
}

static JSValue js_pi_things_store(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_things_store((uint32_t)num(ctx, argc, argv, 0)) ? 1 : 0);
}

static JSValue js_pi_things_take(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_things_take((uint32_t)num(ctx, argc, argv, 0)) ? 1 : 0);
}

static JSValue js_pi_things_drop(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_things_drop((uint32_t)num(ctx, argc, argv, 0)) ? 1 : 0);
}

static JSValue js_pi_things_slots(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_things_slots());
}

static JSValue js_pi_things_hour(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  pi_things_hour(num(ctx, argc, argv, 0));
  return JS_UNDEFINED;
}

static JSValue js_pi_dex_data(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_dex_data());
}

static JSValue js_pi_shop_stock(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_shop_stock());
}

static JSValue js_pi_shop_buy(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_shop_buy((uint32_t)num(ctx, argc, argv, 0)));
}

static JSValue js_pi_shop_sell(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_shop_sell((uint32_t)num(ctx, argc, argv, 0), (uint32_t)num(ctx, argc, argv, 1)));
}

static JSValue js_pi_shop_price(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_shop_price((uint32_t)num(ctx, argc, argv, 0)));
}

static JSValue js_pi_shop_featured(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_shop_featured());
}

static JSValue js_pi_shop_wallet(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_shop_wallet());
}

static JSValue js_pi_shop_bank(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_shop_bank());
}

static JSValue js_pi_shop_interest(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_shop_interest());
}

static JSValue js_pi_shop_deposit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_shop_deposit((uint32_t)num(ctx, argc, argv, 0)));
}

static JSValue js_pi_shop_withdraw(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt64(ctx, pi_shop_withdraw((uint32_t)num(ctx, argc, argv, 0)));
}

static JSValue js_pi_things_view(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_things_view());
}

static JSValue js_pi_things_save(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_things_save());
}

static JSValue js_pi_things_load(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return JS_NewInt32(ctx, pi_things_load((uint32_t)num(ctx, argc, argv, 0)) ? 1 : 0);
}

static JSValue js_pi_game_goal(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  return JS_NewInt64(ctx, pi_game_goal());
}

static JSValue js_pi_game_pose(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc, (void)argv;
  pi_game_pose();
  return JS_UNDEFINED;
}

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
  {"pi_island_set_shop", js_pi_island_set_shop, 7},
  {"pi_island_add_prop", js_pi_island_add_prop, 3},
  {"pi_island_add_tree", js_pi_island_add_tree, 5},
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
  {"pi_game_surface", js_pi_game_surface, 0},
  {"pi_game_act", js_pi_game_act, 1},
  {"pi_things_reset", js_pi_things_reset, 0},
  {"pi_things_day", js_pi_things_day, 1},
  {"pi_things_hint", js_pi_things_hint, 1},
  {"pi_things_cycle", js_pi_things_cycle, 1},
  {"pi_things_hold", js_pi_things_hold, 1},
  {"pi_things_store", js_pi_things_store, 1},
  {"pi_things_take", js_pi_things_take, 1},
  {"pi_things_drop", js_pi_things_drop, 1},
  {"pi_things_slots", js_pi_things_slots, 0},
  {"pi_things_hour", js_pi_things_hour, 1},
  {"pi_dex_data", js_pi_dex_data, 0},
  {"pi_shop_stock", js_pi_shop_stock, 0},
  {"pi_shop_buy", js_pi_shop_buy, 1},
  {"pi_shop_sell", js_pi_shop_sell, 2},
  {"pi_shop_price", js_pi_shop_price, 1},
  {"pi_shop_featured", js_pi_shop_featured, 0},
  {"pi_shop_wallet", js_pi_shop_wallet, 0},
  {"pi_shop_bank", js_pi_shop_bank, 0},
  {"pi_shop_interest", js_pi_shop_interest, 0},
  {"pi_shop_deposit", js_pi_shop_deposit, 1},
  {"pi_shop_withdraw", js_pi_shop_withdraw, 1},
  {"pi_things_view", js_pi_things_view, 0},
  {"pi_things_save", js_pi_things_save, 0},
  {"pi_things_load", js_pi_things_load, 1},
  {"pi_game_goal", js_pi_game_goal, 0},
  {"pi_game_pose", js_pi_game_pose, 0},
};

void core_install(JSContext *ctx, JSValueConst global) {
  JSValue o = JS_NewObject(ctx);
  for (unsigned i = 0; i < sizeof FUNCTIONS / sizeof FUNCTIONS[0]; i++)
    JS_SetPropertyStr(ctx, o, FUNCTIONS[i].name, JS_NewCFunction(ctx, FUNCTIONS[i].fn, FUNCTIONS[i].name, FUNCTIONS[i].length));
  JS_SetPropertyStr(ctx, o, "tiles", JS_NewCFunction(ctx, js_tiles, "tiles", 1));
  JS_SetPropertyStr(ctx, o, "out", view(ctx, pi_out(), (uint32_t)(32) * 8, (uint32_t)(32), JS_TYPED_ARRAY_FLOAT64));
  JS_SetPropertyStr(ctx, o, "path", view(ctx, pi_path(), (uint32_t)(512) * 8, (uint32_t)(512), JS_TYPED_ARRAY_FLOAT64));
  JS_SetPropertyStr(ctx, o, "data", view(ctx, pi_things_data(), (uint32_t)(pi_things_data_len()) * 4, (uint32_t)(pi_things_data_len()), JS_TYPED_ARRAY_FLOAT32));
  JS_SetPropertyStr(ctx, o, "view", view(ctx, pi_things_view_data(), (uint32_t)(pi_things_view_len()) * 4, (uint32_t)(pi_things_view_len()), JS_TYPED_ARRAY_FLOAT32));
  JS_SetPropertyStr(ctx, global, "islandCore", o);
}
