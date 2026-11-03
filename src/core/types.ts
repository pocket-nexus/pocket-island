// The room's rules work in tiles. One tile is one world unit. Positions snap
// to half tiles, the way Animal Crossing: New Horizons lets furniture sit
// on half-tiles. This module and rules.ts import nothing from three.js, so
// the rules run (and are tested) without a renderer.

/** What an item is, for placement. */
export type Kind =
  /** Housewares: stands on the floor, collides with other floor items. */
  | "floor"
  /** Miscellaneous: stands on the floor or on a table's surface. */
  | "misc"
  /** Hangs on the back, left or right wall. */
  | "wall"
  /** Hangs from the ceiling. */
  | "ceiling"
  /** Lies flat under furniture; rugs never overlap each other. */
  | "rug";

export type Layer = "floor" | "rug" | "wall" | "ceiling" | "surface";
export type WallSide = "back" | "left" | "right";
/** Quarter turns clockwise seen from above. 0 faces the camera (+Z). */
export type Rot = 0 | 1 | 2 | 3;

/** The part of an item definition the rules read. */
export interface ItemSpec {
  id: string;
  kind: Kind;
  /** Floor, misc, ceiling and rug items: width and depth. Wall items: width and height. Tiles, multiples of 0.5. */
  size: [number, number];
  /**
   * A top that misc items can stand on, as a rectangle around the item's
   * centre in its unrotated frame: [x0, z0, x1, z1], tiles. `y` is its height.
   */
  surface?: { rect: [number, number, number, number]; y: number };
  /** Wall items: the centre height they are hung at when first placed. */
  hang?: number;
}

export interface Placement {
  uid: string;
  item: string;
  variant: number;
  layer: Layer;
  /**
   * Floor, rug and ceiling layers: the centre in room tiles, 0..w and 0..d,
   * z = 0 at the back wall. Surface layer: the centre in the host's
   * unrotated frame, relative to the host's centre.
   */
  x: number;
  z: number;
  /** Floor, rug, ceiling: absolute. Surface: relative to the host. Wall items do not turn. */
  rot: Rot;
  /** Wall layer: which wall, the centre along it (from its back or left end) and the centre height. */
  wall?: WallSide;
  u?: number;
  v?: number;
  /** Surface layer: the uid of the item this one stands on. */
  host?: string;
  /** Lamps, televisions and anything else that switches. */
  on?: boolean;
}

export interface Stored {
  item: string;
  variant: number;
}

export interface RoomState {
  /** Interior width (x) and depth (z) in tiles. */
  w: number;
  d: number;
  wallpaper: string;
  flooring: string;
  items: Placement[];
  /** What has been put away. */
  storage: Stored[];
}

/** An axis-aligned rectangle [x0, z0, x1, z1]. */
export type Rect = [number, number, number, number];

/** Why a placement is refused, for the interface to put into words. */
export type ProblemReason =
  | "unknown" | "wrong-layer" | "limit" | "no-wall" | "off-wall" | "wall-overlap"
  | "no-surface" | "off-surface" | "surface-overlap" | "off-room" | "door" | "rug-overlap" | "overlap";

export type Problem =
  | { code: "out"; reason: ProblemReason }
  | { code: "overlap"; reason: ProblemReason; with: string }
  | { code: "door"; reason: ProblemReason }
  | { code: "limit"; reason: ProblemReason }
  | { code: "surface"; reason: ProblemReason }
  | { code: "kind"; reason: ProblemReason };

export type Verdict = { ok: true } | { ok: false; problem: Problem };
