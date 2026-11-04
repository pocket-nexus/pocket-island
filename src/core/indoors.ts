// Walking in the house: the room's floor, its walls, and its furniture in
// the way. Rugs are walked over; anything else on the floor is not. The
// front of the room is open toward the camera, but only its doorway lets a
// walker out: stepping through it is leaving the house.

import { doorRect, footprint, type Catalog } from "./rules.ts";
import type { RoomState } from "./types.ts";
import { WALKER_RADIUS, type WalkWorld } from "./walk.ts";

/** How far past the room's front a walker gets before it has gone out of the door. */
export const DOOR_OUT = 0.12;
/** Half the doorway's width a walker's centre may use. */
const DOOR_HALF = 0.42;

function circleHitsRect(x: number, z: number, r: number, rect: readonly number[]): boolean {
  const cx = Math.max(rect[0]!, Math.min(x, rect[2]!)), cz = Math.max(rect[1]!, Math.min(z, rect[3]!));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

/** The furniture a walker bumps into: what stands on the floor, rugs and surface things aside. */
export function obstacles(state: RoomState, catalog: Catalog): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const p of state.items) {
    if (p.layer !== "floor") continue;
    const r = footprint(state, catalog, p);
    if (r) out.push(r);
  }
  return out;
}

export function roomWorld(state: RoomState, catalog: Catalog): WalkWorld {
  const blocks = obstacles(state, catalog);
  const door = doorRect(state);
  const doorX = (door[0] + door[2]) / 2;
  return {
    height: () => 0,
    fits(x, z, r) {
      if (x < r || x > state.w - r || z < r) return false;
      // The front is closed but for the doorway.
      if (z > state.d - r && (Math.abs(x - doorX) > DOOR_HALF || z > state.d + DOOR_OUT + r)) return false;
      return !blocks.some((b) => circleHitsRect(x, z, r, b));
    },
  };
}

/** Whether a walker at (x, z) has stepped out through the doorway. */
export function outOfDoor(state: RoomState, x: number, z: number): boolean {
  const door = doorRect(state);
  return z > state.d + DOOR_OUT * 0.5 && Math.abs(x - (door[0] + door[2]) / 2) <= DOOR_HALF + 1e-6;
}

/** Where a walker comes in: just inside the doorway. */
export function entrance(state: RoomState): { x: number; z: number; yaw: number } {
  const door = doorRect(state);
  return { x: (door[0] + door[2]) / 2, z: state.d - 0.45, yaw: Math.PI };
}

/**
 * The nearest place to (x, z) a walker fits, searching outward in rings: after
 * decorating, a walker standing where furniture went steps aside.
 */
export function nearestFree(state: RoomState, catalog: Catalog, x: number, z: number, r = WALKER_RADIUS): { x: number; z: number } {
  const world = roomWorld(state, catalog);
  if (world.fits(x, z, r, 0)) return { x, z };
  for (let ring = 1; ring <= 40; ring++) {
    const reach = ring * 0.25;
    const steps = Math.max(8, ring * 6);
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * reach, pz = z + Math.sin(a) * reach;
      if (pz <= state.d - r && world.fits(px, pz, r, 0)) return { x: px, z: pz };
    }
  }
  return entrance(state);
}
