// What the export hands the interface about the catalogue (tools/cook.ts
// writes it to generated/catalog.ts): the definitions without their
// builders, the finishes, the sets and the showrooms, as the browser has them.
import type { ItemSpec, RoomState } from "../../src/core/types.ts";

export type SeriesId = "wooden" | "cute" | "rattan" | "japanese" | "starry" | "nordic" | "basic";
export type Category =
  | "bed" | "seat" | "table" | "storage" | "lamp" | "plant" | "decor" | "appliance" | "toy"
  | "wall" | "window" | "ceiling" | "rug";

export interface ItemData extends ItemSpec {
  name: string;
  series: SeriesId;
  category: Category;
  variants: { name: string; swatch: string }[];
  light?: { at: [number, number, number]; color: string; intensity: number; distance: number; halo: number; startsOn?: boolean };
  switchable?: boolean;
  hidden?: boolean;
}

export interface FinishData {
  id: string;
  kind: "wallpaper" | "flooring";
  name: string;
  series: SeriesId;
  swatch: string;
  span: [number, number];
  roughness?: number;
  bumpScale?: number;
  /** Wallpapers: the skirting board's colour and the wall's cut top. */
  skirting?: string;
  cap?: string;
}

export interface PresetData {
  id: string;
  name: string;
  blurb: string;
  swatch: string;
  state: RoomState;
}

export interface CatalogData {
  items: ItemData[];
  finishes: FinishData[];
  presets: PresetData[];
  showrooms: Record<SeriesId | "all", RoomState>;
  series: { id: SeriesId; name: string; blurb: string }[];
  sizes: { id: string; name: string; w: number; d: number }[];
  categories: Record<Category, string>;
  limits: { items: number; wallHeight: number };
}
