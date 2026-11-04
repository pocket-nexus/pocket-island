// How the player stands, drawn: the island's core works out the pose each frame (a walk that
// swings the legs and the opposite arms, a lean into a run, a breath at rest; crates/island-core
// src/pose.rs), and this turns the figure's joints by it.

import type { Pose } from "../core/game.ts";
import { JOINTS } from "./joints.ts";
import type { Character } from "./model.ts";

export type { Pose };

export function applyPose(c: Character, p: Pose): void {
  const { body, head, armL, armR, legL, legR } = c.parts;
  body.position.y = JOINTS.hip + p.bob;
  body.rotation.x = p.lean;
  body.scale.set(p.scaleXz, p.scaleY, p.scaleXz);
  head.rotation.x = p.head;
  // The left arm hangs at +x (the figure faces +z): out is a turn toward +x.
  armL.rotation.set(p.armL, 0, p.armOut);
  armR.rotation.set(p.armR, 0, -p.armOut);
  legL.rotation.x = p.legL;
  legR.rotation.x = p.legR;
}
