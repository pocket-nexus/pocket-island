// Where the player's joints are, in tiles from the feet, and the parts that
// turn about them (src/character/model.ts builds them, pose.ts turns them).
// Nothing here needs a renderer, so the console's interface reads it too.

export const JOINTS = {
  hip: 0.3,
  hipX: 0.075,
  shoulder: 0.53,
  shoulderX: 0.16,
  neck: 0.6,
  headCentre: 0.27,
  headRadius: 0.27,
} as const;

export type PartName = "body" | "head" | "armL" | "armR" | "legL" | "legR";
export const PART_NAMES: readonly PartName[] = ["body", "head", "armL", "armR", "legL", "legR"];
