// Every language has every string, and Chinese or Japanese text appears only
// in the language files.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOM_SIZES } from "../src/core/rules.ts";
import { FURNITURE } from "../src/furniture/catalog.ts";
import { FINISHES } from "../src/furniture/finishes.ts";
import { CATEGORY_NAMES, SERIES } from "../src/furniture/types.ts";
import { CATALOG_STRINGS, format } from "../src/i18n/index.ts";
import { en } from "../src/i18n/en.ts";
import { ja } from "../src/i18n/ja.ts";
import { zh } from "../src/i18n/zh.ts";
import { PRESETS } from "../src/presets.ts";

const root = join(import.meta.dir, "..");
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/;
const params = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();

describe("interface text", () => {
  for (const [name, messages] of [["zh", zh], ["ja", ja]] as const) {
    test(`${name} has every key, with the same parameters as English`, () => {
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(messages[key], key).toBeTruthy();
        expect(params(messages[key]), key).toEqual(params(en[key]));
      }
    });
  }

  test("plurals and parameters fill in", () => {
    expect(format("{n:item|items}", { n: 1 })).toBe("1 item");
    expect(format("{n:item|items} · {blurb}", { n: 3, blurb: "x" })).toBe("3 items · x");
    expect(format("{w}×{d}", { w: 6 })).toBe("6×{d}");
  });
});

describe("catalogue text", () => {
  for (const [lang, strings] of Object.entries(CATALOG_STRINGS)) {
    test(`${lang} names every item, colour, finish, series, category, set and room size`, () => {
      const missing: string[] = [];
      for (const def of FURNITURE) {
        if (!strings.items[def.id]) missing.push(`item ${def.id}`);
        for (const v of def.variants) if (!strings.variants[v.name]) missing.push(`variant ${def.id}/${v.name}`);
      }
      for (const f of FINISHES) if (!strings.finishes[f.id]) missing.push(`finish ${f.id}`);
      for (const id of Object.keys(SERIES) as Array<keyof typeof SERIES>) {
        if (!strings.series[id]?.name || !strings.series[id]?.blurb) missing.push(`series ${id}`);
      }
      for (const c of Object.keys(CATEGORY_NAMES) as Array<keyof typeof CATEGORY_NAMES>) if (!strings.categories[c]) missing.push(`category ${c}`);
      for (const p of PRESETS) if (!strings.presets[p.id]?.name || !strings.presets[p.id]?.blurb) missing.push(`preset ${p.id}`);
      for (const s of ROOM_SIZES) if (!strings.sizes[s.id]) missing.push(`size ${s.id}`);
      expect(missing).toEqual([]);
    });

    test(`${lang} has nothing left over from items that are gone`, () => {
      const variants = new Set(FURNITURE.flatMap((d) => d.variants.map((v) => v.name)));
      const stale = [
        ...Object.keys(strings.items).filter((id) => !FURNITURE.some((d) => d.id === id)),
        ...Object.keys(strings.finishes).filter((id) => !FINISHES.some((f) => f.id === id)),
        ...Object.keys(strings.variants).filter((name) => !variants.has(name)),
      ];
      expect(stale).toEqual([]);
    });
  }

  test("English names are English", () => {
    for (const def of FURNITURE) {
      expect(CJK.test(def.name), def.id).toBe(false);
      for (const v of def.variants) expect(CJK.test(v.name), `${def.id}/${v.name}`).toBe(false);
    }
  });
});

describe("source", () => {
  test("Chinese and Japanese text lives only in src/i18n", () => {
    const skip = new Set(["node_modules", "dist", ".git", ".shots", ".pocket-build", "vendor", "i18n"]);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (skip.has(name) && (name !== "i18n" || relative(root, dir) === "src")) continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|js|html|css|md|json)$/.test(name) && name !== "bun.lock") {
          readFileSync(path, "utf8").split("\n").forEach((line, i) => {
            if (CJK.test(line)) found.push(`${relative(root, path)}:${i + 1}`);
          });
        }
      }
    };
    walk(root);
    expect(found).toEqual([]);
  });
});
