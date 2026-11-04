import { describe, expect, test } from "bun:test";
import { EVENTS, game } from "../src/core/game.ts";
import { makeIsland } from "../src/core/island.ts";
import { Mods, type Mod } from "../src/mods/api.ts";
import { welcome } from "../src/mods/welcome.ts";
import { catalog } from "../src/furniture/catalog.ts";
import { defaultRoom } from "../src/presets.ts";

describe("mods", () => {
  const map = makeIsland();
  game.room(defaultRoom(), catalog);
  game.restore(map, map.spawn);

  test("a mod hears the player come home, says so in the interface's words, and keeps a count", () => {
    const said: string[] = [];
    const kept = new Map<string, string>();
    const mods = new Mods([welcome], { say: (key) => said.push(key), save: (k, v) => (v === null ? kept.delete(k) : kept.set(k, v)), load: (k) => kept.get(k) ?? null });
    for (const go of [() => game.enter(true), () => game.exit(true), () => game.enter(true)]) {
      if (go() & EVENTS.place) mods.emit("place", game.state().place);
    }
    expect(said).toEqual(["mod.welcome.home"]);
    expect(kept.get("mod:welcome:visits")).toBe("2");
  });

  test("a mod can walk the player, and one that throws does not stop the others", () => {
    const heard: string[] = [];
    game.restore(map, map.spawn);
    const bad: Mod = { id: "bad", start: () => { throw new Error("no"); } };
    const walker: Mod = {
      id: "walker",
      start: (ctx) => {
        ctx.on("arrived", () => heard.push("arrived"));
        expect(ctx.walkTo(map.spawn.x + 3, map.spawn.z + 1)).toBe(true);
      },
    };
    const mods = new Mods([bad, walker], { say: () => {}, save: () => {}, load: () => null });
    for (let k = 0; k < 300; k++) if (game.step(0, 0, false, false, 1 / 60) & EVENTS.arrived) mods.emit("arrived", undefined);
    expect(heard).toEqual(["arrived"]);
    expect(Math.hypot(game.state().x - map.spawn.x - 3, game.state().z - map.spawn.z - 1)).toBeLessThan(0.2);
  });
});
