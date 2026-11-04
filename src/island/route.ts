// The dots along the way a click or a tap sent the player, as the island's ground, the browser's
// phone map and the console's phone map draw them: whole spacings back from where the walk ends, less
// a share that grows with the clock, so that they march toward the end however the player walks. The
// core lays them out (crates/island-core/src/route.rs), here and for the console's upper screen
// (programs/3ds-island/src/scene.c, draw_route, through pi_route_ground).

import { core } from "../core/abi.ts";

export interface Point {
  x: number;
  z: number;
}

/** How the dots are spaced; any left out are the ground's (route::GROUND). */
export interface DotSpacing {
  /** Tiles between dots. */
  spacing?: number;
  /** How far past the player the first may stand, and how far short of the end the last. */
  near?: number;
  ring?: number;
  /** The most dots, and how fast they march (tiles a second). */
  most?: number;
  march?: number;
}

/** Where the dots stand at time `t` (seconds) along a way from `from` through the corners `ahead`, in the way's own coordinates. */
export function routeDots(from: Point, ahead: readonly Point[], t: number, o: DotSpacing = {}): Point[] {
  const c = core();
  const n = Math.min(ahead.length, c.path.length / 2);
  for (let k = 0; k < n; k++) {
    c.path[k * 2] = ahead[k]!.x;
    c.path[k * 2 + 1] = ahead[k]!.z;
  }
  const m = c.pi_route_dots(from.x, from.z, n, t, o.spacing ?? 0, o.near ?? 0, o.ring ?? 0, o.most ?? 0, o.march ?? 0);
  return Array.from({ length: m }, (_, k) => ({ x: c.dots[k * 2]!, z: c.dots[k * 2 + 1]! }));
}
