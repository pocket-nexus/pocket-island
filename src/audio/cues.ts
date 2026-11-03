// What is heard when, the same in the browser (./player.ts) and on the console
// (apps/island-3ds/sound.ts): a frame's events from the island's core (src/core/game.ts EVENTS,
// src/core/things.ts OUTCOME) and the player's state become sounds by name (./sfx.ts), each with
// its loudness and speed. A step is heard on what is underfoot (game.surface), a run louder and
// brisker; an action at its start (a swing, a cast) and at its moment (the chop, the dig, the plop,
// the pick); the fish, things got, a thing landing, a tool breaking, a new kind, the door.

import { EVENTS, type GameState, type Surface } from "../core/game.ts";
import { OUTCOME } from "../core/things.ts";
import type { StepGround } from "./sfx.ts";

export interface Cue {
  sound: string;
  /** 0 to 1. */
  gain: number;
  /** Playback speed: 1 as made; a little more or less, so a repeat is not the same. */
  rate: number;
}

/** What a room's flooring sounds like underfoot, by its name. */
export function flooringGround(flooring: string | null | undefined): StepGround {
  const f = flooring ?? "";
  if (/tile|terracotta|stone|marble|checker/.test(f)) return "stone";
  if (/carpet|tatami|rug|felt|grass/.test(f)) return "rug";
  return "wood";
}

/** The run's pace, from the walk's (src/core/walk.ts). */
const BRISK = (3.1 + 6.2) / 2;

/** What the frame sounds like. `before` is the last frame's action (to hear one start); `rand` varies a repeat. */
export class Cues {
  private lastAct = "";
  private lastStep = -1;

  constructor(private rand: () => number = Math.random) {}

  frame(events: number, s: GameState, surface: Surface, flooring: string | null): Cue[] {
    const out: Cue[] = [];
    const vary = (spread = 0.06) => 1 + (this.rand() - 0.5) * 2 * spread;
    if (events & EVENTS.step && surface) {
      const ground: StepGround = surface === "floor" ? flooringGround(flooring) : surface;
      // Four of each, never the same twice running.
      let k = Math.floor(this.rand() * 4);
      if (k === this.lastStep) k = (k + 1) % 4;
      this.lastStep = k;
      const run = s.speed > BRISK;
      out.push({ sound: `step.${ground}.${k}`, gain: run ? 0.85 : 0.55, rate: (run ? 1.08 : 1) * vary(0.05) });
    }
    // An action as it begins.
    if (s.act !== this.lastAct && s.act) {
      const start: Record<string, string> = { chop: "swing", dig: "swing", swing: "swing", cast: "cast", shake: "shake", reel: "reel" };
      if (start[s.act]) out.push({ sound: start[s.act]!, gain: 0.6, rate: vary() });
    }
    this.lastAct = s.act;
    // Its moment.
    if (events & OUTCOME.hit) {
      const hit: Record<string, string> = { chop: "chop", dig: "dig", cast: "plop", pick: "pick", pull: "pull" };
      if (hit[s.act]) out.push({ sound: hit[s.act]!, gain: 0.8, rate: vary() });
    }
    if (events & OUTCOME.nibble) out.push({ sound: "nibble", gain: 0.6, rate: vary(0.1) });
    if (events & OUTCOME.bite) out.push({ sound: "bite", gain: 0.9, rate: vary() });
    if (events & OUTCOME.caught) out.push({ sound: "catch", gain: 0.9, rate: 1 });
    else if (events & OUTCOME.got && s.act === "dig") out.push({ sound: "got", gain: 0.8, rate: 1 });
    if (events & OUTCOME.escaped) out.push({ sound: "escape", gain: 0.7, rate: vary() });
    if (events & OUTCOME.land) out.push({ sound: "land", gain: 0.5, rate: vary(0.1) });
    if (events & OUTCOME.broke) out.push({ sound: "broke", gain: 0.8, rate: 1 });
    if (events & OUTCOME.new) out.push({ sound: "new", gain: 0.7, rate: 1 });
    if (events & EVENTS.fading) out.push({ sound: "door", gain: 0.7, rate: 1 });
    return out;
  }
}

/** A syllable for the `k`th letter of a line someone says, at their voice's pitch (`voice` 0.8 low to 1.3 high). */
export function syllableCue(k: number, voice: number, rand: () => number): Cue | null {
  // A syllable every other letter, not on spaces.
  if (k % 2) return null;
  return { sound: `voice.${Math.floor(rand() * 6)}`, gain: 0.5, rate: voice * (0.94 + rand() * 0.12) };
}
