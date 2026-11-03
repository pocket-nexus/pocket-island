// The island's map and its rules, the way an island life game lays one out:
// a grid of tiles, one world unit each, rising in tiers from the beach to
// two cliff tops, cut by a river that falls over the cliffs and splits
// before it reaches the sea. Inclines climb the cliffs, bridges cross the
// river, and trees, rocks, flowers and the player's house stand on tiles.
//
// The map is made by a recipe (`makeIsland`): the coast from a rounded
// outline, the beach as a band inside it, the tiers as regions to the north,
// then the river, the pond, the paths, the inclines and bridges where the
// paths need them, the house and what grows around it, each in a fixed
// order from one seed. The result is plain data (typed arrays and lists), so
// the browser, the console and a saved game read the same island.
//
// The rules say how high the ground is anywhere and whether a body fits
// there: water and the sea are not walked on, a cliff is not climbed except
// by an incline, and props with a footprint are in the way. They are the
// island's core (crates/island-core), which this module hands the map to;
// the recipe that makes the map is here, where the island is authored.

import { core } from "./abi.ts";
import { holdTrees } from "./things.ts";
import type { WalkWorld } from "./walk.ts";

export const ISLAND_W = 72;
export const ISLAND_D = 60;

/** What covers a tile. */
export const GROUND = { sea: 0, sand: 1, grass: 2, path: 3, water: 4 } as const;
export type Ground = (typeof GROUND)[keyof typeof GROUND];

/** The ground's height on each tier: 0 the beach, 1 the island's floor, 2 and 3 the cliff tops. */
export const TIER_Y = [0, 0.5, 1.5, 2.5] as const;
/** The sea's surface. */
export const SEA_LEVEL = -0.22;
/** A river or pond lies this far below its banks. */
export const WATER_DROP = 0.3;
/** The largest step a walker takes up or down without an incline (the beach's bank). */
export const STEP_UP = 0.55;

export type PropKind = "tree" | "fruit" | "cedar" | "palm" | "bush" | "flower" | "rock" | "lamp" | "mailbox" | "shell";

export interface Prop {
  kind: PropKind;
  /** Centre, in tiles. */
  x: number;
  z: number;
  /** Turn in radians, for variety; props are round enough not to care about the grid. */
  rot: number;
  variant: number;
}

/** How many looks each kind of prop has. */
export const PROP_VARIANTS: Record<PropKind, number> = {
  tree: 3, fruit: 3, cedar: 2, palm: 2, bush: 4, flower: 6, rock: 3, lamp: 1, mailbox: 1, shell: 3,
};

/** The trunk or body a walker bumps into, as a radius; 0 is walked through. */
export const PROP_RADIUS: Record<PropKind, number> = {
  tree: 0.36, fruit: 0.36, cedar: 0.4, palm: 0.26, bush: 0.42, flower: 0, rock: 0.42, lamp: 0.14, mailbox: 0.2, shell: 0,
};

export type Dir = "n" | "s" | "e" | "w";

/** An incline up a cliff: a rectangle of the lower tier whose ground rises toward `up`. */
export interface Ramp {
  rect: [number, number, number, number];
  up: Dir;
  low: number;
  high: number;
}

/** A bridge over the river: a deck across `axis` at height `y`. */
export interface Bridge {
  rect: [number, number, number, number];
  axis: "x" | "z";
  y: number;
}

/** The player's house: its footprint, and the door in the middle of its front (+z) wall. */
export interface House {
  rect: [number, number, number, number];
  door: { x: number; z: number };
}

export interface IslandMap {
  w: number;
  d: number;
  tier: Uint8Array;
  ground: Uint8Array;
  /** Tiles to the nearest sea tile (0 on the sea). */
  seaDistance: Float32Array;
  ramps: Ramp[];
  bridges: Bridge[];
  house: House;
  props: Prop[];
  /** Where the player first stands: in front of the door, facing out. */
  spawn: { x: number; z: number; yaw: number };
}

// ---------------------------------------------------------------- reading the map

export const inMap = (m: Pick<IslandMap, "w" | "d">, i: number, j: number) => i >= 0 && j >= 0 && i < m.w && j < m.d;
export const tileIndex = (m: Pick<IslandMap, "w">, i: number, j: number) => j * m.w + i;

export function tierAt(m: IslandMap, i: number, j: number): number {
  return inMap(m, i, j) ? m.tier[tileIndex(m, i, j)]! : 0;
}

export function groundAt(m: IslandMap, i: number, j: number): Ground {
  return (inMap(m, i, j) ? m.ground[tileIndex(m, i, j)]! : GROUND.sea) as Ground;
}

export const isWet = (g: Ground) => g === GROUND.sea || g === GROUND.water;

/** The surface of the water on a wet tile: the sea's, or a river's below its banks. */
export function waterLevel(m: IslandMap, i: number, j: number): number {
  const t = tierAt(m, i, j);
  return groundAt(m, i, j) === GROUND.sea || t === 0 ? SEA_LEVEL : TIER_Y[t]! - WATER_DROP;
}

const insideRect = (r: readonly number[], x: number, z: number) => x >= r[0]! && x <= r[2]! && z >= r[1]! && z <= r[3]!;

export function rampAt(m: IslandMap, x: number, z: number): Ramp | null {
  for (const r of m.ramps) if (insideRect(r.rect, x, z)) return r;
  return null;
}

export function bridgeAt(m: IslandMap, x: number, z: number): Bridge | null {
  for (const b of m.bridges) if (insideRect(b.rect, x, z)) return b;
  return null;
}

/** How far up an incline a point is, 0 at its foot and 1 at its top (for drawing its slope). */
export function rampRise(r: Ramp, x: number, z: number): number {
  const [x0, z0, x1, z1] = r.rect;
  const t = r.up === "n" ? (z1 - z) / (z1 - z0) : r.up === "s" ? (z - z0) / (z1 - z0) : r.up === "e" ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0);
  return Math.min(1, Math.max(0, t));
}

// The rules below are the island's core (crates/island-core/src/island.rs). It holds one island at
// a time: the map is handed over the first time a rule is asked of it.

const UP = { n: 0, s: 1, e: 2, w: 3 } as const;
let held: IslandMap | null = null;

/** Hand `m` to the core, unless it already holds it. */
export function holdIsland(m: IslandMap): void {
  if (held === m) return;
  const c = core();
  if (!c.pi_island_reset(m.w, m.d)) throw new Error(`the core holds islands up to 128 × 128 tiles; this one is ${m.w} × ${m.d}`);
  c.tiles(0).set(m.tier);
  c.tiles(1).set(m.ground);
  for (const r of m.ramps) c.pi_island_add_ramp(r.rect[0], r.rect[1], r.rect[2], r.rect[3], UP[r.up], r.low, r.high);
  for (const b of m.bridges) c.pi_island_add_bridge(b.rect[0], b.rect[1], b.rect[2], b.rect[3], b.y);
  const h = m.house;
  c.pi_island_set_house(h.rect[0], h.rect[1], h.rect[2], h.rect[3], h.door.x, h.door.z);
  for (const p of m.props) if (PROP_RADIUS[p.kind]) c.pi_island_add_prop(p.x, p.z, PROP_RADIUS[p.kind]);
  holdTrees(m);
  held = m;
}

/** The ground's height where a walker would stand: a bridge's deck, an incline, a tier, or a river bed's water. */
export function heightAt(m: IslandMap, x: number, z: number): number {
  holdIsland(m);
  return core().pi_island_height(x, z);
}

/** Whether a point is ground to stand on: not the sea or a river, unless a bridge spans it. */
export function standable(m: IslandMap, x: number, z: number): boolean {
  holdIsland(m);
  return !!core().pi_island_standable(x, z);
}

/** Whether a body of radius `r` fits at (x, z), coming from ground at height `from`. */
export function fits(m: IslandMap, x: number, z: number, r: number, from: number): boolean {
  holdIsland(m);
  return !!core().pi_island_fits(x, z, r, from);
}

/** The island as a world to walk in. */
export function islandWorld(m: IslandMap): WalkWorld {
  return { which: 0, hold: () => holdIsland(m), height: (x, z) => heightAt(m, x, z), fits: (x, z, r, from) => fits(m, x, z, r, from) };
}

/** Where a walker stands to go in at the door, as a rectangle in front of it. */
export function doorstep(m: IslandMap): [number, number, number, number] {
  const { x, z } = m.house.door;
  return [x - 0.6, z, x + 0.6, z + 0.9];
}

/** Whether a walker at (x, z) facing `yaw` is at the door and facing it. */
export function atDoor(m: IslandMap, x: number, z: number, yaw: number): boolean {
  holdIsland(m);
  return !!core().pi_island_at_door(x, z, yaw);
}

// ---------------------------------------------------------------- making the island

/** A small, fast generator of numbers in [0, 1) from a seed (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P2 = [number, number];

/** Distance from a point to a polyline. */
function toPolyline(x: number, z: number, line: readonly P2[]): number {
  let best = Infinity;
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k]!, [bx, bz] = line[k + 1]!;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Chamfer distance, in tiles, from every tile to the nearest tile where `seed` holds. */
export function distanceField(w: number, d: number, seed: (i: number, j: number) => boolean): Float32Array {
  const out = new Float32Array(w * d).fill(1e9);
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (seed(i, j)) out[j * w + i] = 0;
  const A = 1, B = Math.SQRT2;
  const relax = (i: number, j: number, di: number, dj: number, c: number) => {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= w || nj >= d) return;
    const v = out[nj * w + ni]! + c;
    if (v < out[j * w + i]!) out[j * w + i] = v;
  };
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    relax(i, j, -1, 0, A); relax(i, j, 0, -1, A); relax(i, j, -1, -1, B); relax(i, j, 1, -1, B);
  }
  for (let j = d - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    relax(i, j, 1, 0, A); relax(i, j, 0, 1, A); relax(i, j, 1, 1, B); relax(i, j, -1, 1, B);
  }
  return out;
}

/** The recipe's shapes, in tiles: what the island is made from. */
export const RECIPE = {
  seed: 20261103,
  centre: [36, 30.5] as P2,
  radius: [31, 25.5] as P2,
  /** The second tier's lobes, beyond the band across the north, and the third tier's tops. */
  cliffs: [
    { centre: [14, 22] as P2, radius: [9, 9] as P2 },
    { centre: [59, 21] as P2, radius: [8, 7.5] as P2 },
  ],
  peaks: [
    { centre: [47, 12.5] as P2, radius: [8.5, 4.6] as P2 },
    { centre: [14, 12] as P2, radius: [5.5, 4] as P2 },
  ],
  /** The river: from a spring on the high cliff down to a fork, then to two mouths on the beach. */
  river: [[47.5, 11], [47.5, 14], [45.5, 19.5], [41, 25], [38, 31]] as P2[],
  riverWest: [[38, 31], [33, 37], [27, 43], [22, 50], [19, 58]] as P2[],
  riverEast: [[38, 31], [43, 38], [48, 45], [52, 52], [55, 59]] as P2[],
  pond: { centre: [13.5, 23] as P2, radius: [2.8, 2] as P2 },
  /** The house's footprint and its door. */
  house: { rect: [33, 41, 37, 44] as [number, number, number, number] },
  /** Paths, from the door out. */
  paths: [
    [[35, 44.2], [35, 47.5], [36, 52]],
    [[35, 46], [30.5, 45.5], [27, 43.5], [22.5, 41], [19, 36], [17, 32]],
    [[35, 46], [40, 46.5], [46.5, 43]],
  ] as P2[][],
  /** Inclines: where one climbs, the tier it climbs from, which way is up. */
  ramps: [
    { x: 16, z: 32, from: 1, up: "n" as Dir },
    { x: 28, z: 19, from: 1, up: "n" as Dir },
    { x: 48, z: 22, from: 1, up: "e" as Dir },
    { x: 35, z: 10, from: 2, up: "e" as Dir },
    { x: 13, z: 19, from: 2, up: "n" as Dir },
  ],
  /** Bridges: a point on the river they cross, across which axis. */
  bridges: [
    { x: 27, z: 43.5, axis: "x" as const },
    { x: 46.5, z: 42.5, axis: "x" as const },
    { x: 41.5, z: 25, axis: "x" as const },
    { x: 47, z: 11.5, axis: "x" as const },
  ],
};

/** Each edge's wobble: a coastline that reads as drawn, not as an ellipse. */
function coastWobble(a: number): number {
  return 0.05 * Math.sin(3 * a + 1.3) + 0.035 * Math.sin(5 * a + 0.4) + 0.02 * Math.sin(9 * a + 2.1) + 0.012 * Math.sin(14 * a + 0.7);
}

export function makeIsland(recipe = RECIPE): IslandMap {
  const w = ISLAND_W, d = ISLAND_D, n = w * d;
  const rand = random(recipe.seed);
  const tier = new Uint8Array(n);
  const ground = new Uint8Array(n);
  const at = (i: number, j: number) => j * w + i;
  const [cx, cz] = recipe.centre, [rx, rz] = recipe.radius;

  // The coast: a squarish rounded outline with a wobble.
  const land = new Uint8Array(n);
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const nx = (i + 0.5 - cx) / rx, nz = (j + 0.5 - cz) / rz;
    const r = Math.pow(Math.abs(nx) ** 3.2 + Math.abs(nz) ** 3.2, 1 / 3.2);
    land[at(i, j)] = r < 1 + coastWobble(Math.atan2(nz, nx)) ? 1 : 0;
  }
  // Only the main island, with no lakes of sea inside it.
  const keep = (mask: Uint8Array, value: number, from: P2[]) => {
    const seen = new Uint8Array(n);
    const stack = from.filter(([i, j]) => mask[at(i, j)] === value).map(([i, j]) => at(i, j));
    for (const s of stack) seen[s] = 1;
    while (stack.length) {
      const s = stack.pop()!;
      const i = s % w, j = (s / w) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di!, nj = j + dj!;
        if (ni < 0 || nj < 0 || ni >= w || nj >= d) continue;
        const k = at(ni, nj);
        if (!seen[k] && mask[k] === value) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    return seen;
  };
  const border: P2[] = [];
  for (let i = 0; i < w; i++) border.push([i, 0], [i, d - 1]);
  for (let j = 0; j < d; j++) border.push([0, j], [w - 1, j]);
  const sea = keep(land, 0, border);
  const main = keep(land, 1, [[Math.floor(cx), Math.floor(cz)]]);
  for (let k = 0; k < n; k++) land[k] = sea[k] ? 0 : main[k] ? 1 : land[k] ? 0 : 1;

  const seaDistance = distanceField(w, d, (i, j) => !land[at(i, j)]);
  const noise = (x: number, z: number, s: number) => Math.sin(x * 0.31 + s) * Math.cos(z * 0.27 + s * 1.7) + 0.5 * Math.sin(x * 0.13 - z * 0.11 + s * 3.1);

  // The beach: a band inside the coast, wide in the south, a strip in the rocky north.
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const k = at(i, j);
    if (!land[k]) {
      ground[k] = GROUND.sea;
      continue;
    }
    const south = Math.max(0, Math.min(1, (j - 18) / 24));
    const band = 1.4 + 3.4 * south + 0.6 * noise(i, j, 1);
    tier[k] = seaDistance[k]! < band ? 0 : 1;
    ground[k] = tier[k] ? GROUND.grass : GROUND.sand;
  }

  // The cliff tops: the second tier, a band across the north with a lobe at each end, and the
  // third, a plateau in the north east and a knoll in the north west.
  const blob = (x: number, z: number, b: { centre: P2; radius: P2 }, seed: number) => {
    const nx = (x - b.centre[0]) / b.radius[0], nz = (z - b.centre[1]) / b.radius[1];
    const a = Math.atan2(nz, nx);
    return Math.hypot(nx, nz) < 1 + 0.13 * Math.sin(3 * a + seed) + 0.08 * Math.sin(5 * a + seed * 2.3);
  };
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const k = at(i, j);
    if (tier[k] !== 1 || seaDistance[k]! < 3.2) continue;
    const x = i + 0.5, z = j + 0.5;
    const band = 15.5 + 2.8 * Math.sin(x * 0.27 + 0.6) + 1.8 * Math.sin(x * 0.12 + 2.0);
    if (z < band || recipe.cliffs.some((b, s2) => blob(x, z, b, s2 * 1.7 + 0.4))) tier[k] = 2;
  }
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const k = at(i, j);
    if (tier[k] !== 2 || seaDistance[k]! < 4.5) continue;
    if (recipe.peaks.some((b, s2) => blob(i + 0.5, j + 0.5, b, s2 * 2.1 + 1.1))) tier[k] = 3;
  }
  const smooth = (t: number) => {
    for (let pass = 0; pass < 3; pass++) {
      const next = tier.slice();
      for (let j = 1; j < d - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = at(i, j);
        let up = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && tier[at(i + di, j + dj)]! >= t) up++;
        if (tier[k] === t && up < 4) next[k] = t - 1;
        else if (tier[k] === t - 1 && up >= 6 && land[k] && t > 1) next[k] = t;
      }
      tier.set(next);
    }
  };
  smooth(2);
  smooth(3);
  // No tongue or ridge of a tier narrower than three tiles: a tile stays up only if some 3 × 3
  // block around it is all at least its tier.
  for (const t of [3, 2]) {
    const next = tier.slice();
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (tier[at(i, j)]! < t) continue;
      let held = false;
      for (let cj = -1; cj <= 1 && !held; cj++) for (let ci = -1; ci <= 1 && !held; ci++) {
        let all = true;
        for (let dj = -1; dj <= 1 && all; dj++) for (let di = -1; di <= 1 && all; di++) {
          const ni = i + ci + di, nj = j + cj + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= d || tier[at(ni, nj)]! < t) all = false;
        }
        held = all;
      }
      if (!held) next[at(i, j)] = t - 1;
    }
    tier.set(next);
  }
  // A cliff climbs one tier at a time: no tile stands two tiers above a neighbour.
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const k = at(i, j);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= d) continue;
        const nt = land[at(ni, nj)] ? tier[at(ni, nj)]! : 0;
        if (tier[k]! > nt + 1 || (tier[k]! >= 2 && !land[at(ni, nj)])) tier[k] = Math.max(nt + 1, 1);
      }
    }
  }
  for (let k = 0; k < n; k++) if (land[k]) ground[k] = tier[k] ? GROUND.grass : GROUND.sand;

  // The river and its two arms, wider downstream, and the pond.
  const water = (line: P2[], half: number) => {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (toPolyline(i + 0.5, j + 0.5, line) <= half) ground[at(i, j)] = land[at(i, j)] ? GROUND.water : GROUND.sea;
    }
  };
  water(recipe.river, 1.05);
  water(recipe.riverWest, 1.1);
  water(recipe.riverEast, 1.1);
  {
    const { centre: [px, pz], radius: [prx, prz] } = recipe.pond;
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (((i + 0.5 - px) / prx) ** 2 + ((j + 0.5 - pz) / prz) ** 2 <= 1) ground[at(i, j)] = GROUND.water;
    }
  }

  // The house stands on the island's floor with room around it.
  const house: House = { rect: recipe.house.rect, door: { x: (recipe.house.rect[0] + recipe.house.rect[2]) / 2, z: recipe.house.rect[3] } };
  {
    const [x0, z0, x1, z1] = house.rect;
    for (let j = z0 - 2; j < z1 + 3; j++) for (let i = x0 - 2; i < x1 + 2; i++) {
      if (!inMap({ w, d }, i, j) || !land[at(i, j)]) continue;
      tier[at(i, j)] = 1;
      ground[at(i, j)] = GROUND.grass;
    }
  }

  // Paths, worn into the grass.
  for (const line of recipe.paths) {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const k = at(i, j);
      if (ground[k] === GROUND.grass && toPolyline(i + 0.5, j + 0.5, line) <= 0.72) ground[k] = GROUND.path;
    }
  }

  // Inclines: going uphill from the asked-for point, the first tile of the upper tier is the
  // cliff's foot. The slope is cut two tiles into the cliff over two tiles of width, with the
  // cliff standing on either side of it; the two tiles before it are level ground to walk up from.
  const ramps: Ramp[] = [];
  const UP: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  for (const spec of recipe.ramps) {
    const [ux, uz] = UP[spec.up];
    const [vx, vz] = ux ? [0, 1] : [1, 0];
    const from = spec.from;
    const tile = (k: number, side: number): [number, number] => [spec.x + ux * k + vx * side, Math.floor(spec.z) + uz * k + vz * side];
    let foot = -1;
    for (let k = 0; k < 12; k++) {
      const [ai, aj] = tile(k, 0), [bi, bj] = tile(k, 1);
      if (!inMap({ w, d }, ai, aj) || !inMap({ w, d }, bi, bj)) break;
      if (tier[at(ai, aj)] === from + 1 || tier[at(bi, bj)] === from + 1) {
        foot = k;
        break;
      }
    }
    if (foot < 0) continue;
    for (let k = foot - 2; k <= foot + 2; k++) {
      for (let side = -1; side <= 2; side++) {
        const [i, j] = tile(k, side);
        if (!inMap({ w, d }, i, j)) continue;
        const slope = k === foot || k === foot + 1;
        const t = k < foot ? from : k > foot + 1 ? from + 1 : side === -1 || side === 2 ? from + 1 : from;
        tier[at(i, j)] = t;
        if (ground[at(i, j)] !== GROUND.water) ground[at(i, j)] = slope && side >= 0 && side <= 1 ? GROUND.path : GROUND.grass;
      }
    }
    // The slope's rectangle, from its foot's outer edge to its top's.
    const [ai, aj] = tile(foot, 0), [bi, bj] = tile(foot + 1, 1);
    const rect: [number, number, number, number] = [Math.min(ai, bi), Math.min(aj, bj), Math.max(ai, bi) + 1, Math.max(aj, bj) + 1];
    ramps.push({ rect, up: spec.up, low: TIER_Y[from]!, high: TIER_Y[from + 1]! });
  }

  // Bridges: across the river at the asked-for point, from bank to bank.
  const bridges: Bridge[] = [];
  for (const spec of recipe.bridges) {
    const j = Math.floor(spec.z), i = Math.floor(spec.x);
    if (spec.axis === "x") {
      let a = i, b = i;
      while (a > 0 && ground[at(a - 1, j)] === GROUND.water) a--;
      while (b < w - 1 && ground[at(b + 1, j)] === GROUND.water) b++;
      const t = Math.max(tier[at(a - 1, j)]!, tier[at(b + 1, j)]!);
      bridges.push({ rect: [a - 0.5, j - 0.5, b + 1.5, j + 1.5], axis: "x", y: TIER_Y[t]! + 0.06 });
    } else {
      let a = j, b = j;
      while (a > 0 && ground[at(i, a - 1)] === GROUND.water) a--;
      while (b < d - 1 && ground[at(i, b + 1)] === GROUND.water) b++;
      const t = Math.max(tier[at(i, a - 1)]!, tier[at(i, b + 1)]!);
      bridges.push({ rect: [i - 0.5, a - 0.5, i + 1.5, b + 1.5], axis: "z", y: TIER_Y[t]! + 0.06 });
    }
  }

  const map: IslandMap = {
    w, d, tier, ground, seaDistance, ramps, bridges, house, props: [],
    spawn: { x: house.door.x, z: house.door.z + 1.2, yaw: 0 },
  };
  map.props = scatter(map, rand);
  return map;
}

// ---------------------------------------------------------------- what grows

/** Whether a tile is grass with every neighbour on its own tier and dry: no cliff's lip, no bank. */
function interior(m: IslandMap, i: number, j: number, reach = 1): boolean {
  const t = tierAt(m, i, j);
  for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
    if (tierAt(m, i + di, j + dj) !== t || isWet(groundAt(m, i + di, j + dj))) return false;
  }
  return true;
}

function scatter(m: IslandMap, rand: () => number): Prop[] {
  const props: Prop[] = [];
  const taken = new Uint8Array(m.w * m.d);
  const [hx0, hz0, hx1, hz1] = m.house.rect;
  const nearHouse = (i: number, j: number, pad: number) => i + 1 > hx0 - pad && i < hx1 + pad && j + 1 > hz0 - pad && j < hz1 + pad + 1;
  const blocked = (i: number, j: number) => {
    if (taken[tileIndex(m, i, j)]) return true;
    if (rampAt(m, i + 0.5, j + 0.5) || bridgeAt(m, i + 0.5, j + 0.5)) return true;
    for (const r of m.ramps) if (i + 1 > r.rect[0] - 1 && i < r.rect[2] + 1 && j + 1 > r.rect[1] - 1 && j < r.rect[3] + 2) return true;
    for (const b of m.bridges) if (i + 1 > b.rect[0] - 1 && i < b.rect[2] + 1 && j + 1 > b.rect[1] - 1 && j < b.rect[3] + 1) return true;
    return false;
  };
  const far = (x: number, z: number, kinds: PropKind[], spacing: number) =>
    props.every((p) => !kinds.includes(p.kind) || (p.x - x) ** 2 + (p.z - z) ** 2 >= spacing * spacing);
  /** A prop centred at (x, z), moved up to half `jitter` either way. */
  const put = (kind: PropKind, x: number, z: number, jitter = 0) => {
    const p: Prop = {
      kind, x: x + (rand() - 0.5) * jitter, z: z + (rand() - 0.5) * jitter,
      rot: rand() * Math.PI * 2, variant: Math.floor(rand() * PROP_VARIANTS[kind]),
    };
    props.push(p);
    if (PROP_RADIUS[kind]) taken[tileIndex(m, Math.floor(x), Math.floor(z))] = 1;
    return p;
  };
  const tiles: P2[] = [];
  for (let j = 0; j < m.d; j++) for (let i = 0; i < m.w; i++) tiles.push([i, j]);
  const shuffled = () => {
    const out = tiles.slice();
    for (let k = out.length - 1; k > 0; k--) {
      const s = Math.floor(rand() * (k + 1));
      [out[k], out[s]] = [out[s]!, out[k]!];
    }
    return out;
  };
  // Groves: trees gather where this is high and leave clearings where it is low.
  const grove = (x: number, z: number) => Math.sin(x * 0.21 + 0.4) * Math.cos(z * 0.18 - 0.9) + 0.6 * Math.sin((x + z) * 0.09 + 1.7);
  const ground = (i: number, j: number) => groundAt(m, i, j);

  // The house's own things: a mailbox by the door, lamps along the path, fruit trees and flowers.
  put("mailbox", m.house.door.x + 1.6, m.house.door.z + 0.35).rot = 0;
  for (const [x, z] of [[33.5, 47.2], [37.8, 46.9], [30, 44.4]] as P2[]) put("lamp", x, z);
  for (const [x, z, v] of [[31.5, 41.5, 0], [39.5, 42.5, 1], [31, 39, 2], [40, 39.5, 0]] as const) put("fruit", x, z).variant = v;

  for (const [i, j] of shuffled()) {
    const g = ground(i, j), t = tierAt(m, i, j), x = i + 0.5, z = j + 0.5;
    if (blocked(i, j)) continue;
    if (g === GROUND.grass && interior(m, i, j) && !nearHouse(i, j, 3)) {
      const want = grove(x, z);
      if (t === 3 && rand() < 0.5 && far(x, z, ["cedar", "tree", "fruit"], 2.3)) put("cedar", x, z, 0.3);
      else if (want > 0.05 && rand() < 0.6 && far(x, z, ["tree", "fruit", "cedar", "palm"], 2.4)) put(t >= 2 && rand() < 0.4 ? "cedar" : rand() < 0.15 ? "fruit" : "tree", x, z, 0.3);
      else if (want > -0.2 && rand() < 0.05 && far(x, z, ["tree", "fruit", "cedar", "bush"], 2.2)) put("bush", x, z, 0.2);
    } else if (g === GROUND.sand && m.seaDistance[tileIndex(m, i, j)]! >= 1.5 && interior(m, i, j, 0)) {
      if (rand() < 0.05 && far(x, z, ["palm"], 5)) put("palm", x, z, 0.3);
      else if (rand() < 0.02) put("shell", x, z, 0.6);
    }
  }
  // Rocks, a few, on the island's floor.
  let rocks = 0;
  for (const [i, j] of shuffled()) {
    if (rocks >= 7) break;
    if (blocked(i, j) || ground(i, j) !== GROUND.grass || tierAt(m, i, j) !== 1 || !interior(m, i, j) || nearHouse(i, j, 4)) continue;
    if (!far(i + 0.5, j + 0.5, ["rock", "tree", "fruit", "cedar", "bush"], 3.5)) continue;
    put("rock", i + 0.5, j + 0.5);
    rocks++;
  }
  // Flowers: beds by the house, and patches about the island.
  const patch = (cxp: number, czp: number, count: number, variant: number) => {
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 1.6;
      const x = cxp + Math.cos(a) * r, z = czp + Math.sin(a) * r;
      const i = Math.floor(x), j = Math.floor(z);
      if (!inMap(m, i, j) || ground(i, j) !== GROUND.grass || !interior(m, i, j, 0) || taken[tileIndex(m, i, j)]) continue;
      if (m.house.rect[0] - 0.3 < x && x < m.house.rect[2] + 0.3 && m.house.rect[1] - 0.3 < z && z < m.house.rect[3] + 0.3) continue;
      if (!far(x, z, ["flower"], 0.55)) continue;
      props.push({ kind: "flower", x, z, rot: rand() * Math.PI * 2, variant });
    }
  };
  patch(32.2, 44.8, 6, 0);
  patch(38, 44.8, 6, 2);
  patch(32, 39.6, 4, 4);
  patch(38.5, 40.2, 4, 1);
  for (const [i, j] of shuffled()) {
    if (props.filter((p) => p.kind === "flower").length > 140) break;
    if (ground(i, j) !== GROUND.grass || !interior(m, i, j) || nearHouse(i, j, 2) || rand() > 0.012) continue;
    patch(i + 0.5, j + 0.5, 7, Math.floor(rand() * PROP_VARIANTS.flower));
  }
  return props;
}
