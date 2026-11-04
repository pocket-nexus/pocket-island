// The catalogue as the interface reads it: the rules' lookup, and each
// item's and finish's number in the pack, which is how the renderer names
// them.
import type { Catalog } from "../../src/core/rules.ts";
import type { FinishData, ItemData, SeriesId } from "./catalog-types.ts";
import { CATALOG_HASH, DATA, PICTURES } from "./generated/catalog.ts";

export { CATALOG_HASH, DATA };

const byId = new Map<string, ItemData>();
const indexOf = new Map<string, number>();
DATA.items.forEach((item, i) => {
  byId.set(item.id, item);
  indexOf.set(item.id, i);
});
const finishIndex = new Map<string, number>();
DATA.finishes.forEach((f, i) => finishIndex.set(f.id, i));

export const catalog: Catalog = (id) => byId.get(id);
export const item = (id: string): ItemData | undefined => byId.get(id);
export const itemIndex = (id: string): number => indexOf.get(id) ?? -1;
export const finish = (id: string): FinishData | undefined => DATA.finishes.find((f) => f.id === id);
export const finishNumber = (id: string): number => finishIndex.get(id) ?? -1;

export const SERIES_IDS = DATA.series.map((s) => s.id) as SeriesId[];

/** The catalogue's tabs, in the browser's order. */
export type Tab = "floor" | "misc" | "wall" | "ceiling" | "rug" | "wallpaper" | "flooring";
export const TABS: Tab[] = ["floor", "misc", "wall", "ceiling", "rug", "wallpaper", "flooring"];

export function itemsIn(tab: Tab, series: SeriesId | "all"): ItemData[] {
  return DATA.items.filter((d) => !d.hidden && d.kind === tab && (series === "all" || d.series === series));
}

export function finishesIn(tab: "wallpaper" | "flooring", series: SeriesId | "all"): FinishData[] {
  return DATA.finishes.filter((f) => f.kind === tab && (series === "all" || f.series === series));
}

/** An item's picture for a variant, a finish's swatch, or an interface icon. */
export function picture(key: string): string {
  return PICTURES[key] ?? PICTURES["ui:sparkle"]!;
}
