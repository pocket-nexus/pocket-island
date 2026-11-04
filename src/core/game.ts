// The player's game, as the island's core runs it (crates/island-core/src/game.rs): where the
// player is, how they walk there each frame, the door between the island and the house, and the
// fade while they go through it. A host hands it the stick and reads back where the player is and
// how they stand; it draws that and changes its scene when the place changes. In the house the
// player handles the furniture (crates/island-core/src/handle.rs): A held takes hold of a piece
// (`grab`), the stick then pushes, pulls or turns it, Y picks one up (`act("pick")`) and a piece in
// the pockets is put down (`put`); what that did to the room is `change()`, for the host to do to its
// own (src/core/edits.ts handled).

import { core } from "./abi.ts";
import { holdIsland, type IslandMap } from "./island.ts";
import { holdRoom, specIndex, LAYER, WALL, type Catalog } from "./rules.ts";
import type { Layer, RoomState, Rot, WallSide } from "./types.ts";
import { furnitureOf } from "../furniture/codes.ts";
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
  /** A foot came down (`game.surface()` says on what). */
  step: 1 << 16,
  /** In the house, a piece held began a move (`game.change()` says where it goes). */
  moved: 1 << 17,
  /** A move the room refused, or that left the player no room. */
  bump: 1 << 18,
  /** A piece went into the pockets or came out of them (`game.change()` says which). */
  room: 1 << 19,
} as const;

/** Why a piece in the pockets cannot be put down, beyond the room's reasons (rules.ts REASONS, 1 to 13): the core's `handle::refusal`. */
export const PUT_REFUSAL = { notFurniture: 20, busy: 21, noWall: 22, ceiling: 23 } as const;

/** What the player did to the room by hand: a piece (by its place in the room the core holds) moved or turned, taken into the pockets, or put down from them. */
export type RoomChange =
  | { kind: "moved"; index: number; x: number; z: number; rot: Rot }
  | { kind: "taken"; index: number }
  | { kind: "put"; layer: Layer; x: number; z: number; rot: Rot; wall?: WallSide; u?: number; v?: number; host: number };

const LAYERS = Object.keys(LAYER) as Layer[];
const WALLS = Object.keys(WALL) as WallSide[];

/** What is underfoot, by the core's numbers (game::surface): `floor` is the room's, as its flooring is. */
export const SURFACES = ["", "grass", "sand", "path", "wood", "stone", "rug", "floor"] as const;
export type Surface = (typeof SURFACES)[number];

export type Place = "island" | "house";

/** pi_game_state's numbers in `out` (the core's `ffi::gs`). */
export const GS = {
  place: 0, x: 1, y: 2, z: 3, yaw: 4, speed: 5, phase: 6, nearDoor: 7, fade: 8, outX: 9, outZ: 10, outYaw: 11,
  walking: 12, seconds: 13, held: 14, act: 15, actT: 16, line: 17, hold: 18,
} as const;
/** pi_game_pose's numbers in `out` (the core's `ffi::pose_out`). */
export const POSE = { bob: 0, lean: 1, head: 2, armL: 3, armR: 4, armOut: 5, legL: 6, legR: 7, breath: 8 } as const;

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
  /** In the house, the piece the player has hold of (its place in the room), or -1. */
  hold: number;
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
      place: o[GS.place] ? "house" : "island", x: o[GS.x]!, y: o[GS.y]!, z: o[GS.z]!, yaw: o[GS.yaw]!, speed: o[GS.speed]!, phase: o[GS.phase]!,
      nearDoor: !!o[GS.nearDoor], fade: o[GS.fade]!, outside: { x: o[GS.outX]!, z: o[GS.outZ]!, yaw: o[GS.outYaw]! }, walking: !!o[GS.walking],
      seconds: o[GS.seconds]!, held: o[GS.held]!, act: ACTS[o[GS.act]!] ?? "", actT: o[GS.actT]!, line: !!o[GS.line], hold: o[GS.hold]!,
    };
  },

  /** What the player stands on. */
  surface(): Surface {
    return SURFACES[core().pi_game_surface()] ?? "";
  },

  /** A press outdoors: in at the door when standing there (not for picking up), else picking up,
   * shaking, chopping, digging, casting, reeling in or talking at the shop's counter
   * (src/core/things.ts PRESSES). Returns EVENTS and OUTCOME flags. */
  act(press: Press = "any"): number {
    return core().pi_game_act(PRESSES.indexOf(press));
  },

  /**
   * A going down (`on`) or up in the house. Down takes hold of the piece on the floor just ahead and
   * returns its place in the room, or -1. Up lets go, and returns the place of what is just ahead when
   * the press was a tap that moved nothing (for the host to switch a lamp), or -1.
   */
  grab(on: boolean): number {
    return core().pi_game_grab(on ? 1 : 0);
  },

  /** The piece of furniture in pocket `slot` put down in front of the player: 0, or why not (the core's room::Reason, or PUT_REFUSAL). */
  put(slot: number, item: number, catalog: Catalog): number {
    const f = furnitureOf(item);
    const spec = f ? specIndex(catalog, f.id) : -1;
    return spec < 0 ? PUT_REFUSAL.notFurniture : core().pi_game_put(slot, spec);
  },

  /** What the player last did to the room (once: it is forgotten as it is read), or null. */
  change(): RoomChange | null {
    const c = core();
    const kind = c.pi_game_change();
    const o = c.out;
    if (kind === 1) return { kind: "moved", index: o[0]!, x: o[1]!, z: o[2]!, rot: o[3]! as Rot };
    if (kind === 2) return { kind: "taken", index: o[0]! };
    if (kind !== 3) return null;
    const layer = LAYERS[o[0]!] ?? "floor";
    const wall = WALLS[o[4]!];
    return { kind: "put", layer, x: o[1]!, z: o[2]!, rot: o[3]! as Rot, ...(wall ? { wall, u: o[5]!, v: o[6]! } : {}), host: o[7]! };
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
    return {
      bob: o[POSE.bob]!, lean: o[POSE.lean]!, head: o[POSE.head]!, armL: o[POSE.armL]!, armR: o[POSE.armR]!, armOut: o[POSE.armOut]!,
      legL: o[POSE.legL]!, legR: o[POSE.legR]!, breath: o[POSE.breath]!,
    };
  },
};
