// What the hosts keep of the core's numbers, held to the core itself: the constants and codes that
// src/core/*.ts and programs/3ds-island/src/core.h restate (a host reads the core's results by them),
// the room's and the island's geometry that the interfaces draw with, and the console's bindings,
// which tools/bindings.ts writes from crates/island-core/src/ffi.rs.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderBindings } from "../tools/bindings.ts";
import { CHANGE, CHANGE_OUT, EVENTS, GS, PIECE_EASE, POSE, PUT_REFUSAL, SURFACES } from "../src/core/game.ts";
import { FURNITURE, LOOKS } from "../src/furniture/codes.ts";
import { GROUND, SEA_LEVEL, STEP_UP, TIER_Y, WATER_DROP, heightAt, makeIsland, rampRise, waterLevel, bridgeAt, rampAt } from "../src/core/island.ts";
import { ITEM_LIMIT, KIND, LAYER, REASONS, WALL, WALL_HEIGHT, check, doorRect } from "../src/core/rules.ts";
import { ACTS, BOX, HINTS, ITEM, LINE_POINTS, MAX_FISH, OUTCOME, POCKETS, PRESSES, SHOW, VIEW_FIELDS } from "../src/core/things.ts";
import { RUN_SPEED, WALK_SPEED, WALKER_RADIUS } from "../src/core/walk.ts";
import type { ItemSpec, RoomState } from "../src/core/types.ts";

const CRATE = join(import.meta.dir, "../crates/island-core/src");

/** Every `pub const` and `pub enum` variant of the crate, as `scope::NAME` (a module or impl's name, or the file's). */
function rustValues(): Map<string, number | number[]> {
  const out = new Map<string, number | number[]>();
  const pending: [string, string][] = [];
  for (const file of readdirSync(CRATE).filter((f) => f.endsWith(".rs"))) {
    const lines = readFileSync(join(CRATE, file), "utf8").split("\n");
    const stack: { name: string; depth: number }[] = [];
    let depth = 0;
    let inEnum: { name: string; depth: number } | null = null;
    for (const line of lines) {
      const scope = stack.at(-1)?.name ?? file.replace(/\.rs$/, "");
      const open = /^\s*(?:pub )?(?:mod|impl) (\w+) \{/.exec(line);
      const en = /^\s*pub enum (\w+) \{/.exec(line);
      const c = /^\s*pub const (\w+): [^=]+= (.+);/.exec(line);
      if (c) pending.push([`${scope}::${c[1]}`, c[2]!]);
      if (inEnum) {
        const v = /^\s*(\w+) = (\d+),/.exec(line);
        if (v) out.set(`${inEnum.name}::${v[1]}`, Number(v[2]));
      }
      for (const ch of line.replace(/\/\/.*$/, "")) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (stack.at(-1)?.depth === depth) stack.pop();
          if (inEnum?.depth === depth) inEnum = null;
        }
      }
      if (open) stack.push({ name: open[1]!, depth: depth - 1 });
      if (en) inEnum = { name: en[1]!, depth: depth - 1 };
    }
  }
  // Values: numbers, a shift, an array of numbers, or another constant.
  const value = (expr: string): number | number[] | undefined => {
    expr = expr.trim();
    if (/^-?[\d_.]+$/.test(expr)) return Number(expr.replace(/_/g, ""));
    const shift = /^(\d+) << (\d+)$/.exec(expr);
    if (shift) return Number(shift[1]) << Number(shift[2]);
    const arr = /^\[(.*)\]$/.exec(expr);
    if (arr) return arr[1]!.split(",").map((x) => Number(x.trim()));
    const ref = /^crate::(\w+)::(\w+)$/.exec(expr);
    if (ref) return out.get(`${ref[1]}::${ref[2]}`);
    return undefined;
  };
  for (const [k, expr] of pending) {
    const v = value(expr);
    if (v !== undefined) out.set(k, v);
  }
  return out;
}

const RUST = rustValues();
const rust = (key: string): unknown => {
  if (!RUST.has(key)) throw new Error(`the core has no ${key}`);
  return RUST.get(key);
};
/** A host's number named `what`, and the core's `key`: equal, or the failure says which. */
const same = (what: string, ours: unknown, key: string) => expect({ [what]: ours }).toEqual({ [what]: rust(key) });
const UPPER = (camel: string) => camel.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
const PASCAL = (name: string) => name.split(/[-_]/).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");

describe("the scripts' numbers are the core's", () => {
  test("items, what a view shows, outcomes and events", () => {
    for (const [k, v] of Object.entries(ITEM)) same(k, v, `item::${UPPER(k)}`);
    for (const [k, v] of Object.entries(SHOW)) same(k, v, `show::${UPPER(k)}`);
    for (const [k, v] of Object.entries(OUTCOME)) same(k, v, `Outcome::${UPPER(k)}`);
    for (const [k, v] of Object.entries(EVENTS)) same(k, v, `Events::${UPPER(k)}`);
    same("POCKETS", POCKETS, "things::POCKETS");
    same("BOX", BOX, "things::BOX");
    same("VIEW_FIELDS", VIEW_FIELDS, "things::VIEW_FIELDS");
    same("MAX_FISH", MAX_FISH, "things::MAX_FISH");
    same("LINE_POINTS", LINE_POINTS, "things::LINE_POINTS");
  });

  test("codes counted from 0: hints, presses, actions, surfaces", () => {
    HINTS.forEach((h, i) => same(h, i, `hint::${h ? UPPER(h) : "NONE"}`));
    PRESSES.forEach((p, i) => same(p, i, `Press::${PASCAL(p)}`));
    ACTS.forEach((a, i) => same(a, i, `Act::${a ? PASCAL(a) : "None"}`));
    SURFACES.forEach((s, i) => same(s, i, `surface::${s ? UPPER(s) : "NONE"}`));
  });

  test("the furniture by hand: what the pockets carry it as, and why a piece is not put down", () => {
    same("FURNITURE", FURNITURE, "item::FURNITURE");
    same("LOOKS", LOOKS, "item::LOOKS");
    for (const [k, v] of Object.entries(PUT_REFUSAL)) same(k, v, `refusal::${UPPER(k)}`);
    same("PIECE_EASE", PIECE_EASE, "handle::EASE");
  });

  test("the game's state and pose, and the room's change, by their places", () => {
    for (const [k, v] of Object.entries(GS)) same(k, v, `gs::${UPPER(k)}`);
    for (const [k, v] of Object.entries(POSE)) same(k, v, `pose_out::${UPPER(k)}`);
    for (const [k, v] of Object.entries(CHANGE)) same(k, v, `change::${UPPER(k)}`);
    for (const [k, v] of Object.entries(CHANGE_OUT)) same(k, v, `change_out::${UPPER(k)}`);
  });

  test("the room's: kinds, layers, walls, reasons, its height and its limit", () => {
    for (const [k, v] of Object.entries(KIND)) same(k, v, `Kind::${PASCAL(k)}`);
    for (const [k, v] of Object.entries(LAYER)) same(k, v, `Layer::${PASCAL(k)}`);
    for (const [k, v] of Object.entries(WALL)) same(k, v, `Side::${PASCAL(k)}`);
    REASONS.forEach((r, i) => i > 0 && same(r, i, `Reason::${PASCAL(r)}`));
    same("WALL_HEIGHT", WALL_HEIGHT, "room::WALL_HEIGHT");
    same("ITEM_LIMIT", ITEM_LIMIT, "room::ITEM_LIMIT");
  });

  test("the island's grounds, heights and step, and walking's speeds", () => {
    for (const [k, v] of Object.entries(GROUND)) same(k, v, `island::${UPPER(k)}`);
    same("TIER_Y", [...TIER_Y], "island::TIER_Y");
    same("SEA_LEVEL", SEA_LEVEL, "island::SEA_LEVEL");
    same("WATER_DROP", WATER_DROP, "island::WATER_DROP");
    same("STEP_UP", STEP_UP, "island::STEP_UP");
    same("WALK_SPEED", WALK_SPEED, "walk::WALK_SPEED");
    same("RUN_SPEED", RUN_SPEED, "walk::RUN_SPEED");
    same("WALKER_RADIUS", WALKER_RADIUS, "walk::WALKER_RADIUS");
  });

  test("the console's header: what the renderer reads", () => {
    const header = readFileSync(join(import.meta.dir, "../programs/3ds-island/src/core.h"), "utf8");
    const kept = header.slice(header.indexOf("End of the written functions"));
    const c = new Map<string, number>();
    for (const e of kept.matchAll(/enum \{([^}]*)\}/g)) {
      let next = 0;
      for (const part of e[1]!.split(",").map((x) => x.trim()).filter(Boolean)) {
        const [name, v] = part.split("=").map((x) => x.trim());
        next = v !== undefined ? Number(v) : next;
        c.set(name!, next++);
      }
    }
    for (const d of kept.matchAll(/#define (\w+) ([-\d.]+)f?\b/g)) c.set(d[1]!, Number(d[2]));
    const scope: Record<string, string> = { GS: "gs", POSE: "pose_out", ITEM: "item", SHOW: "show", HANDLE: "handle", ROOM: "room" };
    const things = new Set(["VIEW_FIELDS", "LINE_POINTS", "MAX_FISH", "MAX_THINGS", "OUTLINE_POINTS"]);
    const named: Record<string, string> = { ROUTE_DOTS: "route::MAX_DOTS" };
    let checked = 0;
    for (const [name, v] of c) {
      const [prefix, ...rest] = name.split("_");
      if (things.has(name)) same(name, v, `things::${name}`);
      else if (named[name]) same(name, v, named[name]!);
      else if (scope[prefix!]) same(name, v, `${scope[prefix!]}::${rest.join("_")}`);
      else continue;
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });
});

describe("the geometry the interfaces draw with is the core's", () => {
  const spec: ItemSpec = { id: "box", kind: "floor", size: [1, 1] } as ItemSpec;
  const catalog = (id: string) => (id === "box" ? spec : undefined);
  test("the door's tile: a piece on it is refused for the door, one beside it is not", () => {
    for (const [w, d] of [[4, 4], [6, 6], [8, 8], [10, 6]] as const) {
      const room: RoomState = { w, d, items: [], storage: [] } as unknown as RoomState;
      const [x0, z0, x1, z1] = doorRect(room);
      const at = (x: number, z: number) => check(room, catalog, { uid: "a", item: "box", variant: 0, layer: "floor", x, z, rot: 0 });
      expect(at((x0 + x1) / 2, (z0 + z1) / 2)).toMatchObject({ ok: false, problem: { reason: "door" } });
      expect(at(x0 - 0.5, (z0 + z1) / 2).ok).toBe(true);
      expect(at(x1 + 0.5, (z0 + z1) / 2).ok).toBe(true);
      expect(at((x0 + x1) / 2, z0 - 0.5).ok).toBe(true);
    }
  });

  test("an incline's rise and the water's level are the heights the player walks on", () => {
    const m = makeIsland();
    let ramps = 0, wet = 0;
    for (const r of m.ramps) {
      const [x0, z0, x1, z1] = r.rect;
      for (let k = 1; k < 8; k++) {
        const x = x0 + ((x1 - x0) * k) / 8, z = z0 + ((z1 - z0) * (8 - k)) / 8;
        if (bridgeAt(m, x, z) || rampAt(m, x, z) !== r) continue;
        expect(heightAt(m, x, z)).toBeCloseTo(r.low + (r.high - r.low) * rampRise(r, x, z), 9);
        ramps++;
      }
    }
    for (let j = 0; j < m.d; j += 3) for (let i = 0; i < m.w; i += 3) {
      const g = m.ground[j * m.w + i];
      const x = i + 0.5, z = j + 0.5;
      if ((g !== GROUND.sea && g !== GROUND.water) || bridgeAt(m, x, z) || rampAt(m, x, z)) continue;
      expect(heightAt(m, x, z)).toBeCloseTo(waterLevel(m, i, j), 9);
      wet++;
    }
    expect(ramps).toBeGreaterThan(10);
    expect(wet).toBeGreaterThan(100);
  });
});

describe("the console's bindings are the core's interface", () => {
  test("core.h and core_js.c are as tools/bindings.ts writes them from ffi.rs", () => {
    const b = renderBindings();
    expect(readFileSync(b.headerPath, "utf8")).toBe(b.header);
    expect(readFileSync(b.jsPath, "utf8")).toBe(b.js);
  });

  test("src/core/abi.ts names every function a script can call, and no other", () => {
    const ffi = [...readFileSync(join(CRATE, "ffi.rs"), "utf8").matchAll(/pub extern "C" fn (pi_\w+)/g)].map((m) => m[1]!);
    const buffers = new Set(["pi_out", "pi_path", "pi_things_data", "pi_things_view_data", "pi_route_data", "pi_island_tiles"]);
    const callable = ffi.filter((f) => !buffers.has(f) && !f.endsWith("_len")).sort();
    const abi = [...readFileSync(join(import.meta.dir, "../src/core/abi.ts"), "utf8").matchAll(/^\s+(pi_\w+)\(/gm)].map((m) => m[1]!).sort();
    expect(abi).toEqual(callable);
  });
});
