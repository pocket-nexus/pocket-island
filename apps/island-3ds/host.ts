// The renderer, as the interface reaches it: `globalThis.island`, which the
// product extension (programs/3ds-island) publishes. Off the console (the
// wasm preview and the flow test) a stand-in records what would have been
// drawn and keeps what would have been saved.

export interface PackInfo {
  ok: boolean;
  error: string;
  catalogue: number;
  items: number;
  finishes: number;
  new3ds: boolean;
  /** Whether the mixer runs, why not, and which way it plays: "dsp", or "csnd" without the DSP's firmware (programs/3ds-island/src/audio.c); absent from a program built before it. */
  sound?: boolean;
  soundProblem?: string;
  soundWay?: "dsp" | "csnd" | "";
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  gpuMs: number;
  draws: number;
  triangles: number;
  lamps: number;
  residentKB: number;
  linearFreeKB: number;
  font: string;
}

export interface Island {
  info(): PackInfo;
  room(w: number, d: number, wallpaper: number, flooring: number, items: Float32Array): void;
  marks(marks: Float32Array): void;
  /** The ceiling light, and the clock's phase between two of the day's looks (0 day, 1 dusk, 2 night). */
  light(mode: number, a: number, b: number, t: number): void;
  /** How the rooms light the house's windows from outside (src/island/windows.ts houseLight): their glow, and whether cool. */
  house(glow: number, cool: number): void;
  camera(yaw: number, pitch: number, zoom: number, reset: number): void;
  plan(mode: number, x0: number, y0: number, scale: number, layers: number, paper: number): void;
  options(halos: number, shadows: number): void;
  fonts(lang: string): boolean;
  save(name: string, text: string): boolean;
  load(name: string): string | null;
  stats(): RenderStats;
  /** The mixer (audio.c): a sound, the music, the settings' loudness. Absent from a program built before it. */
  sound?(id: number, gain: number, speed: number): void;
  music?(piece: number, gain: number): void;
  volumes?(music: number, sounds: number): void;
  /** The music's fades' time constants (seconds): a piece in and the last away, the first up, a change of level (src/audio/names.ts MIX). */
  mix?(crossfade: number, first: number, level: number): void;
}

/** The plan's modes (programs/3ds-island/src/scene.h). */
export const PLAN = { off: 0, floor: 1, back: 2, left: 3, right: 4 } as const;
/** What an item stands on, for its shadow and the plan's layers. */
export const ON = { floor: 0, rug: 1, surface: 2, wall: 3, ceiling: 4 } as const;
/** An item's marks. */
export const FLAG = { selected: 1, held: 2, refused: 4 } as const;
export const ITEM_FIELDS = 10;
export const MARK_FIELDS = 10;

/** What the stand-in recorded, for the tests. */
export interface StandIn extends Island {
  calls: { name: string; args: unknown[] }[];
  saved: Map<string, string>;
}

function standIn(): StandIn {
  const calls: { name: string; args: unknown[] }[] = [];
  const saved = new Map<string, string>();
  const note = (name: string) => (...args: unknown[]) => void calls.push({ name, args: args.map((a) => (a instanceof Float32Array ? Array.from(a) : a)) });
  return {
    calls,
    saved,
    info: () => ({ ok: true, error: "", catalogue: 0, items: 0, finishes: 0, new3ds: true }),
    room: note("room"),
    marks: note("marks"),
    light: note("light"),
    house: note("house"),
    camera: note("camera"),
    plan: note("plan"),
    options: note("options"),
    fonts: (lang) => (calls.push({ name: "fonts", args: [lang] }), true),
    save: (name, text) => (saved.set(name, text), true),
    load: (name) => saved.get(name) ?? null,
    stats: () => ({ fps: 60, frameMs: 16.7, gpuMs: 9, draws: 120, triangles: 24000, lamps: 2, residentKB: 3000, linearFreeKB: 20000, font: "en" }),
  };
}

const global = globalThis as unknown as { island?: Island; __islandStandIn?: StandIn };
export const island: Island = global.island ?? (global.__islandStandIn = standIn());
export const onConsole = !!global.island && !global.__islandStandIn;
