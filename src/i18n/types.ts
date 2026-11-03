import type { Category, SeriesId } from "../furniture/types.ts";

/**
 * The catalogue in one language other than English. Items, finishes,
 * presets and room sizes are keyed by id; colour variants by their English
 * name, which many items share.
 */
export interface CatalogStrings {
  items: Record<string, string>;
  finishes: Record<string, string>;
  variants: Record<string, string>;
  series: Record<SeriesId, { name: string; blurb: string }>;
  categories: Record<Category, string>;
  presets: Record<string, { name: string; blurb: string }>;
  sizes: Record<string, string>;
  /** What the player carries, by key (src/items/items.ts). */
  pockets: Record<string, string>;
}
