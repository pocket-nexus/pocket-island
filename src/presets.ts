// Ready-made rooms, one per series, laid out by hand on the tile grid.
// Coordinates are item centres in room tiles (z = 0 at the back wall).

import type { Placement, RoomState, Rot, WallSide } from "./core/types.ts";
import { check, DEFAULT_HANG } from "./core/rules.ts";
import { catalog, furniture } from "./furniture/catalog.ts";

let n = 0;
const uid = (tag: string) => `${tag}-${++n}`;

/** What the last preset built had to leave out; a test keeps this empty. */
export const skipped: string[] = [];

class Layout {
  items: Placement[] = [];
  constructor(readonly w: number, readonly d: number) {}

  floor(item: string, x: number, z: number, rot: Rot = 0, variant = 0, on?: boolean): string {
    const id = uid(item);
    this.items.push({ uid: id, item, variant, layer: "floor", x, z, rot, ...(on === undefined ? {} : { on }) });
    return id;
  }

  rug(item: string, x: number, z: number, rot: Rot = 0, variant = 0): string {
    const id = uid(item);
    this.items.push({ uid: id, item, variant, layer: "rug", x, z, rot });
    return id;
  }

  on(host: string, item: string, x: number, z: number, rot: Rot = 0, variant = 0): string {
    const id = uid(item);
    this.items.push({ uid: id, item, variant, layer: "surface", host, x, z, rot });
    return id;
  }

  wall(item: string, wall: WallSide, u: number, v?: number, variant = 0): string {
    const id = uid(item);
    this.items.push({ uid: id, item, variant, layer: "wall", wall, u, v: v ?? furniture(item)?.hang ?? DEFAULT_HANG, x: 0, z: 0, rot: 0 });
    return id;
  }

  ceiling(item: string, x: number, z: number, variant = 0): string {
    const id = uid(item);
    this.items.push({ uid: id, item, variant, layer: "ceiling", x, z, rot: 0 });
    return id;
  }

  done(wallpaper: string, flooring: string): RoomState {
    const room: RoomState = { w: this.w, d: this.d, wallpaper, flooring, items: [], storage: [] };
    // Keep only what exists and fits, so a preset never breaks the rules.
    for (const p of this.items) {
      if (!furniture(p.item)) {
        skipped.push(`${p.item}: missing`);
        continue;
      }
      const verdict = check(room, catalog, p);
      if (verdict.ok) room.items.push(p);
      else {
        skipped.push(`${p.item}: ${verdict.problem.reason}`);
        console.warn(`preset: ${p.item} at ${p.x},${p.z} skipped: ${verdict.problem.reason}`);
      }
    }
    return room;
  }
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  swatch: string;
  make(): RoomState;
}

export const PRESETS: Preset[] = [
  {
    id: "wooden", name: "Wooden Bedroom", blurb: "Wooden furniture, cream wainscot and a round rug", swatch: "#d9a86c",
    make() {
      const L = new Layout(6, 6);
      L.rug("round-rug", 2.5, 3.5, 0, 0);
      const ns1 = L.floor("wooden-nightstand", 0.5, 0.5);
      L.floor("wooden-bed", 2, 1);
      const ns2 = L.floor("wooden-nightstand", 3.5, 0.5);
      L.floor("wooden-wardrobe", 5, 0.5);
      const desk = L.floor("wooden-desk", 5.5, 2.5, 1);
      L.floor("wooden-chair", 4.5, 2.5, 3);
      const shelf = L.floor("wooden-bookshelf", 0.5, 3, 3);
      L.floor("fiddle-leaf", 0.5, 4.5, 0, 0);
      L.floor("floor-lamp", 5.5, 4.5, 0, 0);
      L.floor("wooden-stool", 2, 4, 0);
      L.floor("teddy-bear", 3.5, 3.5, 0, 0);
      L.on(ns1, "wooden-lamp", 0, 0, 0, 0);
      L.on(ns2, "alarm-clock", 0, 0, 0, 0);
      L.on(desk, "book-stack", -0.5, 0, 0, 0);
      L.on(desk, "succulent", 0.5, 0, 0, 0);
      L.on(shelf, "flower-vase", 0.5, 0, 0, 1);
      L.on(shelf, "monstera", -0.5, 0, 0, 0);
      L.wall("simple-window", "back", 2, 2.25, 0);
      L.wall("wall-clock", "back", 5, 2.5, 0);
      L.wall("poster-island", "left", 3, 2.25, 0);
      L.wall("simple-window", "right", 2.5, 1.75, 1);
      L.ceiling("pendant-lamp", 3, 3, 0);
      return L.done("cream-wainscot", "oak-planks");
    },
  },
  {
    id: "cute", name: "Pink Princess Room", blurb: "Princess bed, vanity and a heart rug", swatch: "#f7b6c8",
    make() {
      const L = new Layout(6, 6);
      L.rug("heart-rug", 3, 3.5, 0, 0);
      const ns1 = L.floor("cute-nightstand", 1.5, 0.5);
      L.floor("cute-bed", 3, 1);
      const ns2 = L.floor("cute-nightstand", 4.5, 0.5);
      L.floor("cute-wardrobe", 0.5, 3, 3);
      L.floor("cute-vanity", 5.5, 3, 1);
      L.floor("cute-chair", 4.5, 3, 3);
      const table = L.floor("cute-table", 2.5, 4);
      L.floor("cute-sofa", 1, 5.5);
      L.floor("cute-floor-lamp", 5.5, 5.5);
      L.floor("bunny-plush", 4, 4.5, 0, 0);
      L.on(ns1, "table-lamp", 0, 0, 0, 1);
      L.on(ns2, "cute-music-box", 0, 0);
      L.on(table, "flower-vase", 0, 0, 0, 1);
      L.wall("cute-garland", "back", 3, 2.75);
      L.wall("simple-window", "left", 1, 1.75, 0);
      L.wall("heart-mirror", "right", 1, 2);
      L.wall("poster-island", "left", 5, 2.25, 2);
      L.ceiling("cute-pendant", 3, 3);
      return L.done("pink-polka", "pink-tile");
    },
  },
  {
    id: "rattan", name: "Rattan Getaway", blurb: "Hanging rattan chair, terracotta tiles and a ceiling fan", swatch: "#d6ae78",
    make() {
      const L = new Layout(6, 6);
      L.rug("woven-rug", 3, 3.5);
      const ns = L.floor("rattan-nightstand", 0.5, 0.5);
      L.floor("rattan-bed", 2, 1);
      L.floor("rattan-floor-lamp", 3.5, 0.5);
      const cab = L.floor("rattan-cabinet", 5.5, 1, 1);
      L.floor("rattan-hanging-chair", 4.75, 3.75);
      L.floor("bird-of-paradise", 0.5, 4.5);
      const table = L.floor("rattan-low-table", 3, 3.5);
      L.floor("rattan-armchair", 1.5, 3.5, 3);
      L.floor("surfboard", 5.5, 5.25);
      L.on(ns, "succulent", 0, 0, 0, 2);
      L.on(cab, "rattan-basket", -0.5, 0);
      L.on(cab, "monstera", 0.5, 0, 0, 1);
      L.on(table, "flower-vase", -0.5, 0, 0, 2);
      L.on(table, "mug", 0.5, 0.25);
      L.wall("simple-window", "back", 4.5, 2.25, 1);
      L.wall("shell-chime", "left", 3, 2.5);
      L.wall("arched-window", "right", 3.5, 2);
      L.ceiling("ceiling-fan", 3, 3);
      return L.done("palm-wall", "terracotta");
    },
  },
  {
    id: "japanese", name: "Japanese Cottage", blurb: "Futon, low table, andon lamp and shoji", swatch: "#c9c98a",
    make() {
      const L = new Layout(6, 6);
      L.floor("andon", 0.5, 0.5, 0, 0, true);
      L.floor("futon", 2, 1.5);
      const tansu = L.floor("tansu", 4.5, 0.5);
      const table = L.floor("chabudai", 3.75, 3.25);
      L.floor("zabuton", 2.5, 3.5);
      L.floor("zabuton", 5, 3.5);
      L.floor("byobu", 0.25, 4, 3);
      L.on(tansu, "bonsai", 0.5, 0);
      L.on(tansu, "book-stack", -0.5, 0, 0, 1);
      L.on(table, "tea-set", 0.25, 0.25);
      L.wall("kakejiku", "back", 2, 1.75);
      L.wall("shoji-window", "right", 2.75, 1.75);
      L.wall("wall-clock", "back", 4.5, 2.5, 0);
      L.ceiling("chochin", 3, 3);
      L.ceiling("chochin", 1.5, 4.5, 1);
      return L.done("shoji", "tatami");
    },
  },
  {
    id: "starry", name: "Starry Dream", blurb: "Moon chair, starry bed and planet mobile", swatch: "#2f3a73",
    make() {
      const L = new Layout(6, 6);
      L.rug("cloud-rug", 3, 3.5);
      const ns1 = L.floor("star-nightstand", 1.5, 0.5);
      L.floor("star-bed", 3, 1);
      const ns2 = L.floor("star-nightstand", 4.5, 0.5);
      const desk = L.floor("star-desk", 0.5, 3, 3);
      L.floor("moon-chair", 1.5, 3, 1);
      L.floor("cloud-sofa", 5.5, 3.5, 1);
      L.floor("telescope", 4.5, 5);
      L.floor("teddy-bear", 3.5, 4, 0, 2);
      L.on(ns1, "star-lamp", 0, 0);
      L.on(ns2, "alarm-clock", 0, 0, 0, 1);
      L.on(desk, "globe", -0.5, 0);
      L.on(desk, "book-stack", 0.5, 0);
      L.wall("star-string", "back", 3, 2.75);
      L.wall("moon-lamp", "back", 0.5, 2);
      L.wall("round-window", "left", 1.25, 1.75);
      L.wall("poster-island", "right", 1, 2.25, 1);
      L.ceiling("planet-mobile", 3, 3);
      L.ceiling("planet-mobile", 1.5, 4.5, 1);
      return L.done("starry-wall", "starry-carpet");
    },
  },
  {
    id: "nordic", name: "Nordic Simple", blurb: "White walls, light wood, cube shelf and floor mirror", swatch: "#e9e4da",
    make() {
      const L = new Layout(6, 6);
      L.rug("wool-rug", 3, 3.5);
      const ns = L.floor("simple-nightstand", 0.5, 0.5);
      L.floor("simple-bed", 2, 1);
      const shelf = L.floor("cube-shelf", 4.5, 0.5);
      const desk = L.floor("simple-desk", 5.5, 2.5, 1);
      L.floor("simple-chair", 4.5, 2.5, 3);
      L.floor("simple-sofa", 0.5, 3.5, 3);
      const side = L.floor("side-table", 1.5, 2.5);
      L.floor("lounge-chair", 3.5, 4.5, 2);
      L.floor("tripod-lamp", 0.5, 5);
      L.floor("floor-mirror", 5.75, 4.5, 1);
      L.on(ns, "table-lamp", 0, 0, 0, 0);
      L.on(shelf, "snake-plant", 0.5, 0);
      L.on(shelf, "record-player", -0.5, 0);
      L.on(desk, "laptop", 0.5, 0);
      L.on(desk, "mug", -0.5, 0.25);
      L.on(side, "candle", 0, 0);
      L.wall("abstract-print", "back", 2.25, 2.5);
      L.wall("wall-shelf", "right", 2.5, 2.25);
      L.wall("simple-window", "left", 2, 1.75, 0);
      L.ceiling("globe-pendant", 3, 3);
      return L.done("mint-stripe", "white-planks");
    },
  },
  {
    id: "mixed", name: "Big Bedroom 8×8", blurb: "Every series mixed, with TV, piano and aquarium", swatch: "#9fd6c0",
    make() {
      const L = new Layout(8, 8);
      L.rug("shaggy-rug", 4, 5, 0, 0);
      L.rug("stripe-rug", 1.5, 5, 1, 0);
      const ns1 = L.floor("wooden-nightstand", 0.5, 0.5, 0, 2);
      L.floor("simple-bed", 2, 1, 0, 1);
      const ns2 = L.floor("simple-nightstand", 3.5, 0.5);
      L.floor("piano", 5, 0.5);
      L.floor("guitar", 6.5, 0.5);
      L.floor("fiddle-leaf", 7.5, 0.5, 0, 1);
      const tv = L.floor("tv-stand", 7.5, 4, 1);
      L.floor("cloud-sofa", 4.5, 5, 3, 1);
      L.floor("lounge-chair", 4, 6.5, 2);
      const table = L.floor("chabudai", 5.75, 5.25);
      const shelf = L.floor("wooden-bookshelf", 0.5, 3, 3, 2);
      L.floor("floor-lamp", 0.5, 7.5, 0, 1);
      L.floor("rattan-hanging-chair", 6.75, 6.75);
      L.on(ns1, "table-lamp", 0, 0, 0, 2);
      L.on(ns2, "alarm-clock", 0, 0, 0, 2);
      L.on(tv, "flat-tv", 0, 0, 0);
      L.on(table, "tea-set", -0.25, 0.25);
      L.on(shelf, "aquarium", 0.5, 0);
      L.on(shelf, "game-console", -0.5, 0.25);
      L.wall("arched-window", "back", 2, 2);
      L.wall("air-conditioner", "back", 5, 2.75);
      L.wall("abstract-print", "left", 5.25, 2);
      L.wall("simple-window", "right", 1.5, 1.75, 2);
      L.wall("wall-clock", "right", 6.5, 2.5, 1);
      L.ceiling("chandelier", 4, 4);
      L.ceiling("pendant-lamp", 1.5, 6.5, 2);
      return L.done("gingham", "parquet");
    },
  },
];

export function defaultRoom(): RoomState {
  return PRESETS[0]!.make();
}
