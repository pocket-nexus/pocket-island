// The dots along the way a click or a tap sent the player, as the island's ground, the browser's
// phone map and the console's phone map draw them: whole spacings back from where the walk ends, less
// a share that grows with the clock, so that they march toward the end however the player walks. The
// console's upper screen draws the same in C (programs/3ds-island/src/scene.c, draw_route).

export interface Point {
  x: number;
  z: number;
}

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
  const spacing = o.spacing ?? 0.62, near = o.near ?? 0.35, ring = o.ring ?? 0.6, most = o.most ?? 48, march = o.march ?? 1;
  const out: Point[] = [];
  if (!ahead.length) return out;
  let length = 0, ax = from.x, az = from.z;
  for (const p of ahead) {
    length += Math.hypot(p.x - ax, p.z - az);
    ax = p.x, az = p.z;
  }
  const back = spacing - ((t * march) % spacing), at = length - back - near;
  let next = at >= 0 ? near + (at % spacing) : length, walked = 0;
  ax = from.x, az = from.z;
  for (const p of ahead) {
    const len = Math.hypot(p.x - ax, p.z - az);
    while (len > 0 && next <= walked + len && next < length - ring && out.length < most) {
      const f = (next - walked) / len;
      out.push({ x: ax + (p.x - ax) * f, z: az + (p.z - az) * f });
      next += spacing;
    }
    walked += len;
    ax = p.x, az = p.z;
  }
  return out;
}
