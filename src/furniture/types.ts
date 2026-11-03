import type * as THREE from "three";
import type { ItemSpec } from "../core/types.ts";

export type SeriesId = "wooden" | "cute" | "rattan" | "japanese" | "starry" | "nordic" | "basic";

/** Each series' English name and line; other languages are in src/i18n. */
export const SERIES: Record<SeriesId, { name: string; blurb: string }> = {
  wooden: { name: "Wooden Series", blurb: "Warm pine, sturdy and plain" },
  cute: { name: "Cute Series", blurb: "Pink and white, round and princessy" },
  rattan: { name: "Rattan Series", blurb: "Island-holiday rattan and greenery" },
  japanese: { name: "Japanese Series", blurb: "Tatami, paper lamps and low tables" },
  starry: { name: "Starry Series", blurb: "Moons and stars for a dreamy room" },
  nordic: { name: "Simple Series", blurb: "White and light oak, clean and neat" },
  basic: { name: "Odds & Ends", blurb: "Plants, little things and all sorts of goodies" },
};

export type Category =
  | "bed" | "seat" | "table" | "storage" | "lamp" | "plant" | "decor" | "appliance" | "toy"
  | "wall" | "window" | "ceiling" | "rug";

export const CATEGORY_NAMES: Record<Category, string> = {
  bed: "Beds", seat: "Chairs & sofas", table: "Tables", storage: "Storage", lamp: "Lamps", plant: "Plants", decor: "Decor",
  appliance: "Appliances", toy: "Toys", wall: "Wall decor", window: "Windows", ceiling: "Hanging", rug: "Rugs",
};

export interface Variant {
  name: string;
  /** A colour for the swatch in the catalogue. */
  swatch: string;
}

export interface LightSpec {
  /** Where the light comes from, in the item's frame. */
  at: [number, number, number];
  color: string;
  /** Point light intensity at full brightness. */
  intensity: number;
  distance: number;
  /** Diameter of the halo drawn over the lamp; 0 for none. */
  halo: number;
  /** Whether a newly placed one starts switched on. */
  startsOn?: boolean;
}

export interface FurnitureDef extends ItemSpec {
  name: string;
  series: SeriesId;
  category: Category;
  variants: Variant[];
  /**
   * The model for a variant. Floor, misc and rug items stand on y = 0,
   * centred on their footprint, facing +Z. Wall items are centred on their
   * wall rectangle with their back on z = 0. Ceiling items hang from y = 0.
   */
  build(variant: number): THREE.Object3D;
  /** Lamps and anything else that lights up when switched on. */
  light?: LightSpec;
  /** Switches on and off (lamps, televisions, radios) even without a light. */
  switchable?: boolean;
  /** Hidden from the catalogue (structural pieces). */
  hidden?: boolean;
}

/** A wallpaper or a flooring. */
export interface FinishDef {
  id: string;
  kind: "wallpaper" | "flooring";
  name: string;
  series: SeriesId;
  swatch: string;
  /** Tiles one texture covers: [across, along]. A wallpaper's texture is one tile wide and the wall's height tall. */
  span: [number, number];
  /** Pixels per tile. */
  density: number;
  draw(g: CanvasRenderingContext2D, w: number, h: number): void;
  /** Height for the bump map, drawn in greys; omitted for a flat finish. */
  bump?(g: CanvasRenderingContext2D, w: number, h: number): void;
  bumpScale?: number;
  roughness: number;
  /** Wallpapers: the skirting board's colour, and the colour of the wall's cut top. */
  skirting?: string;
  cap?: string;
}
