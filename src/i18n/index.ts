// Languages: English, Simplified Chinese and Japanese.
//
// Interface text lives in en.ts / zh.ts / ja.ts under shared keys. The
// catalogue keeps its English names where each thing is defined (a
// furniture def, a finish, a preset); catalog.zh.ts and catalog.ja.ts
// translate them by id. Anything without a translation shows in English.

import { ITEM_LIMIT } from "../core/rules.ts";
import type { Problem } from "../core/types.ts";
import { CATEGORY_NAMES, SERIES, type Category, type SeriesId } from "../furniture/types.ts";
import { catalogJa } from "./catalog.ja.ts";
import { catalogZh } from "./catalog.zh.ts";
import { en, type MessageKey, type Messages } from "./en.ts";
import { ja } from "./ja.ts";
import type { CatalogStrings } from "./types.ts";
import { zh } from "./zh.ts";

export type { MessageKey } from "./en.ts";
export type Locale = "en" | "zh" | "ja";
export const LOCALES: readonly Locale[] = ["en", "zh", "ja"];

const MESSAGES: Record<Locale, Messages> = { en, zh, ja };
const CATALOGS: Record<Exclude<Locale, "en">, CatalogStrings> = { zh: catalogZh, ja: catalogJa };
const HTML_LANG: Record<Locale, string> = { en: "en", zh: "zh-CN", ja: "ja" };
const STORAGE_KEY = "acnh-room/lang";

const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** ?lang= first, then the last choice, then the browser's languages. */
function detect(): Locale {
  if (typeof location === "undefined") return "en";
  const asked = new URLSearchParams(location.search).get("lang");
  if (isLocale(asked)) return asked;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage can be blocked; fall through to the browser's languages.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const l = tag.toLowerCase();
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("ja")) return "ja";
    if (l.startsWith("en")) return "en";
  }
  return "en";
}

let current: Locale = detect();
const listeners = new Set<(l: Locale) => void>();

export function locale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered; the choice still applies to this visit.
  }
  applyToDocument();
  for (const f of listeners) f(next);
}

export function onLocaleChange(f: (l: Locale) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The page's lang (which picks the fonts) and title. */
export function applyToDocument(): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = HTML_LANG[current];
  document.title = t("island.name");
}

/** A language's name in itself, for the language picker. */
export function languageName(l: Locale): string {
  return MESSAGES[l]["language.name"];
}

type Params = Record<string, string | number>;

export function format(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)(?::([^|}]*)\|([^}]*))?\}/g, (whole, key: string, one?: string, many?: string) => {
    const value = params[key];
    if (value === undefined) return whole;
    if (one !== undefined) return `${value} ${Number(value) === 1 ? one : many}`;
    return String(value);
  });
}

export function t(key: MessageKey, params?: Params): string {
  return format(MESSAGES[current][key] ?? en[key], params);
}

const catalog = (): CatalogStrings | null => (current === "en" ? null : CATALOGS[current]);

export function itemName(def: { id: string; name: string }): string {
  return catalog()?.items[def.id] ?? def.name;
}

export function finishName(f: { id: string; name: string }): string {
  return catalog()?.finishes[f.id] ?? f.name;
}

export function variantName(v: { name: string } | undefined): string {
  if (!v) return "";
  return catalog()?.variants[v.name] ?? v.name;
}

export function seriesName(id: SeriesId): string {
  return catalog()?.series[id]?.name ?? SERIES[id].name;
}

export function seriesBlurb(id: SeriesId): string {
  return catalog()?.series[id]?.blurb ?? SERIES[id].blurb;
}

export function categoryName(c: Category): string {
  return catalog()?.categories[c] ?? CATEGORY_NAMES[c];
}

export function presetName(p: { id: string; name: string }): string {
  return catalog()?.presets[p.id]?.name ?? p.name;
}

export function presetBlurb(p: { id: string; blurb: string }): string {
  return catalog()?.presets[p.id]?.blurb ?? p.blurb;
}

export function roomSizeName(s: { id: string; name: string }): string {
  return catalog()?.sizes[s.id] ?? s.name;
}

export function problemText(p: Problem): string {
  return t(`problem.${p.reason}`, { max: ITEM_LIMIT });
}

/** For checks: every catalogue string table, by language. */
export const CATALOG_STRINGS = CATALOGS;
