// The island's sound: made from nothing the same on every run, its loops without a seam, and a
// frame's events heard as the cues say (src/audio).
import "./core.ts";
import { describe, expect, test } from "bun:test";
import { Cues, flooringGround } from "../src/audio/cues.ts";
import { PIECES, pieceAt, SOUND_NAMES } from "../src/audio/names.ts";
import { renderPiece } from "../src/audio/music.ts";
import { renderSound } from "../src/audio/sfx.ts";
import { EVENTS, game, type GameState } from "../src/core/game.ts";
import { makeIsland } from "../src/core/island.ts";
import { OUTCOME, things } from "../src/core/things.ts";

const finite = (s: Float32Array) => s.every((v) => Number.isFinite(v) && Math.abs(v) <= 1);

describe("the island's sound", () => {
  test("every sound is made, short and within bounds, the same each time", () => {
    for (const name of SOUND_NAMES) {
      const s = renderSound(name);
      expect(finite(s)).toBe(true);
      expect(s.length).toBeGreaterThan(100);
      expect(s.length).toBeLessThan(22_050 * 2);
    }
    expect(Array.from(renderSound("chop"))).toEqual(Array.from(renderSound("chop")));
  });

  test("each piece loops without a seam, by the hour", () => {
    for (const p of PIECES) {
      const s = renderPiece(p);
      expect(finite(s)).toBe(true);
      // Coming round from the last sample to the first is no bigger a step than the music's own.
      const steps: number[] = [];
      for (let i = 1; i < s.length; i++) steps.push(Math.abs(s[i]! - s[i - 1]!));
      steps.sort((a, b) => a - b);
      expect(Math.abs(s[s.length - 1]! - s[0]!)).toBeLessThan(steps[Math.floor(steps.length * 0.99)]!);
    }
    expect([pieceAt(6), pieceAt(12), pieceAt(18), pieceAt(23), pieceAt(3)]).toEqual(["morning", "day", "evening", "night", "night"]);
  });

  test("a walk is heard as steps on its ground, a run louder", () => {
    const m = makeIsland();
    game.restore(m, m.spawn);
    things.reset();
    const cues = new Cues(() => 0.5);
    const heard: string[] = [];
    for (let k = 0; k < 120; k++) {
      const e = game.step(0, 1, k > 60, false, 1 / 60);
      if (e & EVENTS.step) for (const c of cues.frame(e, game.state(), game.surface(), null)) heard.push(`${c.sound}@${c.gain}`);
    }
    expect(heard.length).toBeGreaterThan(4);
    expect(heard.every((h) => /^step\.(grass|path|sand|stone)\.\d@/.test(h))).toBe(true);
    expect(heard.some((h) => h.endsWith("@0.85"))).toBe(true);
    expect([flooringGround("oak-planks"), flooringGround("pink-tile"), flooringGround("tatami")]).toEqual(["wood", "stone", "rug"]);
  });

  test("a fish on the line: the reel as the first pull begins, and each hard pull heard", () => {
    const cues = new Cues(() => 0.5);
    const at = (act: GameState["act"], events = 0) => cues.frame(events, { ...game.state(), act }, "", null).map((c) => c.sound);
    expect(at("")).toEqual([]);
    expect(at("tug")).toEqual(["reel"]);
    expect(at("tug", OUTCOME.hit)).toEqual(["tug"]);
    // The next pull follows at once: the same action, heard at its moment.
    expect(at("tug")).toEqual([]);
    expect(at("tug", OUTCOME.hit)).toEqual(["tug"]);
    expect(at("show", OUTCOME.caught | OUTCOME.got)).toEqual(["catch"]);
  });
});
