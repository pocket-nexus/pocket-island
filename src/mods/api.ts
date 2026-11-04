// Mods: scripts that run on top of the island's core, on the browser's page and in the console's
// QuickJS alike. A mod reads the game as the core runs it, asks it to walk somewhere or go
// through the door, says things in the interface's languages, and hears what happens:
//
//   place     the player went in or came out (the place they are in now)
//   door      the player came to the door, or left it
//   arrived   a walk to a point ended
//   frame     a frame went by (seconds since the last)
//
// A mod is listed in src/mods/index.ts. Its words are messages in src/i18n (en.ts, zh.ts, ja.ts),
// like every word the interface shows.

import { game, type GameState, type Place } from "../core/game.ts";
import type { MessageKey } from "../i18n/index.ts";

export interface ModEvents {
  place: Place;
  door: boolean;
  arrived: void;
  frame: number;
}

export interface ModContext {
  /** The game now. */
  state(): GameState;
  /** Walk to a point in the place's tiles (round what is in the way); `enter` goes in at the end. */
  walkTo(x: number, z: number, enter?: boolean): boolean;
  enter(): void;
  exit(): void;
  /** Say a message (a key in src/i18n) the way the interface says things. */
  say(key: MessageKey, params?: Record<string, string | number>): void;
  /** Hear an event. */
  on<K extends keyof ModEvents>(event: K, listener: (value: ModEvents[K]) => void): void;
  /** What a mod keeps between runs (the browser's storage, the console's SD card), by key. */
  keep(key: string, value: string | null): void;
  kept(key: string): string | null;
}

export interface Mod {
  id: string;
  start(ctx: ModContext): void;
}

/** What a host gives the mods: how to say a message, and where to keep things. */
export interface ModHost {
  say(key: MessageKey, params?: Record<string, string | number>): void;
  save(key: string, value: string | null): void;
  load(key: string): string | null;
}

type Listeners = { [K in keyof ModEvents]: Array<(value: ModEvents[K]) => void> };

/** The mods running in a host: started once, then told what happens. */
export class Mods {
  private listeners: Listeners = { place: [], door: [], arrived: [], frame: [] };

  constructor(mods: readonly Mod[], host: ModHost) {
    for (const mod of mods) {
      const ctx: ModContext = {
        state: () => game.state(),
        walkTo: (x, z, enter = false) => game.walkTo(x, z, enter),
        enter: () => void game.enter(),
        exit: () => void game.exit(),
        say: (key, params) => host.say(key, params),
        on: (event, listener) => (this.listeners[event] as Array<typeof listener>).push(listener),
        keep: (key, value) => host.save(`mod:${mod.id}:${key}`, value),
        kept: (key) => host.load(`mod:${mod.id}:${key}`),
      };
      try {
        mod.start(ctx);
      } catch (error) {
        console.error(`mod ${mod.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  emit<K extends keyof ModEvents>(event: K, value: ModEvents[K]): void {
    for (const listener of this.listeners[event]) {
      try {
        listener(value);
      } catch (error) {
        console.error(`mod: ${event}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
