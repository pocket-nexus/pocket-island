// The core's C interface as a script sees it (crates/island-core/src/ffi.rs). The browser gets it
// from the WebAssembly module (src/core/wasm.ts), the console from its renderer, which links the
// same core (programs/3ds-island, `globalThis.islandCore`). Booleans come back as 0 or 1.

export interface CoreAbi {
  /** 32 doubles of results. */
  readonly out: Float64Array;
  /** A way's corners, two doubles each. */
  readonly path: Float64Array;
  /** The things' lists: the pockets and the box, or a save (32-bit floats). */
  readonly data: Float32Array;
  /** What of the island's things to draw, six numbers an entry. */
  readonly view: Float32Array;
  /** The island's tiles to fill: 0 its tiers, 1 its ground. */
  tiles(which: 0 | 1): Uint8Array;

  pi_island_reset(w: number, d: number): number;
  pi_island_add_ramp(x0: number, z0: number, x1: number, z1: number, up: number, low: number, high: number): number;
  pi_island_add_bridge(x0: number, z0: number, x1: number, z1: number, y: number): number;
  pi_island_set_house(x0: number, z0: number, x1: number, z1: number, doorX: number, doorZ: number): void;
  pi_island_set_shop(x0: number, z0: number, x1: number, z1: number, x: number, z: number, yaw: number): void;
  pi_island_add_prop(x: number, z: number, radius: number): number;
  pi_island_add_tree(x: number, z: number, rot: number, kind: number, variant: number): number;
  pi_island_height(x: number, z: number): number;
  pi_island_standable(x: number, z: number): number;
  pi_island_fits(x: number, z: number, r: number, from: number): number;
  pi_island_at_door(x: number, z: number, yaw: number): number;
  pi_island_door_front(): void;

  pi_walk_step(which: number, x: number, z: number, y: number, yaw: number, speed: number, phase: number, ix: number, iz: number, run: number, dt: number): void;
  pi_walk_path(which: number, fx: number, fz: number, tx: number, tz: number, x0: number, z0: number, x1: number, z1: number): number;

  pi_room_reset(w: number, d: number): void;
  pi_room_spec(index: number, kind: number, w: number, d: number, hasSurface: number, sx0: number, sz0: number, sx1: number, sz1: number, sy: number, hang: number): number;
  pi_room_add(item: number, layer: number, x: number, z: number, rot: number, wall: number, u: number, v: number, host: number): number;
  pi_room_ignore(index: number, on: number): void;
  pi_room_clear_ignored(): void;
  pi_room_commit(): void;
  pi_rules_check(self: number, item: number, layer: number, x: number, z: number, rot: number, wall: number, u: number, v: number, host: number): number;
  pi_rules_surface_at(item: number, rot: number, x: number, z: number): number;
  pi_rules_snap(w: number, d: number, x: number, z: number, x0: number, z0: number, x1: number, z1: number): void;
  pi_rules_snap_axis(center: number, extent: number, origin: number): number;

  pi_game_restore(x: number, z: number, yaw: number, inHouse: number, hx: number, hz: number, hyaw: number): void;
  pi_game_enter(instant: number): number;
  pi_game_exit(instant: number): number;
  pi_game_walk_to(x: number, z: number, enter: number): number;
  pi_game_step(sx: number, sz: number, run: number, busy: number, dt: number): number;
  /** Fill `out` (the pointer they return is for C). */
  pi_game_state(): void;
  pi_game_pose(): void;
  pi_game_goal(): number;
  pi_game_act(press: number): number;
  pi_game_surface(): number;

  pi_things_reset(): void;
  pi_things_day(day: number): void;
  pi_things_hint(press: number): number;
  pi_things_cycle(dir: number): void;
  pi_things_hold(slot: number): void;
  pi_things_store(slot: number): number;
  pi_things_take(slot: number): number;
  pi_things_drop(slot: number): number;
  pi_things_slots(): number;
  pi_things_view(): number;
  pi_things_save(): number;
  pi_things_load(n: number): number;
  pi_things_hour(hour: number): void;
  pi_dex_data(): number;
  pi_shop_stock(): number;
  pi_shop_buy(k: number): number;
  pi_shop_sell(slot: number, count: number): number;
  pi_shop_price(item: number): number;
  pi_shop_featured(): number;
  pi_shop_wallet(): number;
  pi_shop_bank(): number;
  pi_shop_rate(): number;
  pi_shop_interest(): number;
  pi_shop_deposit(coins: number): number;
  pi_shop_withdraw(coins: number): number;
}

let abi: CoreAbi | null = null;

/** The core every rule runs on; a host sets it once, before any rule is asked. */
export function setCore(core: CoreAbi): void {
  abi = core;
}

export function core(): CoreAbi {
  if (!abi) {
    const console3ds = (globalThis as unknown as { islandCore?: CoreAbi }).islandCore;
    if (console3ds) abi = console3ds;
    else throw new Error("the island's core is not loaded (src/core/wasm.ts loadCore)");
  }
  return abi;
}
