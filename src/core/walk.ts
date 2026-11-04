// Walking: how the player moves over a world that says where a body may stand, on the island or
// in the house. The rules are the island's core (crates/island-core/src/walk.rs), reached through
// its C interface (src/core/abi.ts): the walker turns toward the stick, accelerates to a walk or a
// run, slides round what is in the way, and finds its way on a grid of half tiles for a click.

import { core } from "./abi.ts";

export interface Walker {
  /** Where it stands, in tiles; y is the ground under it, eased onto a bank or a step. */
  x: number;
  z: number;
  y: number;
  /** Facing: 0 looks toward +z (the camera), turning counter-clockwise seen from above. */
  yaw: number;
  /** Tiles a second it means to go: it accelerates toward the stick's speed, and stops dead against a wall. */
  speed: number;
  /** The walk cycle's phase in steps (one step is half a cycle). */
  phase: number;
}

export interface WalkInput {
  /** Where to go, in world axes, length 0..1. */
  x: number;
  z: number;
  run: boolean;
}

/** A world the core walks: the island it holds (0), or the room it last committed (1). */
export interface WalkWorld {
  readonly which: 0 | 1;
  /** The ground's height at a point. */
  height(x: number, z: number): number;
  /** Whether a body of radius `r` fits with its centre at (x, z), coming from ground at height `from`. */
  fits(x: number, z: number, r: number, from: number): boolean;
  /** Make this world the one the core holds, when another has taken its place. */
  hold?(): void;
}

/** The core's speeds and the walker's size (crates/island-core/src/walk.rs). */
export const WALK_SPEED = 3.1;
export const RUN_SPEED = 6.2;
export const WALKER_RADIUS = 0.28;

export function newWalker(x: number, z: number, y: number, yaw = 0): Walker {
  return { x, z, y, yaw, speed: 0, phase: 0 };
}

/** One step of `dt` seconds. Returns a new walker. */
export function stepWalker(w: Walker, input: WalkInput, dt: number, world: WalkWorld): Walker {
  world.hold?.();
  const c = core();
  c.pi_walk_step(world.which, w.x, w.z, w.y, w.yaw, w.speed, w.phase, input.x, input.z, input.run ? 1 : 0, dt);
  const o = c.out;
  return { x: o[0]!, z: o[1]!, y: o[2]!, yaw: o[3]!, speed: o[4]!, phase: o[5]! };
}

export interface Point {
  x: number;
  z: number;
}

/**
 * A way from `from` to `to` through `world` on a grid of half tiles inside `bounds` ([x0, z0, x1, z1]):
 * the corners where it turns, ending at `to` or, when nothing can stand there, at the nearest place
 * that can be reached. Null when the walker cannot move at all.
 */
export function findPath(world: WalkWorld, from: Point, to: Point, bounds: readonly [number, number, number, number]): Point[] | null {
  world.hold?.();
  const c = core();
  const n = c.pi_walk_path(world.which, from.x, from.z, to.x, to.z, bounds[0], bounds[1], bounds[2], bounds[3]);
  if (n < 0) return null;
  const out: Point[] = [];
  for (let k = 0; k < n; k++) out.push({ x: c.path[k * 2]!, z: c.path[k * 2 + 1]! });
  return out;
}
