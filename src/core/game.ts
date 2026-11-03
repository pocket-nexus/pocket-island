// The player's game, as the island's core runs it (crates/island-core/src/game.rs): where the
// player is, how they walk there each frame, the door between the island and the house, and the
// fade while they go through it. A host hands it the stick and reads back where the player is and
// how they stand; it draws that and changes its scene when the place changes.

import { core } from "./abi.ts";
import { holdIsland, type IslandMap } from "./island.ts";
import { holdRoom, type Catalog } from "./rules.ts";
import type { RoomState } from "./types.ts";
import { ACTS, PRESSES, type ActName, type Press } from "./things.ts";

/** What a step can raise. */
export const EVENTS = {
  /** The place changed: in the middle of a fade, or at once. */
  place: 1,
  /** The player came to the door, or left it. */
  door: 2,
  /** A walk to a point ended. */
  arrived: 4,
  /** A fade began. */
  fading: 8,
} as const;

export type Place = "island" | "house";

export interface GameState {
  place: Place;
  /** Where the player stands: island tiles outdoors, room tiles in the house. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  nearDoor: boolean;
  /** 0 to 1 and back while going through the door. */
  fade: number;
  /** Where the player stands on the island while in the house. */
  outside: { x: number; z: number; yaw: number };
  walking: boolean;
  seconds: number;
  /** The tool in hand (an item, src/core/things.ts ITEM), or 0. */
  held: number;
  /** The action under way, and how far through it (0 to 1). */
  act: ActName;
  actT: number;
  /** Whether a line is out. */
  line: boolean;
}

/** How the player stands: the angles of their joints (src/character/model.ts). */
export interface Pose {
  bob: number;
  lean: number;
  head: number;
  armL: number;
  armR: number;
  armOut: number;
  legL: number;
  legR: number;
  breath: number;
}

let roomCommitted: unknown = null;

export const game = {
  /** The player on `map` at `at`, or in the house at `house`. */
  restore(map: IslandMap, at: { x: number; z: number; yaw: number }, house?: { x: number; z: number; yaw: number } | null): void {
    holdIsland(map);
    core().pi_game_restore(at.x, at.z, at.yaw, house ? 1 : 0, house?.x ?? 0, house?.z ?? 0, house?.yaw ?? 0);
  },

  /** The room the player walks in the house (its furniture in the way); the player steps aside from anything put where they stand. */
  room(state: RoomState, catalog: Catalog): void {
    const index = holdRoom(state, catalog);
    if (roomCommitted === index) return;
    core().pi_room_commit();
    roomCommitted = index;
  },

  enter(instant = false): number {
    return core().pi_game_enter(instant ? 1 : 0);
  },

  exit(instant = false): number {
    return core().pi_game_exit(instant ? 1 : 0);
  },

  /** Walk to (x, z) in the place's tiles; `enter` goes in at the end. False when there is no way. */
  walkTo(x: number, z: number, enter = false): boolean {
    return !!core().pi_game_walk_to(x, z, enter ? 1 : 0);
  },

  /** A frame: the stick in world axes (up the screen is -z), run held, a dialog open. Returns EVENTS. */
  step(sx: number, sz: number, run: boolean, busy: boolean, dt: number): number {
    return core().pi_game_step(sx, sz, run ? 1 : 0, busy ? 1 : 0, dt);
  },

  state(): GameState {
    const c = core();
    c.pi_game_state();
    const o = c.out;
    return {
      place: o[0] ? "house" : "island", x: o[1]!, y: o[2]!, z: o[3]!, yaw: o[4]!, speed: o[5]!, phase: o[6]!,
      nearDoor: !!o[7], fade: o[8]!, outside: { x: o[9]!, z: o[10]!, yaw: o[11]! }, walking: !!o[12], seconds: o[13]!,
      held: o[14]!, act: ACTS[o[15]!] ?? "", actT: o[16]!, line: !!o[17],
    };
  },

  /** A press outdoors: in at the door when standing there (not for picking up), else picking up,
   * shaking, chopping, digging, casting, reeling in or talking at the shop's counter
   * (src/core/things.ts PRESS). Returns EVENTS and OUTCOME flags. */
  act(press: Press = "any"): number {
    return core().pi_game_act(PRESSES.indexOf(press));
  },

  /** The corners still ahead on a walk to a point, the last being where it ends; empty when there is none. */
  goal(): { x: number; z: number }[] {
    const c = core();
    const n = c.pi_game_goal();
    const out: { x: number; z: number }[] = [];
    for (let k = 0; k < n; k++) out.push({ x: c.path[k * 2]!, z: c.path[k * 2 + 1]! });
    return out;
  },

  pose(): Pose {
    const c = core();
    c.pi_game_pose();
    const o = c.out;
    return { bob: o[0]!, lean: o[1]!, head: o[2]!, armL: o[3]!, armR: o[4]!, armOut: o[5]!, legL: o[6]!, legR: o[7]!, breath: o[8]! };
  },
};
