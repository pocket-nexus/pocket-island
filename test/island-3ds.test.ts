// The 3DS interface's editor (apps/island-3ds/editor.ts) on the host, with the
// renderer's stand-in recording what it is handed. It needs the catalogue the
// compiler generates (`bun tools/export.ts && bun tools/cook.ts`); without it
// the suite is skipped.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const generated = existsSync(join(import.meta.dir, "../apps/island-3ds/generated/catalog.ts"));

describe.skipIf(!generated)("the 3DS editor", async () => {
  const E = await import("../apps/island-3ds/editor.ts");
  const { DATA, item } = await import("../apps/island-3ds/catalog.ts");
  const host = (globalThis as unknown as { __islandStandIn: { calls: { name: string; args: unknown[] }[]; saved: Map<string, string> } }).__islandStandIn;
  const last = (name: string) => [...host.calls].reverse().find((c) => c.name === name)!;
  E.restore();

  test("the renderer is handed every item, ten numbers each, where the browser would put it", () => {
    const room = E.room();
    const call = last("room");
    expect(call.args[0]).toBe(room.w);
    const data = call.args[4] as number[];
    expect(data.length).toBe(room.items.length * 10);
    const bed = room.items.findIndex((p) => p.item === "wooden-bed");
    const p = room.items[bed]!;
    // x and z: the centre less half the room; a wall item's y is its height.
    expect(data[bed * 10 + 3]).toBeCloseTo(p.x - room.w / 2);
    expect(data[bed * 10 + 5]).toBeCloseTo(p.z - room.d / 2);
  });

  test("the plan maps room tiles to touch-screen pixels and back", () => {
    E.setLayer("all");
    const [x, y, w, h] = E.toPlan([1, 2, 3, 4]);
    expect(w).toBeGreaterThan(0);
    expect(E.fromPlan(x, y)[0]).toBeCloseTo(1);
    expect(E.fromPlan(x + w, y + h)[1]).toBeCloseTo(4);
    E.setWall("left");
    const r = E.toPlan([1, 1, 2, 2]);
    // Seen from inside, the left wall's back end is on the right.
    const [u] = E.fromPlan(r[0] + r[2], r[1]);
    expect(u).toBeCloseTo(1);
    E.setLayer("all");
  });

  test("a piece from the catalogue lands where it fits, selected, and undo takes it back", () => {
    const before = E.room().items.length;
    const def = item("wooden-stool")!;
    expect(E.place(def, 1)).toBe(true);
    expect(E.room().items.length).toBe(before + 1);
    const placed = E.room().items.at(-1)!;
    expect(placed.variant).toBe(1);
    expect([...E.selection()]).toEqual([placed.uid]);
    E.undo();
    expect(E.room().items.length).toBe(before);
  });

  test("dragging carries the selection by the plan's pixels and the rules judge the drop", () => {
    const stool = E.room().items.find((p) => p.item === "wooden-stool")!;
    const r = E.rectOf(E.room(), stool)!;
    const [x, y, w, h] = E.toPlan(r);
    E.beginCarry(stool.uid, x + w / 2, y + h / 2);
    const v = E.planView();
    E.moveCarry(x + w / 2 + v.s, y + h / 2);
    // A held piece is flagged for the renderer.
    const data = last("room").args[4] as number[];
    const at = E.room().items.findIndex((p) => p.uid === stool.uid);
    expect(data[at * 10 + 8]! & 2).toBe(2);
    E.dropCarry();
    const moved = E.room().items.find((p) => p.uid === stool.uid)!;
    expect(moved.x === stool.x + 1 || moved.x === stool.x).toBe(true);
  });

  test("onto the door's tile is refused and said", () => {
    const stool = E.room().items.find((p) => p.item === "wooden-stool")!;
    const [dx, dy, dw, dh] = E.toPlan(E.door());
    const [x, y, w, h] = E.toPlan(E.rectOf(E.room(), stool)!);
    E.beginCarry(stool.uid, x + w / 2, y + h / 2);
    E.moveCarry(dx + dw / 2, dy + dh / 2);
    E.dropCarry();
    expect(E.room().items.find((p) => p.uid === stool.uid)!.x).toBe(stool.x);
    expect(E.notice()?.key).toBe("door");
  });

  test("a turn, a copy and storage", () => {
    const lamp = E.room().items.find((p) => p.item === "floor-lamp")!;
    E.select([lamp.uid]);
    E.rotate();
    expect(E.room().items.find((p) => p.uid === lamp.uid)!.rot).toBe(1);
    const count = E.room().items.length;
    E.copy(lamp.uid);
    expect(E.room().items.length).toBe(count + 1);
    E.putAway();
    expect(E.room().items.length).toBe(count);
    expect(E.room().storage[0]?.item).toBe("floor-lamp");
  });

  test("a showroom is looked at and left; the visitor's room is what is kept", () => {
    const mine = E.room().items.length;
    E.loadRoom(DATA.showrooms.cute, false, "cute");
    expect(E.showroom()).toBe("cute");
    E.backToMyRoom();
    expect(E.room().items.length).toBe(mine);
  });

  test("the room, the light and the language are kept on the card", () => {
    E.setLight(2);
    E.setLanguage("ja");
    for (let i = 0; i < 40; i++) E.tickFrame();
    const kept = JSON.parse(host.saved.get("room")!);
    expect(kept.light).toBe(2);
    expect(kept.lang).toBe("ja");
    expect(kept.room.items.length).toBe(E.room().items.length);
    expect(last("fonts").args[0]).toBe("ja");
    E.setLanguage("en");
  });
});

const island = existsSync(join(import.meta.dir, "../apps/island-3ds/generated/island.ts"));

describe.skipIf(!generated || !island)("the 3DS player", async () => {
  const E = await import("../apps/island-3ds/editor.ts");
  const O = await import("../apps/island-3ds/outdoors.ts");
  const { makeIsland } = await import("../src/core/island.ts");
  const { game } = await import("../src/core/game.ts");
  const frames = (n: number, lx = 0, ly = 0, run = false) => { for (let i = 0; i < n; i++) O.frame(run, lx, ly); };
  E.restore();
  O.restoreWorld();

  test("the island the interface walks on is the browser's, tile for tile", () => {
    const m = makeIsland();
    expect(Buffer.from(O.map.tier).equals(Buffer.from(m.tier))).toBe(true);
    expect(Buffer.from(O.map.ground).equals(Buffer.from(m.ground))).toBe(true);
    expect(O.map.ramps).toEqual(m.ramps);
  });

  test("a first run starts outdoors at the door, in the core's game", () => {
    expect(O.place()).toBe("island");
    frames(2);
    const s = game.state();
    expect(s.place).toBe("island");
    expect(s.x).toBeCloseTo(O.map.spawn.x, 1);
    expect(s.z).toBeCloseTo(O.map.spawn.z, 1);
  });

  test("the Circle Pad walks; held B runs; a walk swings the legs", () => {
    const x0 = game.state().x;
    frames(30, 1, 0);
    const walked = game.state().x - x0;
    expect(walked).toBeGreaterThan(0.8);
    const pose = game.pose();
    expect(Math.abs(pose.legL) + Math.abs(pose.legR)).toBeGreaterThan(0.1);
    frames(30, -1, 0, true);
    expect(x0 - game.state().x).toBeGreaterThan(walked * 1.3 - 0.8);
  });

  test("the card is written only when something changed: nothing standing still, a small place after a walk", () => {
    // A write to the SD card takes the console some 55 ms (three frames): one every five seconds was a
    // stutter while walking, and the things' thousand numbers with it.
    const stand = (globalThis as unknown as { __islandStandIn: { save: (name: string, text: string) => boolean } }).__islandStandIn;
    const writes: { name: string; length: number }[] = [];
    const save = stand.save;
    stand.save = (name, text) => (writes.push({ name, length: text.length }), save(name, text));
    // As the console's frame does (apps/island-3ds/main.tsx): a step, then whatever is due to be kept.
    const kept = (n: number, lx = 0) => { for (let i = 0; i < n; i++) (O.frame(false, lx, 0), O.keepNow()); };
    try {
      kept(30, 1);
      kept(400);
      const settled = writes.length;
      kept(400);
      expect(writes.length).toBe(settled);
      kept(40, -1);
      kept(330);
      const after = writes.slice(settled);
      expect(after.map((w) => w.name)).toEqual(["world"]);
      expect(after[0]!.length).toBeLessThan(300);
    } finally {
      stand.save = save;
    }
  });

  test("what is carried is kept on its own and read back; a save from before, with it in the place's, still is", async () => {
    const { things } = await import("../src/core/things.ts");
    const stand = (globalThis as unknown as { __islandStandIn: { saved: Map<string, string> } }).__islandStandIn;
    things.hold(0);
    stand.saved.set("things", JSON.stringify(things.save()));
    things.hold(0);
    O.restoreWorld();
    expect(things.slots().held).toBe(1);
    const world = JSON.parse(stand.saved.get("world")!);
    things.hold(1);
    stand.saved.set("world", JSON.stringify({ ...world, things: things.save() }));
    stand.saved.delete("things");
    things.hold(1);
    O.restoreWorld();
    expect(things.slots().held).toBe(2);
    things.hold(1);
  });

  test("home on the map walks to the door and goes in, past a fade; down through the doorway comes out", () => {
    O.goHome();
    frames(600);
    expect(O.place()).toBe("house");
    expect(game.state().place).toBe("house");
    frames(240, 0, 1);
    frames(40);
    expect(O.place()).toBe("island");
  });
});
