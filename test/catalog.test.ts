// The catalogue, the presets and the showrooms all follow the room's rules.
import { describe, expect, test } from "bun:test";
import { WALL_HEIGHT, check, turned } from "../src/core/rules.ts";
import { FURNITURE, catalog } from "../src/furniture/catalog.ts";
import { FINISHES } from "../src/furniture/finishes.ts";
import { SERIES, type SeriesId } from "../src/furniture/types.ts";
import { PRESETS, skipped } from "../src/presets.ts";
import { CATALOG_STRINGS } from "../src/i18n/index.ts";
import { ITEMS } from "../src/items/items.ts";
import { CODES, LOOKS, furnitureCode, furnitureItem, furnitureOf } from "../src/furniture/codes.ts";
import { showroom } from "../src/showroom.ts";

const half = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;

describe("catalogue", () => {
  test("ids are unique", () => {
    expect(new Set(FURNITURE.map((d) => d.id)).size).toBe(FURNITURE.length);
  });

  test("every wall item says where it hangs, with its bottom on a half tile (docs/furniture-authoring.md)", () => {
    for (const def of FURNITURE.filter((d) => d.kind === "wall")) {
      expect([def.id, def.hang !== undefined]).toEqual([def.id, true]);
      expect([def.id, half(def.hang! - def.size[1] / 2)]).toEqual([def.id, true]);
    }
  });

  test("every piece has its number for the pockets, kept in order, with room for each of its looks (src/furniture/codes.ts)", () => {
    expect(new Set(CODES).size).toBe(CODES.length);
    for (const def of FURNITURE) {
      expect({ [def.id]: furnitureCode(def.id) > 0 }).toEqual({ [def.id]: true });
      expect(def.variants.length).toBeLessThanOrEqual(LOOKS);
      for (let v = 0; v < def.variants.length; v++) expect(furnitureOf(furnitureItem(def.id, v))).toEqual({ id: def.id, variant: v });
    }
    // A code names no other piece than its own: none is dropped from the list (a kept pocket would be lost).
    for (const id of CODES) expect({ [id]: !!catalog(id) }).toEqual({ [id]: true });
    // Carried furniture is numbered above every other item.
    expect(furnitureItem(CODES[0]!, 0)).toBeGreaterThan(Math.max(...ITEMS.map((d) => d.id)));
  });

  test("everything carried has a name in every language", () => {
    for (const d of ITEMS) for (const strings of [CATALOG_STRINGS.zh, CATALOG_STRINGS.ja]) expect([d.key, !!strings.pockets[d.key]]).toEqual([d.key, true]);
  });

  for (const def of FURNITURE) {
    test(`${def.id} (${def.name}) has a valid spec`, () => {
      const [w, d] = def.size;
      expect(w > 0 && d > 0 && half(w) && half(d)).toBe(true);
      expect(def.variants.length).toBeGreaterThan(0);
      for (const v of def.variants) expect(v.name && /^#[0-9a-f]{6}$/i.test(v.swatch)).toBeTruthy();
      expect(SERIES[def.series]).toBeDefined();
      if (def.kind === "wall") {
        const hang = def.hang ?? 1.5;
        expect(half(hang - d / 2)).toBe(true);
        expect(hang - d / 2 >= 0 && hang + d / 2 <= WALL_HEIGHT).toBe(true);
      }
      if (def.surface) {
        expect(def.kind).toBe("floor");
        const [x0, z0, x1, z1] = def.surface.rect;
        expect(x0 >= -w / 2 && z0 >= -d / 2 && x1 <= w / 2 && z1 <= d / 2).toBe(true);
        expect(half(x1 - x0) && half(z1 - z0) && x1 - x0 >= 1 && z1 - z0 >= 0.5).toBe(true);
        expect(def.surface.y > 0.1 && def.surface.y < 2.2).toBe(true);
      }
      if (def.light) expect(def.light.intensity > 0 && def.light.distance > 0).toBe(true);
      if (def.category === "rug") expect(def.kind).toBe("rug");
    });
  }

  test("every series has a full set: beds, seats, tables or storage, lamps", () => {
    for (const id of Object.keys(SERIES) as SeriesId[]) {
      if (id === "basic") continue;
      const cats = new Set(FURNITURE.filter((d) => d.series === id).map((d) => d.category));
      expect([id, cats.has("bed")]).toEqual([id, true]);
      expect([id, cats.has("seat")]).toEqual([id, true]);
      expect([id, cats.has("lamp") || FURNITURE.some((d) => d.series === id && !!d.light)]).toEqual([id, true]);
    }
  });

  test("finishes: unique ids, both kinds", () => {
    expect(new Set(FINISHES.map((f) => f.id)).size).toBe(FINISHES.length);
    expect(FINISHES.filter((f) => f.kind === "wallpaper").length).toBeGreaterThanOrEqual(8);
    expect(FINISHES.filter((f) => f.kind === "flooring").length).toBeGreaterThanOrEqual(8);
  });
});

describe("presets", () => {
  for (const preset of PRESETS) {
    test(`${preset.name} places every item it lists, by the rules`, () => {
      skipped.length = 0;
      const room = preset.make();
      expect(skipped).toEqual([]);
      for (const p of room.items) {
        const rest = { ...room, items: room.items.filter((q) => q.uid !== p.uid || p.layer === "surface") };
        const verdict = check({ ...room, items: rest.items }, catalog, p);
        expect([p.item, verdict.ok]).toEqual([p.item, true]);
      }
      // Everything sits on the half-tile grid.
      for (const p of room.items) {
        const spec = catalog(p.item)!;
        if (p.layer === "wall") {
          expect([p.item, half((p.u ?? 0) - spec.size[0] / 2), half((p.v ?? 0) - spec.size[1] / 2)]).toEqual([p.item, true, true]);
        } else if (p.layer !== "surface") {
          const [w, d] = turned(spec, p.rot);
          expect([p.item, half(p.x - w / 2), half(p.z - d / 2)]).toEqual([p.item, true, true]);
        }
      }
    });
  }
});

describe("showrooms", () => {
  for (const id of Object.keys(SERIES) as SeriesId[]) {
    test(`${SERIES[id].name} sets out every item`, () => {
      const room = showroom(id);
      const ids = new Set(room.items.map((p) => p.item));
      const missing = FURNITURE.filter((d) => d.series === id && !d.hidden && !ids.has(d.id)).map((d) => d.id);
      expect(missing).toEqual([]);
    });
  }
});
