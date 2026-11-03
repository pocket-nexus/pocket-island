// The room's state with its history. Every change is a whole new state, so
// undo is a stack of states and a listener can diff two of them.

import type { RoomState } from "./types.ts";

export type Listener = (next: RoomState, previous: RoomState) => void;

const HISTORY = 120;

export class RoomModel {
  private past: RoomState[] = [];
  private future: RoomState[] = [];
  private listeners = new Set<Listener>();

  constructor(private current: RoomState) {}

  get state(): RoomState {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** A change the visitor can undo. */
  commit(next: RoomState): void {
    if (next === this.current) return;
    this.past.push(this.current);
    if (this.past.length > HISTORY) this.past.shift();
    this.future = [];
    this.set(next);
  }

  /** A change outside the history, such as a lamp switched on. */
  replace(next: RoomState): void {
    if (next === this.current) return;
    this.set(next);
  }

  /** Start over from `next` with an empty history. */
  reset(next: RoomState): void {
    this.past = [];
    this.future = [];
    this.set(next);
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.current);
    this.set(previous);
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.current);
    this.set(next);
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(next: RoomState): void {
    const previous = this.current;
    this.current = next;
    for (const listener of this.listeners) listener(next, previous);
  }
}

/** Accept a saved room only when it has the shape this version writes. */
export function parseRoom(input: unknown): RoomState | null {
  const s = input as Partial<RoomState> | null;
  if (!s || typeof s !== "object") return null;
  if (typeof s.w !== "number" || typeof s.d !== "number" || !Array.isArray(s.items) || !Array.isArray(s.storage)) return null;
  if (typeof s.wallpaper !== "string" || typeof s.flooring !== "string") return null;
  return s as RoomState;
}
