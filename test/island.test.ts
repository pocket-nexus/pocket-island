import { describe, expect, test } from "bun:test";
import {
  GROUND, PROP_RADIUS, STEP_UP, TIER_Y, atDoor, bridgeAt, fits, groundAt, heightAt, inMap, islandWorld, makeIsland, rampAt, standable, tierAt,
} from "../src/core/island.ts";
import { WALKER_RADIUS, findPath, newWalker, stepWalker, type Walker, type WalkInput } from "../src/core/walk.ts";
import { game } from "../src/core/game.ts";
import { routeDots } from "../src/island/route.ts";
import { Clock } from "../src/core/clock.ts";
import { catalog } from "../src/furniture/catalog.ts";
import { defaultRoom } from "../src/presets.ts";

const m = makeIsland();
const world = islandWorld(m);

/** Walk toward (x, z) with the stick held that way for up to `seconds`. */
function walkTo(w: Walker, x: number, z: number, seconds = 8, run = false): Walker {
  for (let t = 0; t < seconds; t += 1 / 60) {
    const dx = x - w.x, dz = z - w.z, l = Math.hypot(dx, dz);
    if (l < 0.1) break;
    const input: WalkInput = { x: dx / l, z: dz / l, run };
    w = stepWalker(w, input, 1 / 60, world);
  }
  return w;
}

describe("the island's map", () => {
  test("the recipe makes the same island every time", () => {
    const again = makeIsland();
    expect(Buffer.from(again.tier).equals(Buffer.from(m.tier))).toBe(true);
    expect(Buffer.from(again.ground).equals(Buffer.from(m.ground))).toBe(true);
    expect(again.props).toEqual(m.props);
  });

  test("the edge of the map is sea, and the island is ringed by beach or rock", () => {
    for (let i = 0; i < m.w; i++) {
      expect(groundAt(m, i, 0)).toBe(GROUND.sea);
      expect(groundAt(m, i, m.d - 1)).toBe(GROUND.sea);
    }
    let beach = 0;
    for (let k = 0; k < m.w * m.d; k++) if (m.ground[k] === GROUND.sand) beach++;
    expect(beach).toBeGreaterThan(200);
  });

  test("a cliff climbs one tier at a time", () => {
    for (let j = 0; j < m.d; j++) for (let i = 0; i < m.w; i++) {
      if (groundAt(m, i, j) === GROUND.sea) continue;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        if (!inMap(m, i + di, j + dj) || groundAt(m, i + di, j + dj) === GROUND.sea) continue;
        expect(Math.abs(tierAt(m, i, j) - tierAt(m, i + di, j + dj))).toBeLessThanOrEqual(1);
      }
    }
  });

  test("there are three tiers above the beach, a river, inclines and bridges", () => {
    const tiers = new Set(m.tier);
    expect([...tiers].sort()).toEqual([0, 1, 2, 3]);
    expect(m.ramps.length).toBe(5);
    expect(m.bridges.length).toBe(4);
    expect(m.props.filter((p) => p.kind === "tree" || p.kind === "fruit" || p.kind === "cedar").length).toBeGreaterThan(40);
  });

  test("nothing with a footprint stands in the water, on the house, on an incline or on a bridge", () => {
    for (const p of m.props) {
      if (!PROP_RADIUS[p.kind]) continue;
      expect(standable(m, p.x, p.z)).toBe(true);
      expect(rampAt(m, p.x, p.z)).toBeNull();
      expect(bridgeAt(m, p.x, p.z)).toBeNull();
      const [x0, z0, x1, z1] = m.house.rect;
      expect(p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1).toBe(false);
    }
  });
});

describe("walking on the island", () => {
  test("every bit of land can be walked to from the door, over bridges and up inclines", () => {
    // A flood over tile centres, stepping where a walker fits from where it stands.
    const seen = new Set<number>();
    const start = Math.floor(m.spawn.z) * m.w + Math.floor(m.spawn.x);
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % m.w, j = (k / m.w) | 0, from = heightAt(m, i + 0.5, j + 0.5);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj, nk = nj * m.w + ni;
        if (!inMap(m, ni, nj) || seen.has(nk)) continue;
        // Half a tile at a time, as a walker climbs an incline a little at a time.
        const mx = i + 0.5 + di / 2, mz = j + 0.5 + dj / 2;
        if (!fits(m, mx, mz, 0.2, from) || !fits(m, ni + 0.5, nj + 0.5, 0.2, heightAt(m, mx, mz))) continue;
        seen.add(nk);
        stack.push(nk);
      }
    }
    let open = 0, missed: string[] = [];
    for (let j = 0; j < m.d; j++) for (let i = 0; i < m.w; i++) {
      if (!fits(m, i + 0.5, j + 0.5, 0.2, heightAt(m, i + 0.5, j + 0.5))) continue;
      open++;
      if (!seen.has(j * m.w + i)) missed.push(`${i},${j}:${tierAt(m, i, j)}`);
    }
    expect(open).toBeGreaterThan(1500);
    expect(missed.slice(0, 20)).toEqual([]);
  });

  test("the player starts in front of the door, on the island's floor, with room to stand", () => {
    expect(heightAt(m, m.spawn.x, m.spawn.z)).toBe(TIER_Y[1]);
    expect(fits(m, m.spawn.x, m.spawn.z, WALKER_RADIUS, TIER_Y[1])).toBe(true);
  });

  test("walking up to the door and facing it is being at the door", () => {
    let w = newWalker(m.spawn.x, m.spawn.z, TIER_Y[1]);
    w = walkTo(w, m.house.door.x, m.house.door.z - 1, 3);
    expect(atDoor(m, w.x, w.z, w.yaw)).toBe(true);
    // The house itself is in the way.
    expect(w.z).toBeGreaterThan(m.house.rect[3]);
  });

  test("the sea and the river are not walked into", () => {
    for (const [i, j] of [[2, 2], [36, 1]]) expect(standable(m, i + 0.5, j + 0.5)).toBe(false);
    let water: [number, number] | null = null;
    for (let j = 30; j < 50 && !water; j++) for (let i = 0; i < m.w && !water; i++) {
      if (groundAt(m, i, j) === GROUND.water && !bridgeAt(m, i + 0.5, j + 0.5)) water = [i + 0.5, j + 0.5];
    }
    expect(water).not.toBeNull();
    expect(fits(m, water![0], water![1], WALKER_RADIUS, TIER_Y[1])).toBe(false);
  });

  test("a cliff stops a walker; its incline takes it up", () => {
    const ramp = m.ramps[0]!;
    const [x0, z0, x1, z1] = ramp.rect;
    const mid = (x0 + x1) / 2;
    // Beside the incline, the cliff is a wall.
    let w = newWalker(x0 - 1.5, z1 + 1.5, ramp.low);
    w = walkTo(w, x0 - 1.5, z0 - 2, 4);
    expect(w.y).toBeCloseTo(ramp.low, 1);
    expect(w.z).toBeGreaterThan(z0);
    // Up the incline.
    w = newWalker(mid, z1 + 1.5, ramp.low);
    w = walkTo(w, mid, z0 - 1.5, 6);
    expect(w.z).toBeLessThan(z0);
    expect(heightAt(m, w.x, w.z)).toBeCloseTo(ramp.high, 5);
    expect(ramp.high - ramp.low).toBeGreaterThan(STEP_UP);
  });

  test("a bridge carries a walker across the river", () => {
    const b = m.bridges[0]!;
    const [x0, z0, x1, z1] = b.rect;
    const zc = (z0 + z1) / 2;
    let w = newWalker(x0 - 0.8, zc, heightAt(m, x0 - 0.8, zc));
    expect(fits(m, w.x, w.z, WALKER_RADIUS, w.y)).toBe(true);
    w = walkTo(w, x1 + 0.8, zc, 6);
    expect(w.x).toBeGreaterThan(x1);
  });

  test("a trunk in the way is slipped round, not stuck to", () => {
    const tree = m.props.find((p) => p.kind === "tree" && fits(m, p.x, p.z + 1.6, WALKER_RADIUS, heightAt(m, p.x, p.z)) && fits(m, p.x + 0.05, p.z - 1.6, WALKER_RADIUS, heightAt(m, p.x, p.z)))!;
    expect(tree).toBeDefined();
    // The stick held straight at the trunk, a little off its middle.
    let w = newWalker(tree.x + 0.05, tree.z + 1.6, heightAt(m, tree.x, tree.z));
    for (let k = 0; k < 120; k++) w = stepWalker(w, { x: 0, z: -1, run: false }, 1 / 60, world);
    expect(w.z).toBeLessThan(tree.z - 1);
  });

  test("a run is faster than a walk", () => {
    const start = newWalker(m.spawn.x, m.spawn.z, TIER_Y[1]);
    let walk = start, run = start;
    for (let k = 0; k < 30; k++) {
      walk = stepWalker(walk, { x: 1, z: 0, run: false }, 1 / 60, world);
      run = stepWalker(run, { x: 1, z: 0, run: true }, 1 / 60, world);
    }
    expect(run.x - start.x).toBeGreaterThan((walk.x - start.x) * 1.5);
    expect(walk.phase).toBeGreaterThan(0);
  });
});

describe("finding the way", () => {
  const bounds = [0, 0, m.w, m.d] as const;

  test("from the door to the top of the high cliff: over a bridge and up two inclines", () => {
    const top = m.ramps.find((r) => r.high === TIER_Y[3])!;
    // A tile and a half past the top of the incline.
    const [x0, z0, x1, z1] = top.rect;
    const target = { n: { x: (x0 + x1) / 2, z: z0 - 1.5 }, s: { x: (x0 + x1) / 2, z: z1 + 1.5 }, e: { x: x1 + 1.5, z: (z0 + z1) / 2 }, w: { x: x0 - 1.5, z: (z0 + z1) / 2 } }[top.up];
    const path = findPath(world, m.spawn, target, bounds)!;
    expect(path.length).toBeGreaterThan(2);
    let w = newWalker(m.spawn.x, m.spawn.z, TIER_Y[1]);
    for (const p of path) w = walkTo(w, p.x, p.z, 20, true);
    expect(Math.hypot(w.x - target.x, w.z - target.z)).toBeLessThan(0.5);
    expect(heightAt(m, w.x, w.z)).toBe(TIER_Y[3]);
  });

  test("a point in the river leads to its bank", () => {
    let water: { x: number; z: number } | null = null;
    for (let j = 34; j < 50 && !water; j++) for (let i = 20; i < 50 && !water; i++) {
      if (groundAt(m, i, j) === GROUND.water && !bridgeAt(m, i + 0.5, j + 0.5) && groundAt(m, i - 2, j) !== GROUND.water) water = { x: i + 0.5, z: j + 0.5 };
    }
    const path = findPath(world, m.spawn, water!, bounds)!;
    const end = path[path.length - 1]!;
    expect(standable(m, end.x, end.z)).toBe(true);
    expect(Math.hypot(end.x - water!.x, end.z - water!.z)).toBeLessThan(1.6);
  });
});

describe("where a click sends the player", () => {
  test("the corners ahead end where the walk ends, and go as the player gets there", () => {
    game.room(defaultRoom(), catalog);
    game.restore(m, m.spawn);
    expect(game.goal()).toEqual([]);
    const target = { x: m.spawn.x + 5.5, z: m.spawn.z + 3 };
    expect(game.walkTo(target.x, target.z)).toBe(true);
    const ahead = game.goal();
    expect(ahead.length).toBeGreaterThan(0);
    const end = ahead[ahead.length - 1]!;
    expect(Math.hypot(end.x - target.x, end.z - target.z)).toBeLessThan(0.6);
    for (let k = 0; k < 600 && game.state().walking; k++) game.step(0, 0, false, false, 1 / 60);
    expect(game.goal()).toEqual([]);
  });

  test("the dots stand along the way, a spacing apart, short of its end, and march toward it", () => {
    const from = { x: 0, z: 0 }, ahead = [{ x: 4, z: 0 }, { x: 4, z: 3 }];
    const at = (t: number) => routeDots(from, ahead, t, { spacing: 0.5, near: 0.3, ring: 0.6 });
    const dots = at(0);
    expect(dots.length).toBeGreaterThan(8);
    for (const d of dots) expect((d.z === 0 && d.x >= 0.3 && d.x <= 4) || (d.x === 4 && d.z >= 0 && d.z <= 3 - 0.6)).toBe(true);
    // Along the way, one after another, a spacing apart (round the corner, a little less in a straight line).
    for (let i = 1; i < dots.length; i++) {
      const gap = Math.hypot(dots[i]!.x - dots[i - 1]!.x, dots[i]!.z - dots[i - 1]!.z);
      expect(gap).toBeGreaterThan(0.35);
      expect(gap).toBeLessThan(0.5 + 1e-9);
    }
    // A moment later each has moved on toward the end.
    expect(at(0.1)[0]!.x).toBeGreaterThan(dots[0]!.x);
    expect(routeDots(from, [], 0)).toEqual([]);
  });
});

describe("the island's clock", () => {
  test("hours and days are the device's local time, through its time zone", () => {
    const c = new Clock();
    // 2026-11-03 20:15 UTC.
    const at = Date.UTC(2026, 10, 3, 20, 15);
    c.wall = () => at;
    c.zone = () => 0;
    expect(c.label()).toBe("20:15");
    const day = c.day();
    c.zone = () => 8 * 60;
    expect(c.label()).toBe("04:15");
    expect(c.day()).toBe(day + 1);
    // Scrubbing past midnight is the next day.
    c.zone = () => 0;
    c.scrub(4);
    expect(c.label()).toBe("00:15");
    expect(c.day()).toBe(day + 1);
  });
});
