// The catalogue's numbers, for what the island's core keeps of a piece of furniture outside the room:
// a piece in the pockets is the core's item FURNITURE + its code × LOOKS + its variant
// (crates/island-core/src/things.rs `item`), and a run keeps those numbers. A piece's code is its
// place in this list, from 1. Never reorder or remove one (a pocket kept would come back as
// another piece): a new piece is added at the end (docs/furniture-authoring.md).

export const CODES: readonly string[] = [
  "wooden-bed", "wooden-nightstand", "wooden-wardrobe", "wooden-desk", "wooden-chair", "wooden-bookshelf",
  "wooden-round-table", "wooden-stool", "wooden-chest", "wooden-lamp", "cute-bed", "cute-nightstand",
  "cute-wardrobe", "cute-vanity", "cute-chair", "cute-sofa", "cute-table", "cute-floor-lamp", "bunny-plush",
  "cute-music-box", "heart-mirror", "cute-garland", "cute-pendant", "rattan-bed", "rattan-nightstand",
  "rattan-armchair", "rattan-low-table", "rattan-cabinet", "rattan-floor-lamp", "rattan-hanging-chair",
  "bird-of-paradise", "rattan-basket", "ceiling-fan", "woven-rug", "shell-chime", "surfboard", "futon", "chabudai",
  "zabuton", "andon", "tansu", "byobu", "bonsai", "tea-set", "kakejiku", "shoji-window", "chochin", "tatami-rug",
  "star-bed", "star-nightstand", "moon-chair", "cloud-sofa", "star-desk", "telescope", "star-lamp", "globe",
  "moon-lamp", "star-string", "planet-mobile", "round-window", "cloud-rug", "simple-bed", "simple-nightstand",
  "simple-desk", "simple-chair", "simple-sofa", "lounge-chair", "side-table", "tripod-lamp", "cube-shelf",
  "floor-mirror", "snake-plant", "wall-shelf", "abstract-print", "globe-pendant", "wool-rug", "monstera",
  "succulent", "fiddle-leaf", "flower-vase", "table-lamp", "floor-lamp", "alarm-clock", "book-stack", "teddy-bear",
  "round-rug", "stripe-rug", "heart-rug", "simple-window", "wall-clock", "poster-island", "pendant-lamp", "tv-stand",
  "flat-tv", "retro-tv", "record-player", "laptop", "desk-fan", "game-console", "aquarium", "candle", "mug",
  "guitar", "piano", "arched-window", "air-conditioner", "chandelier", "shaggy-rug",
];

/** The core's numbers for carried furniture (the core's `item::FURNITURE` and `item::LOOKS`). */
export const FURNITURE = 1000;
export const LOOKS = 8;

const BY_ID = new Map(CODES.map((id, k) => [id, k + 1]));

/** A piece's code (0: it has none, and cannot be carried). */
export function furnitureCode(id: string): number {
  return BY_ID.get(id) ?? 0;
}

/** The item number a piece in its look is carried as, or 0. */
export function furnitureItem(id: string, variant: number): number {
  const code = furnitureCode(id);
  return code && variant >= 0 && variant < LOOKS ? FURNITURE + code * LOOKS + variant : 0;
}

/** The piece and look an item number is, or null when it is not furniture. */
export function furnitureOf(item: number): { id: string; variant: number } | null {
  if (item < FURNITURE + LOOKS) return null;
  const id = CODES[Math.floor((item - FURNITURE) / LOOKS) - 1];
  return id ? { id, variant: (item - FURNITURE) % LOOKS } : null;
}
