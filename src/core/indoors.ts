// Walking in the house: the room's floor, its walls, and its furniture in the way. Rugs are walked
// over; anything else on the floor is not. The front of the room is open toward the camera, but
// only its doorway lets a walker out: stepping through it is leaving the house. The rules are the
// island's core (crates/island-core/src/indoors.rs); this hands it the room.

import { core } from "./abi.ts";
import { holdRoom, type Catalog } from "./rules.ts";
import type { RoomState } from "./types.ts";
import { WALKER_RADIUS, type WalkWorld } from "./walk.ts";

let committed: unknown = null;

/** The room the player walks: the core takes its furniture as the obstacles. */
function commit(state: RoomState, catalog: Catalog): void {
  const index = holdRoom(state, catalog);
  if (committed === index) return;
  core().pi_room_commit();
  committed = index;
}

export function roomWorld(state: RoomState, catalog: Catalog): WalkWorld {
  const hold = () => commit(state, catalog);
  hold();
  return {
    which: 1,
    hold,
    height: () => 0,
    fits: (x, z, r) => (hold(), !!core().pi_room_fits(x, z, r)),
  };
}

/** Whether a walker at (x, z) has stepped out through the doorway. */
export function outOfDoor(state: RoomState, x: number, z: number, catalog: Catalog = () => undefined): boolean {
  commit(state, catalog);
  return !!core().pi_room_out_of_door(x, z);
}

/** Where a walker comes in: just inside the doorway. */
export function entrance(state: RoomState, catalog: Catalog = () => undefined): { x: number; z: number; yaw: number } {
  commit(state, catalog);
  const c = core();
  c.pi_room_entrance();
  return { x: c.out[0]!, z: c.out[1]!, yaw: c.out[2]! };
}

/** The nearest place to (x, z) a walker fits: after decorating, a walker standing where furniture went steps aside. */
export function nearestFree(state: RoomState, catalog: Catalog, x: number, z: number): { x: number; z: number } {
  commit(state, catalog);
  const c = core();
  c.pi_room_nearest_free(x, z);
  return { x: c.out[0]!, z: c.out[1]! };
}

export { WALKER_RADIUS };
