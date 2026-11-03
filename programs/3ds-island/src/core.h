/* The island's core (crates/island-core), as the renderer links it: its C interface. The functions
 * are written from crates/island-core/src/ffi.rs by tools/bindings.ts; the constants after them are
 * kept by hand, in step with the core's (game.rs, things.rs). */
#ifndef ISLAND_CORE_H
#define ISLAND_CORE_H

#include <stdbool.h>
#include <stdint.h>

/* The core's functions: written by tools/bindings.ts from crates/island-core/src/ffi.rs. */
double *pi_out(void);
double *pi_path(void);
bool pi_island_reset(uint32_t w, uint32_t d);
uint8_t *pi_island_tiles(uint32_t which);
bool pi_island_add_ramp(double x0, double z0, double x1, double z1, uint32_t up, double low, double high);
bool pi_island_add_bridge(double x0, double z0, double x1, double z1, double y);
void pi_island_set_house(double x0, double z0, double x1, double z1, double door_x, double door_z);
void pi_island_set_shop(double x0, double z0, double x1, double z1, double x, double z, double yaw);
bool pi_island_add_prop(double x, double z, double radius);
bool pi_island_add_tree(double x, double z, double rot, uint32_t kind, uint32_t variant);
double pi_island_height(double x, double z);
bool pi_island_standable(double x, double z);
bool pi_island_fits(double x, double z, double r, double from);
bool pi_island_at_door(double x, double z, double yaw);
void pi_walk_step(uint32_t which, double x, double z, double y, double yaw, double speed, double phase, double ix, double iz, bool run, double dt);
int32_t pi_walk_path(uint32_t which, double fx, double fz, double tx, double tz, double x0, double z0, double x1, double z1);
void pi_room_reset(double w, double d);
bool pi_room_spec(uint32_t index, uint32_t kind_code, double w, double d, bool has_surface, double sx0, double sz0, double sx1, double sz1, double sy, double hang);
int32_t pi_room_add(uint32_t item, uint32_t layer_code, double x, double z, uint32_t rot, uint32_t wall, double u, double v, int32_t host);
void pi_room_ignore(uint32_t index, bool on);
void pi_room_clear_ignored(void);
void pi_room_commit(void);
int32_t pi_rules_check(int32_t this, uint32_t item, uint32_t layer_code, double x, double z, uint32_t rot, uint32_t wall, double u, double v, int32_t host);
int32_t pi_rules_surface_at(uint32_t item, uint32_t rot, double x, double z);
bool pi_room_fits(double x, double z, double r);
bool pi_room_out_of_door(double x, double z);
void pi_room_nearest_free(double x, double z);
void pi_room_entrance(void);
void pi_game_restore(double x, double z, double yaw, bool in_house, double hx, double hz, double hyaw);
uint32_t pi_game_enter(bool instant);
uint32_t pi_game_exit(bool instant);
bool pi_game_walk_to(double x, double z, bool enter);
uint32_t pi_game_step(double sx, double sz, bool run, bool busy, double dt);
const double *pi_game_state(void);
uint32_t pi_game_act(uint32_t press);
void pi_things_reset(void);
void pi_things_day(double day);
uint32_t pi_things_hint(uint32_t press);
void pi_things_cycle(int32_t dir);
void pi_things_hold(uint32_t slot);
bool pi_things_store(uint32_t slot);
bool pi_things_take(uint32_t slot);
bool pi_things_drop(uint32_t slot);
uint32_t pi_things_slots(void);
void pi_things_hour(double hour);
uint32_t pi_dex_data(void);
uint32_t pi_shop_stock(void);
uint32_t pi_shop_buy(uint32_t k);
uint32_t pi_shop_sell(uint32_t slot, uint32_t count);
uint32_t pi_shop_price(uint32_t item);
uint32_t pi_shop_featured(void);
uint32_t pi_shop_wallet(void);
uint32_t pi_shop_bank(void);
uint32_t pi_shop_interest(void);
uint32_t pi_shop_deposit(uint32_t coins);
uint32_t pi_shop_withdraw(uint32_t coins);
float *pi_things_data(void);
uint32_t pi_things_data_len(void);
float *pi_things_view_data(void);
uint32_t pi_things_view_len(void);
uint32_t pi_things_view(void);
uint32_t pi_things_save(void);
bool pi_things_load(uint32_t n);
uint32_t pi_game_goal(void);
const double *pi_game_pose(void);
/* End of the written functions; what follows is kept by hand, in step with the core. */

/* The game's events (game::Events), and the things' outcomes (things::Outcome). */
enum { GAME_PLACE = 1, GAME_DOOR = 2, GAME_ARRIVED = 4, GAME_FADING = 8 };
enum { OUTCOME_GOT = 16, OUTCOME_FULL = 32, OUTCOME_BITE = 64, OUTCOME_CAUGHT = 128, OUTCOME_ESCAPED = 256, OUTCOME_FELL = 512 };
/* pi_game_state's fields. */
enum { GS_PLACE, GS_X, GS_Y, GS_Z, GS_YAW, GS_SPEED, GS_PHASE, GS_NEAR_DOOR, GS_FADE, GS_OUT_X, GS_OUT_Z, GS_OUT_YAW, GS_WALKING, GS_SECONDS, GS_HELD, GS_ACT, GS_ACT_T, GS_LINE };
/* The things' actions (things::Act). */
enum { ACT_NONE, ACT_PICK, ACT_PULL, ACT_SHAKE, ACT_CHOP, ACT_DIG, ACT_CAST, ACT_REEL, ACT_SHOW, ACT_SWING };
/* Items (things::item), and what else a view entry shows (things::show). */
enum { ITEM_SHOVEL = 1, ITEM_AXE = 2, ITEM_ROD = 3, ITEM_BRANCH = 10, ITEM_WOOD = 11, ITEM_WEED = 12, ITEM_SHELL = 20, ITEM_FRUIT = 30, ITEM_FOSSIL = 40, ITEM_FISH = 50 };
enum { SHOW_BURIED = 100, SHOW_FISH = 101, SHOW_FLOAT = 102, SHOW_BUNDLE = 103, SHOW_SHAKE = 104 };
/* A view entry (pi_things_view): what, x, y, z, yaw, and a value. */
enum { VIEW_WHAT, VIEW_X, VIEW_Y, VIEW_Z, VIEW_YAW, VIEW_VALUE, VIEW_FIELDS };
/* pi_game_pose's fields. */
enum { POSE_BOB, POSE_LEAN, POSE_HEAD, POSE_ARM_L, POSE_ARM_R, POSE_ARM_OUT, POSE_LEG_L, POSE_LEG_R, POSE_BREATH };

#endif
