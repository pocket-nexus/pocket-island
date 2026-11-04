// Each language's glyphs for the 3DS, in the browser's typefaces: Baloo 2
// for Latin; for Chinese, Noto Sans SC in running text and ZCOOL KuaiLe in
// bold (the browser's Chinese display face); for Japanese, M PLUS Rounded 1c.
// A language's atlases cover every character its interface text and its
// catalogue can show, for every font slot the interface's styles use; the
// extension loads them when the interface asks for the language
// (island.fonts), in place of the bundle's own.
//
// The faces are fetched once into .pocket-build/fonts and checked by hash.
// They are under the SIL Open Font License; none is committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bakeAtlases } from "../vendor/pocketjs/framework/compiler/bake-font.ts";
import { fontSlotInfo } from "../vendor/pocketjs/framework/compiler/tailwind.ts";
import { catalogJa } from "../src/i18n/catalog.ja.ts";
import { catalogZh } from "../src/i18n/catalog.zh.ts";
import { en } from "../src/i18n/en.ts";
import { ja } from "../src/i18n/ja.ts";
import { zh } from "../src/i18n/zh.ts";

const root = resolve(import.meta.dir, "..");
const DIR = join(root, ".pocket-build/fonts");
const BALOO = join(root, "node_modules/@fontsource/baloo-2/files");

const GOOGLE = "https://github.com/google/fonts/raw/main/ofl";
/** The faces fetched from Google Fonts, and the hash each must have: the files the console's glyphs were first baked from. */
const REMOTE: Record<string, { url: string; sha256: string }> = {
  "ZCOOLKuaiLe-Regular.ttf": { url: `${GOOGLE}/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf`, sha256: "812a6fc1fe54b6d73a419245c32dfeba8aa33104d5be90d1cf6af082007cb71d" },
  "MPLUSRounded1c-Medium.ttf": { url: `${GOOGLE}/mplusrounded1c/MPLUSRounded1c-Medium.ttf`, sha256: "adfde1b6bae58719c4e0144612a94232e72fc5ca655c4722165fe88d06521a70" },
  "MPLUSRounded1c-ExtraBold.ttf": { url: `${GOOGLE}/mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf`, sha256: "8e7c15901dca87f1451b356dda594f7d092ba252a5dcc47da74523a242493c36" },
  "NotoSansSC[wght].ttf": { url: `${GOOGLE}/notosanssc/NotoSansSC%5Bwght%5D.ttf`, sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da" },
};

export const FONT_FACES = {
  latin: { regular: join(BALOO, "baloo-2-latin-600-normal.woff"), bold: join(BALOO, "baloo-2-latin-800-normal.woff") },
  zh: { regular: join(DIR, "NotoSansSC[wght].ttf"), bold: join(DIR, "ZCOOLKuaiLe-Regular.ttf") },
  ja: { regular: join(DIR, "MPLUSRounded1c-Medium.ttf"), bold: join(DIR, "MPLUSRounded1c-ExtraBold.ttf") },
};

const sha = (path: string) => new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex");

export async function prepareFonts(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  for (const [name, { url, sha256 }] of Object.entries(REMOTE)) {
    const path = join(DIR, name);
    if (!existsSync(path)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`fonts: ${url}: ${response.status}`);
      writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
      console.log(`fonts: fetched ${name}`);
    }
    const hash = sha(path);
    if (hash !== sha256) throw new Error(`fonts: ${name} is not the file the glyphs were baked from (${hash}); delete it to fetch it again, or pin the new one`);
  }
  if (!existsSync(FONT_FACES.latin.regular)) throw new Error("fonts: run `bun install` for @fontsource/baloo-2");
}

type Lang = "en" | "zh" | "ja";

/** Every character a language's interface can show. */
function characters(lang: Lang): string {
  const parts: string[] = [];
  const strings = (value: unknown): void => {
    if (typeof value === "string") parts.push(value);
    else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v);
  };
  strings(lang === "en" ? en : lang === "zh" ? zh : ja);
  if (lang === "zh") strings(catalogZh);
  if (lang === "ja") strings(catalogJa);
  // The catalogue's own English names show wherever a translation is missing, and in English.
  strings(JSON.parse(readFileSync(join(root, ".pocket-build/ir/catalog.json"), "utf8")));
  // Every language names the others in the language picker.
  parts.push(en["language.name"], zh["language.name"], ja["language.name"]);
  for (let c = 32; c < 127; c++) parts.push(String.fromCharCode(c));
  // Punctuation the interface draws, Latin and full width (written as escapes: no Chinese or Japanese
  // text outside src/i18n).
  parts.push("\u00b7\u2026\u00d7\u2039\u203a\u00b0\u2013\u2014\u201c\u201d\u2018\u2019\u300c\u300d\uff08\uff09\uff1a\u3001\u3002\uff01\uff1f\uff0c\u266a\u2605\u2665");
  return [...new Set(parts.join(""))].join("");
}

/** The font slots the interface's styles use, from the module the build wrote beside the bundle. */
function usedSlots(stylesModule: string): number[] {
  const text = readFileSync(stylesModule, "utf8");
  const table = /FONT_SLOTS[^=]*=\s*\{([^}]*(?:\}[^}]*)*?)\};/.exec(text)?.[1] ?? "";
  const slots = [...table.matchAll(/(\d+)\s*:\s*\{/g)].map((m) => Number(m[1]));
  if (!slots.length) throw new Error(`fonts: no FONT_SLOTS in ${stylesModule}`);
  return slots;
}

/**
 * Writes `<out>/fonts-<lang>.bin` for each language: a count, then each slot's
 * atlas as its length and bytes (programs/3ds-island/src/extension.c reads it).
 */
export async function bakeLanguages(stylesModule: string, out: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  const slots = usedSlots(stylesModule).filter((s) => !fontSlotInfo(s).mono);
  const regular = slots.filter((s) => !fontSlotInfo(s).bold), bold = slots.filter((s) => fontSlotInfo(s).bold);
  for (const lang of ["en", "zh", "ja"] as Lang[]) {
    const started = Date.now();
    const codepoints = new Set([...characters(lang)].map((c) => c.codePointAt(0)!));
    // English still names Chinese and Japanese in their own words: the Japanese face covers both.
    const faces = lang === "en" ? { regular: FONT_FACES.ja.regular, bold: FONT_FACES.ja.bold } : FONT_FACES[lang];
    const atlases = [
      ...(regular.length ? await bakeAtlases({ codepoints, slots: regular, regularTtf: FONT_FACES.latin.regular, boldTtf: FONT_FACES.latin.bold, fallbackTtfs: [faces.regular] }) : []),
      ...(bold.length ? await bakeAtlases({ codepoints, slots: bold, regularTtf: FONT_FACES.latin.regular, boldTtf: FONT_FACES.latin.bold, fallbackTtfs: [faces.bold] }) : []),
    ];
    const total = atlases.reduce((n, a) => n + 4 + a.bytes.length, 4);
    const file = new Uint8Array(total);
    const view = new DataView(file.buffer);
    view.setUint32(0, atlases.length, true);
    let at = 4;
    for (const a of atlases) {
      view.setUint32(at, a.bytes.length, true);
      file.set(a.bytes, at + 4);
      at += 4 + a.bytes.length;
    }
    writeFileSync(join(out, `fonts-${lang}.bin`), file);
    console.log(`fonts: ${lang}: ${codepoints.size} characters, slots ${slots.join(",")}, ${(total / 1e6).toFixed(2)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
}
