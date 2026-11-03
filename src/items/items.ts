// What the player can carry, by the island's core's numbers (crates/island-core/src/things.rs item):
// the tools, what is gathered on the island, fruit, fossils and fish, and what the shop sells that is
// not carried (more pockets). Names are in English here and
// translated by key in src/i18n/catalog.zh.ts and catalog.ja.ts (`pockets`); the models are in
// ./models.ts.

export type ItemKind = "tool" | "material" | "shell" | "fruit" | "fossil" | "fish" | "upgrade";

export interface ItemDef {
  /** The core's number. */
  id: number;
  key: string;
  name: string;
  kind: ItemKind;
  /** The colour the item's model and icon are painted in. */
  color: string;
  /** For a fish: where it swims, and its length in tiles at its usual size. */
  water?: "sea" | "river" | "pond";
  length?: number;
}

export const ITEMS: readonly ItemDef[] = [
  { id: 1, key: "shovel", name: "Shovel", kind: "tool", color: "#9aa6b2" },
  { id: 2, key: "axe", name: "Axe", kind: "tool", color: "#a8b3bd" },
  { id: 3, key: "rod", name: "Fishing rod", kind: "tool", color: "#c98b4f" },
  { id: 10, key: "branch", name: "Branch", kind: "material", color: "#9b6a43" },
  { id: 11, key: "wood", name: "Wood", kind: "material", color: "#c99563" },
  { id: 12, key: "weed", name: "Weeds", kind: "material", color: "#7cbf4a" },
  { id: 20, key: "scallop", name: "Scallop", kind: "shell", color: "#ffc9b8" },
  { id: 21, key: "cowrie", name: "Cowrie", kind: "shell", color: "#f4dcb2" },
  { id: 22, key: "conch", name: "Conch", kind: "shell", color: "#ffd9cf" },
  { id: 30, key: "orange", name: "Orange", kind: "fruit", color: "#ff9a3c" },
  { id: 31, key: "apple", name: "Apple", kind: "fruit", color: "#e8473f" },
  { id: 32, key: "peach", name: "Peach", kind: "fruit", color: "#ffb19a" },
  { id: 40, key: "ammonite", name: "Ammonite", kind: "fossil", color: "#c7a77d" },
  { id: 41, key: "trilobite", name: "Trilobite", kind: "fossil", color: "#a8957a" },
  { id: 42, key: "shark-tooth", name: "Shark tooth", kind: "fossil", color: "#e9dcc0" },
  { id: 43, key: "fern-fossil", name: "Fern fossil", kind: "fossil", color: "#b9a88c" },
  { id: 50, key: "sardine", name: "Sardine", kind: "fish", color: "#8fb3cf", water: "sea", length: 0.28 },
  { id: 51, key: "mackerel", name: "Mackerel", kind: "fish", color: "#5f8fb0", water: "sea", length: 0.4 },
  { id: 52, key: "sea-bream", name: "Sea bream", kind: "fish", color: "#e79a92", water: "sea", length: 0.5 },
  { id: 53, key: "flounder", name: "Flounder", kind: "fish", color: "#b59a74", water: "sea", length: 0.5 },
  { id: 54, key: "pufferfish", name: "Pufferfish", kind: "fish", color: "#e7c96a", water: "sea", length: 0.32 },
  { id: 55, key: "minnow", name: "Minnow", kind: "fish", color: "#a9b8a2", water: "river", length: 0.18 },
  { id: 56, key: "trout", name: "Trout", kind: "fish", color: "#9aa883", water: "river", length: 0.45 },
  { id: 57, key: "carp", name: "Carp", kind: "fish", color: "#8c7a52", water: "river", length: 0.6 },
  { id: 58, key: "catfish", name: "Catfish", kind: "fish", color: "#6f6a5e", water: "river", length: 0.7 },
  { id: 59, key: "goldfish", name: "Goldfish", kind: "fish", color: "#ff8a3a", water: "pond", length: 0.2 },
  { id: 60, key: "koi", name: "Koi", kind: "fish", color: "#f3f0ea", water: "pond", length: 0.6 },
  // From the shop, never carried: ten more pockets.
  { id: 90, key: "pocket-upgrade", name: "Ten more pockets", kind: "upgrade", color: "#f0a860" },
];

const BY_ID = new Map(ITEMS.map((d) => [d.id, d]));

export function itemDef(id: number): ItemDef | undefined {
  return BY_ID.get(id);
}

export const TOOLS = ITEMS.filter((d) => d.kind === "tool");

/** Coins as the interfaces write them: whole, with a comma every three digits (as all three languages write them). */
export function formatCoins(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
