// How the player moves its parts: a walk that swings the legs and the
// opposite arms, bobs and leans into a run, and at rest a slow breath. A
// pose is a few angles from the walker's step phase, its speed and the
// time, so the browser and the console pose the same figure alike.

import { RUN_SPEED, WALK_SPEED } from "../core/walk.ts";
import { JOINTS, type Character } from "./model.ts";

export interface Pose {
  /** The hips' lift above standing, tiles. */
  bob: number;
  /** The body's lean forward, radians. */
  lean: number;
  head: number;
  /** Each limb's swing forward about its joint's x axis; the arms also swing out about z. */
  armL: number;
  armR: number;
  armOut: number;
  legL: number;
  legR: number;
  /** At rest, the breath's stretch of the body. */
  breath: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function pose(phase: number, speed: number, seconds: number): Pose {
  const move = clamp01(speed / WALK_SPEED);
  const run = clamp01((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
  const swing = Math.sin(phase * Math.PI);
  const legs = (0.55 + 0.3 * run) * move;
  const arms = (0.55 + 0.45 * run) * move;
  const rest = 1 - move;
  return {
    bob: (1 - Math.abs(swing)) * (0.03 + 0.03 * run) * move,
    lean: 0.05 * move + 0.16 * run,
    head: -0.4 * (0.05 * move + 0.16 * run) + Math.sin(seconds * 0.9) * 0.04 * rest,
    armL: -swing * arms,
    armR: swing * arms,
    armOut: 0.1 + 0.12 * run + 0.03 * Math.sin(seconds * 2.4) * rest,
    legL: swing * legs,
    legR: -swing * legs,
    breath: Math.sin(seconds * 2.4) * 0.012 * rest,
  };
}

export function applyPose(c: Character, p: Pose): void {
  const { body, head, armL, armR, legL, legR } = c.parts;
  body.position.y = JOINTS.hip + p.bob;
  body.rotation.x = p.lean;
  body.scale.set(1 - p.breath * 0.5, 1 + p.breath, 1 - p.breath * 0.5);
  head.rotation.x = p.head;
  // The left arm hangs at +x (the figure faces +z): out is a turn toward +x.
  armL.rotation.set(p.armL, 0, p.armOut);
  armR.rotation.set(p.armR, 0, -p.armOut);
  legL.rotation.x = p.legL;
  legR.rotation.x = p.legR;
}
