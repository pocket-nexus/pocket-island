// The island's things and the player's pockets, as the island's core keeps them
// (crates/island-core/src/things.rs): what lies about, the trees' fruit and wood, the fish, what the
// player carries and what is in the house's box. A host hands the core the date, and A; it reads
// back what to draw (`view`), what A would do (`hint`) and what is in the pockets (`slots`).

import { core } from "./abi.ts";
import type { IslandMap, PropKind } from "./island.ts";

/** Items by the core's numbers (src/items/items.ts names them). */
export const ITEM = { shovel: 1, axe: 2, rod: 3, branch: 10, wood: 11, weed: 12, shell: 20, fruit: 30, fossil: 40, fish: 50 } as const;
/** What else a view entry shows. */
export const SHOW = { buried: 100, fish: 101, float: 102, bundle: 103, shake: 104 } as const;
/** What a press of A would do, by the core's numbers. */
export const HINTS = ["", "pick", "pull", "shake", "chop", "dig", "cast", "reel"] as const;
export type Hint = (typeof HINTS)[number];
/** The things' outcomes among a step's or a press's events. */
export const OUTCOME = { got: 16, full: 32, bite: 64, caught: 128, escaped: 256, fell: 512 } as const;
/** The actions, by the core's numbers (GameState.act). */
export const ACTS = ["", "pick", "pull", "shake", "chop", "dig", "cast", "reel", "show", "swing"] as const;
export type ActName = (typeof ACTS)[number];

export const POCKETS = 20;
export const BOX = 60;
/** Numbers a view entry takes: what, x, y, z, yaw, and a value. */
export const VIEW_FIELDS = 6;

export interface Slot {
  item: number;
  count: number;
}

export interface Slots {
  /** The tool in hand (an item), or 0. */
  held: number;
  /** What the last action brought. */
  got: Slot;
  pockets: Slot[];
  box: Slot[];
}

/** The trees the core knows, by the recipe's kinds: what can be had from each. */
const TREE_KIND: Partial<Record<PropKind, number>> = { tree: 0, fruit: 1, cedar: 2, palm: 3 };

/** The recipe's trees, after the island's map (src/core/island.ts holdIsland). */
export function holdTrees(m: IslandMap): void {
  const c = core();
  for (const p of m.props) {
    const kind = TREE_KIND[p.kind];
    if (kind !== undefined) c.pi_island_add_tree(p.x, p.z, p.rot, kind, p.variant);
  }
}

export const things = {
  /** A first run: the tools in the pockets and nothing else. */
  reset(): void {
    core().pi_things_reset();
  },

  /** The island's things for `day` (local days since 1970, src/core/clock.ts day); nothing changes on the same day. */
  day(day: number): void {
    core().pi_things_day(day);
  },

  /** What A would do now. */
  hint(): Hint {
    return HINTS[core().pi_things_hint()] ?? "";
  },

  /** The next tool in hand, `dir` 1 or -1. */
  cycle(dir: number): void {
    core().pi_things_cycle(dir);
  },

  hold(slot: number): void {
    core().pi_things_hold(slot);
  },

  /** Pocket `slot` into the box (in the house). */
  store(slot: number): boolean {
    return !!core().pi_things_store(slot);
  },

  /** The box's `slot` into the pockets (in the house). */
  take(slot: number): boolean {
    return !!core().pi_things_take(slot);
  },

  /** Pocket `slot` onto the ground ahead (outdoors). */
  drop(slot: number): boolean {
    return !!core().pi_things_drop(slot);
  },

  slots(): Slots {
    const c = core();
    c.pi_things_slots();
    const d = c.data;
    const at = (k: number): Slot => ({ item: d[3 + k * 2]!, count: d[4 + k * 2]! });
    return {
      held: d[0]!, got: { item: d[1]!, count: d[2]! },
      pockets: Array.from({ length: POCKETS }, (_, k) => at(k)),
      box: Array.from({ length: BOX }, (_, k) => at(POCKETS + k)),
    };
  },

  /** What to draw: `n` entries of `VIEW_FIELDS` numbers in `data` (a view over the core's memory, valid until the next call). */
  view(): { n: number; data: Float32Array } {
    const c = core();
    const n = c.pi_things_view();
    return { n, data: c.view };
  },

  /** What to keep between runs. */
  save(): number[] {
    const c = core();
    const n = c.pi_things_save();
    return Array.from(c.data.subarray(0, n), (v) => Math.round(v * 1000) / 1000);
  },

  /** Back as kept; false when it is not a save of this version or this island. */
  load(kept: readonly number[]): boolean {
    const c = core();
    if (kept.length > c.data.length) return false;
    c.data.set(kept);
    return !!c.pi_things_load(kept.length);
  },
};
