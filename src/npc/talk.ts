// A conversation with one of the island's people, as on the island games, shared by the browser
// (src/ui/talk.ts) and the console (apps/island-3ds/talk.tsx), which only show it:
//
//   - what they say comes a line at a time in their speech box, with their name on it; A (Space, or
//     a click) shows the rest of a line at once, and then the next;
//   - a line can end in a question with answers to choose from, the first chosen to begin with;
//   - nothing changes hands without a line asking first (what it is and what it comes to), and
//     leaving is said goodbye to (`farewell`).
//
// Every person follows these: a shop asks before it takes coins or pays them, and says goodbye.
// As a line comes, its speaker's syllables are heard (src/audio/cues.ts syllableCue); a key is a
// tick, an answer a pop.

import { syllableCue } from "../audio/cues.ts";
import { sound } from "../audio/hear.ts";

export interface Answer {
  label: string;
  /** What choosing it does: often more lines (`talk.say`). */
  then?: () => void;
}

export interface Line {
  /** Who is speaking (their name, translated), and their colour for the name tag. */
  speaker: string;
  color: string;
  /** Their voice's pitch for the syllables they speak in (1 as made; lower is deeper). */
  voice?: number;
  text: string;
  /** A question's answers; without them, A goes on to the next line. */
  answers?: Answer[];
}

export interface TalkState {
  line: Line | null;
  /** The answer lit, when the line has answers. */
  answer: number;
  /** Characters of the line shown so far (a line comes a few letters at a time). */
  shown: number;
}

/** Letters a second a line comes at. */
export const LETTERS_PER_SECOND = 42;

export class Talk {
  private queue: Line[] = [];
  private state: TalkState = { line: null, answer: 0, shown: 0 };
  private listeners = new Set<(s: TalkState) => void>();
  private after: (() => void) | null = null;

  get now(): TalkState {
    return this.state;
  }

  get open(): boolean {
    return !!this.state.line;
  }

  /** Called whenever what is shown changes. Returns a function that stops it. */
  watch(f: (s: TalkState) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Lines said in order; `then` runs when the last is done (and is not a question). */
  say(lines: Line[], then?: () => void): void {
    this.queue.push(...lines);
    if (then) this.after = then;
    if (!this.state.line) this.next();
  }

  /** The time passing: a line comes a few letters at a time. Returns whether anything changed. */
  tick(dt: number): boolean {
    const l = this.state.line;
    if (!l || this.state.shown >= l.text.length) return false;
    const before = Math.floor(this.state.shown);
    this.set({ ...this.state, shown: Math.min(l.text.length, this.state.shown + dt * LETTERS_PER_SECOND) });
    for (let k = before; k < Math.floor(this.state.shown); k++) {
      if (/\s/.test(l.text[k] ?? " ")) continue;
      const cue = syllableCue(k, l.voice ?? 1, Math.random);
      if (cue) sound(cue.sound, cue.gain, cue.rate);
    }
    return true;
  }

  /** Whether the line is all shown. */
  get complete(): boolean {
    const l = this.state.line;
    return !!l && this.state.shown >= l.text.length;
  }

  /** A: the rest of the line, or the next line, or the lit answer. */
  press(): void {
    const l = this.state.line;
    if (!l) return;
    if (!this.complete) return this.set({ ...this.state, shown: l.text.length });
    if (l.answers?.length) return this.choose(this.state.answer);
    this.next();
  }

  /** B: on a question, its last answer (the "no"); else as A. */
  back(): void {
    const l = this.state.line;
    if (l?.answers?.length && this.complete) return this.choose(l.answers.length - 1);
    this.press();
  }

  /** Up and down among a question's answers. */
  move(dir: number): void {
    const n = this.state.line?.answers?.length ?? 0;
    if (!n || !this.complete) return;
    sound("move", 0.5);
    this.set({ ...this.state, answer: (this.state.answer + dir + n) % n });
  }

  choose(k: number): void {
    const a = this.state.line?.answers?.[k];
    if (!a || !this.complete) return;
    sound("ok", 0.6);
    this.state = { line: null, answer: 0, shown: 0 };
    a.then?.();
    if (!this.state.line) this.next();
  }

  /** Ended at once, saying nothing more. */
  close(): void {
    this.queue = [];
    this.after = null;
    this.set({ line: null, answer: 0, shown: 0 });
  }

  private next(): void {
    const line = this.queue.shift() ?? null;
    this.set({ line, answer: 0, shown: 0 });
    if (!line && this.after) {
      const after = this.after;
      this.after = null;
      after();
    }
  }

  private set(s: TalkState): void {
    this.state = s;
    for (const f of this.listeners) f(s);
  }
}

/** The island's one conversation at a time. */
export const talk = new Talk();
