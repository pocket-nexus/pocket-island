// The room on the 3DS: its state and history (src/core/model.ts), the same
// rules the browser follows (src/core/rules.ts), what is selected and held,
// and what the renderer is handed to draw. The screens (top.tsx, touch.tsx)
// read this module's signals and call its commands; no rule is written here
// a second time.
import { batch, createSignal } from "solid-js";
import { RoomModel, parseRoom } from "../../src/core/model.ts";
import {
  ITEM_LIMIT, WALL_HEIGHT, addRot, byUid, centerOf, check, clampAxis, doorRect, footprint, newUid, resize, snapAxis, snapFloor, snapWall,
  store, surfaceAt, turned, wallLength, wallRect, withDependents, worldRot,
} from "../../src/core/rules.ts";
import type { Layer, Placement, Problem, Rect, RoomState, Rot, Verdict, WallSide } from "../../src/core/types.ts";
import * as i18n from "../../src/i18n/index.ts";
import type { Locale, MessageKey } from "../../src/i18n/index.ts";
import { CATALOG_HASH, DATA, catalog, finish, finishNumber, item, itemIndex } from "./catalog.ts";
import type { ItemData, SeriesId } from "./catalog-types.ts";
import { FLAG, ITEM_FIELDS, MARK_FIELDS, ON, PLAN, island } from "./host.ts";

// ---------------------------------------------------------------- language

const [lang, setLang] = createSignal<Locale>(i18n.locale());
export { lang };
/** Text in the current language; reading it makes a view follow a change of language. */
export function tr(key: MessageKey, params?: Record<string, string | number>): string {
  lang();
  return i18n.t(key, params);
}
export const nameOf = (d: { id: string; name: string }) => (lang(), i18n.itemName(d));
export const finishNameOf = (f: { id: string; name: string }) => (lang(), i18n.finishName(f));
export const variantNameOf = (v: { name: string } | undefined) => (lang(), i18n.variantName(v));
export const seriesNameOf = (id: SeriesId) => (lang(), i18n.seriesName(id));
export const seriesBlurbOf = (id: SeriesId) => (lang(), i18n.seriesBlurb(id));
export const presetNameOf = (p: { id: string; name: string }) => (lang(), i18n.presetName(p));
export const presetBlurbOf = (p: { id: string; blurb: string }) => (lang(), i18n.presetBlurb(p));
export const sizeNameOf = (s: { id: string; name: string }) => (lang(), i18n.roomSizeName(s));
export const problemOf = (p: Problem) => (lang(), i18n.problemText(p));
export const languageName = i18n.languageName;
export const LOCALES = i18n.LOCALES;

export function setLanguage(l: Locale): void {
  i18n.setLocale(l);
  // The glyphs for the language reach the screen before its words do.
  island.fonts(l);
  setLang(l);
  persist();
}

// ---------------------------------------------------------------- the room

export type LayerFilter = "all" | "floor" | "rug" | "ceiling" | "wall";
export const LAYERS: LayerFilter[] = ["all", "floor", "rug", "ceiling", "wall"];
export const WALLS: WallSide[] = ["left", "back", "right"];
export type Sheet = null | "catalog" | "storage" | "sets" | "menu" | "room" | "settings" | "help";
export type Tone = "info" | "good" | "warn";

const presetRoom = (id: string): RoomState => structuredCopy(DATA.presets.find((p) => p.id === id)?.state ?? DATA.presets[0]!.state);
function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const model = new RoomModel(presetRoom("wooden"));
const [room, setRoom] = createSignal<RoomState>(model.state, { equals: false });
const [history, setHistory] = createSignal({ undo: false, redo: false });
model.subscribe((next) => {
  setRoom(next);
  setHistory({ undo: model.canUndo, redo: model.canRedo });
});
export { room, history };

/** The room drawn while a showroom or a set is looked at; null in the visitor's own room. */
const [showroom, setShowroom] = createSignal<SeriesId | "all" | null>(null);
export { showroom };
let ownRoom: RoomState | null = null;

const [selection, setSelection] = createSignal<ReadonlySet<string>>(new Set());
const [layer, setLayerSignal] = createSignal<LayerFilter>("all");
const [wall, setWallSignal] = createSignal<WallSide>("back");
const [lightMode, setLightMode] = createSignal(0);
const [timeOfDay, setTimeOfDay] = createSignal(0);
const [sheet, setSheet] = createSignal<Sheet>(null);
const [notice, setNotice] = createSignal<{ text: string; tone: Tone; key: string; until: number } | null>(null);
const [settings, setSettings] = createSignal({ halos: true, shadows: true, stats: false });
const [confirmation, setConfirmation] = createSignal<{ title: string; body: string; ok: () => void } | null>(null);
/** The cursor, in room tiles on the floor or (u, v) on the wall: where the pad acts. */
const [cursor, setCursor] = createSignal<[number, number]>([3, 3]);
const [cursorShown, setCursorShown] = createSignal(false);
export { selection, layer, wall, lightMode, timeOfDay, sheet, notice, settings, confirmation, cursor, cursorShown };

export function openSheet(next: Sheet): void {
  cancelCarry();
  setSheet(next);
}

export function ask(title: string, body: string, ok: () => void): void {
  setConfirmation({ title, body, ok });
}
export function answer(yes: boolean): void {
  const c = confirmation();
  setConfirmation(null);
  if (yes && c) c.ok();
}

// ---------------------------------------------------------------- notices

let frame = 0;
export function tickFrame(): void {
  frame++;
  const n = notice();
  if (n && frame > n.until) setNotice(null);
  if (saveDue && frame >= saveDue) {
    saveDue = 0;
    persistNow();
  }
}
export function say(text: string, tone: Tone = "info", key = "info"): void {
  setNotice({ text, tone, key, until: frame + 150 });
}
export function sayProblem(p: Problem, rotating = false): void {
  const reason = problemOf(p);
  say(rotating ? tr("notice.cantRotate", { reason }) : reason, "warn", rotating ? "cant-rotate" : p.reason);
}

// ---------------------------------------------------------------- what is kept

let saveDue = 0;
interface Kept {
  version: 1;
  room: RoomState;
  light: number;
  time: number;
  lang: Locale;
  settings: { halos: boolean; shadows: boolean; stats: boolean };
}

function persist(): void {
  saveDue = frame + 30;
}

function persistNow(): void {
  const kept: Kept = { version: 1, room: ownRoom ?? model.state, light: lightMode(), time: timeOfDay(), lang: lang(), settings: settings() };
  island.save("room", JSON.stringify(kept));
}

/** At start: the room, the light and the language kept from the last run. */
export function restore(): void {
  let kept: Partial<Kept> | null = null;
  try {
    const text = island.load("room");
    kept = text ? (JSON.parse(text) as Partial<Kept>) : null;
  } catch {
    kept = null;
  }
  const saved = kept && parseRoom(kept.room);
  if (saved) model.reset(sanitize(saved));
  if (kept?.lang && LOCALES.includes(kept.lang)) {
    i18n.setLocale(kept.lang);
    setLang(kept.lang);
  }
  island.fonts(lang());
  if (kept?.settings) setSettings({ ...settings(), ...kept.settings });
  setLightMode(kept?.light ?? 0);
  setTimeOfDay(kept?.time ?? 0);
  island.light(lightMode(), timeOfDay());
  island.options(settings().halos ? 1 : 0, settings().shadows ? 1 : 0);
  setCursor([model.state.w / 2, model.state.d / 2]);
  setHistory({ undo: false, redo: false });
  sync();
}

/** Drops what this catalogue does not have: a saved room may come from another version. */
function sanitize(state: RoomState): RoomState {
  const items = state.items.filter((p) => item(p.item));
  return {
    ...state,
    wallpaper: finish(state.wallpaper) ? state.wallpaper : "cream-wainscot",
    flooring: finish(state.flooring) ? state.flooring : "oak-planks",
    items: items.filter((p) => p.layer !== "surface" || items.some((h) => h.uid === p.host)),
    storage: state.storage.filter((s) => item(s.item)),
  };
}

// ---------------------------------------------------------------- the renderer

/** Each placement's number for the renderer, kept while it is in the room. */
const numbers = new Map<string, number>();
let nextNumber = 1;
const numberOf = (uid: string) => {
  let n = numbers.get(uid);
  if (n === undefined) numbers.set(uid, (n = nextNumber++));
  return n;
};

/** Where an item stands in the world, as the browser's view places it (src/scene/view.ts worldPose). */
function pose(state: RoomState, p: Placement): [number, number, number, number] {
  const hw = state.w / 2, hd = state.d / 2;
  if (p.layer === "wall") {
    const u = p.u ?? 0, v = p.v ?? 0;
    if (p.wall === "left") return [-hw, v, u - hd, Math.PI / 2];
    if (p.wall === "right") return [hw, v, u - hd, -Math.PI / 2];
    return [u - hw, v, -hd, 0];
  }
  const [x, z] = centerOf(state, p);
  let y = 0;
  if (p.layer === "ceiling") y = WALL_HEIGHT;
  if (p.layer === "rug") y = 0.001;
  if (p.layer === "surface") {
    const host = byUid(state, p.host);
    y = (host && item(host.item)?.surface?.y) ?? 0;
  }
  return [x - hw, y, z - hd, (-worldRot(state, p) * Math.PI) / 2];
}

const LAYER_CODE: Record<Layer, number> = { floor: ON.floor, rug: ON.rug, surface: ON.surface, wall: ON.wall, ceiling: ON.ceiling };

/** Hands the renderer the room as it is shown: the state, or the state with what is held where it is held. */
export function sync(): void {
  const c = carry;
  const state = room();
  const shown: RoomState = c ? { ...state, items: state.items.map((p) => c.candidate.get(p.uid) ?? p) } : state;
  const sel = selection();
  const data = new Float32Array(shown.items.length * ITEM_FIELDS);
  shown.items.forEach((p, i) => {
    const def = item(p.item);
    const [x, y, z, yaw] = pose(shown, p);
    let flags = 0;
    if (sel.has(p.uid)) flags |= FLAG.selected;
    if (c?.candidate.has(p.uid)) flags |= FLAG.held | (c.verdict.ok ? 0 : FLAG.refused);
    const o = i * ITEM_FIELDS;
    data[o] = numberOf(p.uid);
    data[o + 1] = itemIndex(p.item);
    data[o + 2] = p.variant;
    data[o + 3] = x;
    data[o + 4] = y;
    data[o + 5] = z;
    data[o + 6] = yaw;
    data[o + 7] = (p.on ?? def?.light?.startsOn ?? false) ? 1 : 0;
    data[o + 8] = flags;
    data[o + 9] = LAYER_CODE[p.layer];
  });
  island.room(shown.w, shown.d, finishNumber(shown.wallpaper), finishNumber(shown.flooring), data);
  syncMarks(shown);
}

/** Footprints of what is held (green where it fits, red where it does not) and the pad's cursor. */
function syncMarks(shown: RoomState): void {
  const marks: number[] = [];
  const c = carry;
  const push = (kind: number, r: Rect, lift: number, rgb: [number, number, number], alpha: number) => marks.push(kind, r[0], r[1], r[2], r[3], lift, rgb[0], rgb[1], rgb[2], alpha);
  const GOOD: [number, number, number] = [0.4, 0.76, 0.48], BAD: [number, number, number] = [0.95, 0.36, 0.3];
  if (c) {
    for (const p of c.candidate.values()) {
      const def = item(p.item);
      if (!def) continue;
      const tone = c.verdict.ok ? GOOD : BAD;
      if (p.layer === "wall") push(WALL_KIND[p.wall ?? "back"], wallRect(def, p), 0, tone, 0.45);
      else {
        const r = footprint(shown, catalog, p);
        const host = p.layer === "surface" ? byUid(shown, p.host) : undefined;
        const lift = p.layer === "ceiling" ? 0 : host ? (item(host.item)?.surface?.y ?? 0) : 0;
        if (r) push(0, r, lift, tone, 0.42);
      }
    }
  }
  if (cursorShown() && !c) {
    const [a, b] = cursor();
    if (layer() === "wall") push(WALL_KIND[wall()] + 8, [a - 0.5, b - 0.5, a + 0.5, b + 0.5], 0, [1, 0.95, 0.7], 0.95);
    else push(8, [a - 0.5, b - 0.5, a + 0.5, b + 0.5], layer() === "ceiling" ? 0 : 0, [1, 0.95, 0.7], 0.95);
  }
  island.marks(new Float32Array(marks));
}
const WALL_KIND: Record<WallSide, number> = { back: 1, left: 2, right: 3 };

// ---------------------------------------------------------------- the plan on the touch screen

/** The plan's area on the touch screen, between the layer tabs and the toolbar. */
export const PLAN_AREA = { x: 0, y: 28, w: 320, h: 172 };

export interface PlanView {
  mode: "floor" | WallSide;
  /** Pixels per tile. */
  s: number;
  /** The pixel of the room's back-left corner (floor), or of the wall's top-left (wall). */
  x0: number;
  y0: number;
  /** The wall's length, for a wall. */
  length: number;
}

export function planView(): PlanView {
  const state = room();
  if (layer() === "wall") {
    const side = wall();
    const length = wallLength(state, side);
    const s = Math.min((PLAN_AREA.w - 40) / length, (PLAN_AREA.h - 36) / WALL_HEIGHT, 40);
    return { mode: side, s, length, x0: PLAN_AREA.x + (PLAN_AREA.w - length * s) / 2, y0: PLAN_AREA.y + (PLAN_AREA.h - WALL_HEIGHT * s) / 2 + 6 };
  }
  const s = Math.min((PLAN_AREA.w - 28) / state.w, (PLAN_AREA.h - 18) / state.d, 36);
  return { mode: "floor", s, length: 0, x0: PLAN_AREA.x + (PLAN_AREA.w - state.w * s) / 2, y0: PLAN_AREA.y + (PLAN_AREA.h - state.d * s) / 2 };
}

const LAYER_BITS: Record<LayerFilter, number> = { all: 1 | 2, floor: 1 | 2, rug: 1 | 2, ceiling: 1 | 2 | 8, wall: 4 };

/** Tells the renderer where the plan goes. */
export function syncPlan(): void {
  const v = planView();
  const mode = v.mode === "floor" ? PLAN.floor : v.mode === "back" ? PLAN.back : v.mode === "left" ? PLAN.left : PLAN.right;
  island.plan(mode, v.x0, v.y0, v.s, LAYER_BITS[layer()], 0xf8f1dc);
}

/** A room point (tiles, or (u, v) on the wall) at a touch-screen pixel. */
export function fromPlan(px: number, py: number): [number, number] {
  const v = planView();
  if (v.mode === "floor") return [(px - v.x0) / v.s, (py - v.y0) / v.s];
  const u = (px - v.x0) / v.s;
  return [v.mode === "left" ? v.length - u : u, WALL_HEIGHT - (py - v.y0) / v.s];
}

/** A rectangle of the room (tiles, or a wall's [u0, v0, u1, v1]) in touch-screen pixels: x, y, w, h. */
export function toPlan(r: Rect): [number, number, number, number] {
  const v = planView();
  if (v.mode === "floor") return [v.x0 + r[0] * v.s, v.y0 + r[1] * v.s, (r[2] - r[0]) * v.s, (r[3] - r[1]) * v.s];
  const left = v.mode === "left" ? v.x0 + (v.length - r[2]) * v.s : v.x0 + r[0] * v.s;
  return [left, v.y0 + (WALL_HEIGHT - r[3]) * v.s, (r[2] - r[0]) * v.s, (r[3] - r[1]) * v.s];
}

/** Whether an item shows, and can be picked, under the layer filter. */
export function inLayer(p: Placement): boolean {
  switch (layer()) {
    case "all": return p.layer !== "ceiling" && p.layer !== "wall";
    case "floor": return p.layer === "floor" || p.layer === "surface";
    case "rug": return p.layer === "rug";
    case "ceiling": return p.layer === "ceiling";
    case "wall": return p.layer === "wall" && p.wall === wall();
  }
}

/** The item drawn under a room point: what stands on a top before the top, furniture before a rug. */
export function itemAt(x: number, z: number): string | null {
  const state = room();
  const order: Record<Layer, number> = { ceiling: 4, surface: 3, floor: 2, rug: 1, wall: 0 };
  let best: { uid: string; rank: number; area: number } | null = null;
  for (const p of state.items) {
    if (!inLayer(p)) continue;
    const def = item(p.item);
    if (!def) continue;
    const r = p.layer === "wall" ? wallRect(def, p) : footprint(state, catalog, p);
    if (!r || x < r[0] || x > r[2] || z < r[1] || z > r[3]) continue;
    const rank = order[p.layer], area = (r[2] - r[0]) * (r[3] - r[1]);
    if (!best || rank > best.rank || (rank === best.rank && area < best.area)) best = { uid: p.uid, rank, area };
  }
  return best?.uid ?? null;
}

/** The rectangle each placement covers on the plan, for outlines and hits. */
export function rectOf(state: RoomState, p: Placement): Rect | null {
  const def = item(p.item);
  if (!def) return null;
  return p.layer === "wall" ? wallRect(def, p) : footprint(state, catalog, p);
}

export function door(): Rect {
  return doorRect(room());
}

// ---------------------------------------------------------------- layers and the light

export function setLayer(next: LayerFilter): void {
  cancelCarry();
  batch(() => {
    setLayerSignal(next);
    setSelection(new Set<string>());
    const state = room();
    setCursor(next === "wall" ? [wallLength(state, wall()) / 2, 1.5] : [state.w / 2, state.d / 2]);
  });
  syncPlan();
  sync();
}

export function cycleLayer(step: number): void {
  const i = LAYERS.indexOf(layer());
  setLayer(LAYERS[(i + step + LAYERS.length) % LAYERS.length]!);
}

export function setWall(side: WallSide): void {
  setWallSignal(side);
  setLayer("wall");
}

const LIGHT_NAMES: MessageKey[] = ["light.warm", "light.cool", "light.off"];
const TIME_NAMES: MessageKey[] = ["time.day", "time.dusk", "time.night"];
export const lightName = (m = lightMode()) => tr(LIGHT_NAMES[m]!);
export const timeName = (t = timeOfDay()) => tr(TIME_NAMES[t]!);

export function setLight(mode: number): void {
  setLightMode(mode);
  island.light(mode, timeOfDay());
  say(tr("light.toast", { mode: lightName(mode) }), "info", "light");
  persist();
}
export function cycleLight(): void {
  setLight((lightMode() + 1) % 3);
}
export function setTime(time: number): void {
  setTimeOfDay(time);
  island.light(lightMode(), time);
  persist();
}

/** Turn and tilt the upper screen's view, zoom it, or put it back. */
export function camera(yaw: number, pitch: number, zoom: number, reset = false): void {
  island.camera(yaw, pitch, zoom, reset ? 1 : 0);
}

export function setOption(key: "halos" | "shadows" | "stats", on: boolean): void {
  const next = { ...settings(), [key]: on };
  setSettings(next);
  island.options(next.halos ? 1 : 0, next.shadows ? 1 : 0);
  persist();
}

// ---------------------------------------------------------------- selection

export function select(uids: Iterable<string>): void {
  setSelection(new Set(uids));
  sync();
}

export function selected(): { placement: Placement; def: ItemData }[] {
  const state = room();
  return [...selection()]
    .map((uid) => byUid(state, uid))
    .filter((p): p is Placement => !!p)
    .map((placement) => ({ placement, def: item(placement.item)! }))
    .filter((x) => !!x.def);
}

export function clearSelection(): void {
  if (!selection().size) return;
  select([]);
}

/** Selects what the box covers (touch-screen pixels). */
export function boxSelect(x0: number, y0: number, x1: number, y1: number): void {
  const [ax, az] = fromPlan(Math.min(x0, x1), Math.min(y0, y1));
  const [bx, bz] = fromPlan(Math.max(x0, x1), Math.max(y0, y1));
  const lo = [Math.min(ax, bx), Math.min(az, bz)], hi = [Math.max(ax, bx), Math.max(az, bz)];
  const state = room();
  const hits = state.items.filter((p) => {
    if (!inLayer(p) || p.layer === "surface") return false;
    const r = rectOf(state, p);
    return !!r && r[0] < hi[0]! && r[2] > lo[0]! && r[1] < hi[1]! && r[3] > lo[1]!;
  });
  select(hits.map((p) => p.uid));
  if (hits.length > 1) say(tr("notice.selected", { n: hits.length }), "info", "selected");
}

// ---------------------------------------------------------------- carrying with the stylus

interface Carry {
  anchor: string;
  uids: string[];
  originals: Map<string, Placement>;
  candidate: Map<string, Placement>;
  verdict: Verdict;
  /** The anchor's centre minus the room point under the stylus at the start. */
  grab: [number, number];
}
let carry: Carry | null = null;
const [carrying, setCarrying] = createSignal(false);
export { carrying };

export function beginCarry(anchor: string, px: number, py: number): void {
  const state = room();
  const a = byUid(state, anchor);
  if (!a) return;
  let uids = [anchor];
  // Wall and table-top items move alone; floor-type items move as the selection.
  if (a.layer !== "wall" && a.layer !== "surface") {
    uids = [...selection()].filter((uid) => {
      const p = byUid(state, uid);
      return p && p.layer !== "wall" && p.layer !== "surface";
    });
    if (!uids.includes(anchor)) uids = [anchor];
  }
  const [x, z] = fromPlan(px, py);
  let grab: [number, number] = [0, 0];
  if (a.layer === "wall") grab = [(a.u ?? 0) - x, (a.v ?? 0) - z];
  else {
    const [cx, cz] = centerOf(state, a);
    grab = [cx - x, cz - z];
  }
  const originals = new Map(uids.map((uid) => [uid, byUid(state, uid)!]));
  carry = { anchor, uids, originals, candidate: new Map(originals), verdict: { ok: true }, grab };
  batch(() => {
    if (!selection().has(anchor)) setSelection(new Set(uids));
    setCarrying(true);
  });
  moveCarry(px, py);
}

/** Where the anchor would go with the stylus at (px, py). */
function target(a: Placement, def: ItemData, roomRot: Rot, x: number, z: number, ignore: Set<string>): Placement {
  const state = room();
  if (a.layer === "wall") {
    const side = a.wall ?? "back";
    const [u, v] = snapWall(state, def, side, x, z);
    return { ...a, layer: "wall", wall: side, u, v };
  }
  if (def.kind === "misc") {
    const spot = surfaceAt(state, catalog, def, roomRot, x, z, ignore);
    if (spot) return { ...a, layer: "surface", host: spot.host, x: spot.x, z: spot.z, rot: spot.rot, wall: undefined };
  }
  const [sx, sz] = snapFloor(state, def, roomRot, x, z);
  const layerOf: Layer = def.kind === "ceiling" ? "ceiling" : def.kind === "rug" ? "rug" : "floor";
  return { ...a, layer: layerOf, x: sx, z: sz, rot: roomRot, host: undefined, wall: undefined };
}

export function moveCarry(px: number, py: number): void {
  const c = carry;
  if (!c) return;
  const state = room();
  const a = c.originals.get(c.anchor)!;
  const def = item(a.item)!;
  const [x, z] = fromPlan(px, py);
  const ignore = new Set(c.uids);
  const roomRot = worldRot(state, a);
  const next = target(a, def, roomRot, x + c.grab[0], z + c.grab[1], ignore);
  c.candidate = new Map([[c.anchor, next]]);
  // The rest of the selection keeps its offset from the anchor.
  if (c.uids.length > 1 && next.layer !== "wall" && next.layer !== "surface") {
    const dx = next.x - a.x, dz = next.z - a.z;
    for (const uid of c.uids) {
      if (uid === c.anchor) continue;
      const o = c.originals.get(uid)!;
      c.candidate.set(uid, { ...o, x: o.x + dx, z: o.z + dz });
    }
  }
  c.verdict = judge(c.candidate, ignore);
  sync();
}

/** Whether every candidate fits, the items in `ignore` moving with them (src/editor.ts judge). */
function judge(candidates: Map<string, Placement>, ignore: Set<string>): Verdict {
  const s = room();
  const moved = { ...s, items: s.items.map((p) => candidates.get(p.uid) ?? p) };
  for (const p of candidates.values()) {
    const others = new Set([...ignore].filter((u) => u !== p.uid));
    const v = check({ ...moved, items: moved.items.filter((q) => !others.has(q.uid) || q.uid === p.host) }, catalog, p);
    if (!v.ok) return v;
  }
  return { ok: true };
}

/** Lets go: where it fits it stays, otherwise it goes back and the reason is said. */
export function dropCarry(intoStorage = false): void {
  const c = carry;
  if (!c) return;
  carry = null;
  setCarrying(false);
  if (intoStorage) {
    putAway(c.uids);
    return;
  }
  const changed = [...c.candidate].some(([uid, p]) => JSON.stringify(p) !== JSON.stringify(c.originals.get(uid)));
  if (c.verdict.ok && changed) {
    const s = room();
    commit({ ...s, items: s.items.map((p) => c.candidate.get(p.uid) ?? p) });
  } else {
    if (!c.verdict.ok) sayProblem(c.verdict.problem);
    sync();
  }
}

export function cancelCarry(): void {
  if (!carry) return;
  carry = null;
  setCarrying(false);
  sync();
}

function commit(next: RoomState): void {
  model.commit(next);
  persist();
  sync();
}

// ---------------------------------------------------------------- commands

/** A quarter turn clockwise of the selection (src/editor.ts rotate). */
export function rotate(): void {
  const s = room();
  const next = new Map<string, Placement>();
  for (const uid of selection()) {
    const p = byUid(s, uid);
    const def = p && item(p.item);
    if (!p || !def || p.layer === "wall") continue;
    const rot = addRot(p.rot, 1);
    if (p.layer === "surface") {
      const host = byUid(s, p.host)!;
      const r = item(host.item)!.surface!.rect;
      const [w, d] = turned(def, rot);
      next.set(uid, { ...p, rot, x: snapAxis(clampAxis(p.x, w, r[0], r[2]), w, r[0]), z: snapAxis(clampAxis(p.z, d, r[1], r[3]), d, r[1]) });
    } else {
      const [x, z] = snapFloor(s, def, rot, p.x, p.z);
      next.set(uid, { ...p, rot, x, z });
    }
  }
  if (!next.size) return;
  const verdict = judge(next, new Set(next.keys()));
  if (!verdict.ok) {
    sayProblem(verdict.problem, true);
    return;
  }
  commit({ ...s, items: s.items.map((p) => next.get(p.uid) ?? p) });
}

function rotateToHost(dx: number, dz: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [dx, dz];
    case 1: return [dz, -dx];
    case 2: return [-dx, -dz];
    case 3: return [-dz, dx];
  }
}

/** The selection by half a tile, or the cursor by one (src/editor.ts nudge). */
export function nudge(dx: number, dz: number): void {
  const s = room();
  if (!selection().size) {
    const [a, b] = cursor();
    const v = planView();
    const maxA = v.mode === "floor" ? s.w : v.length, maxB = v.mode === "floor" ? s.d : WALL_HEIGHT;
    // On a wall up is up; seen from inside, the left wall's back end is on the right.
    const da = v.mode === "left" ? -dx : dx, db = v.mode === "floor" ? dz : -dz;
    setCursor([Math.max(0.5, Math.min(maxA - 0.5, a + da)), Math.max(0.5, Math.min(maxB - 0.5, b + db))]);
    setCursorShown(true);
    sync();
    return;
  }
  const next = new Map<string, Placement>();
  for (const uid of selection()) {
    const p = byUid(s, uid);
    if (!p) continue;
    if (p.layer === "wall") next.set(uid, { ...p, u: (p.u ?? 0) + (p.wall === "left" ? -dx : dx) * 0.5, v: (p.v ?? 0) - dz * 0.5 });
    else if (p.layer === "surface") {
      const host = byUid(s, p.host)!;
      const [lx, lz] = rotateToHost(dx * 0.5, dz * 0.5, host.rot);
      next.set(uid, { ...p, x: p.x + lx, z: p.z + lz });
    } else next.set(uid, { ...p, x: p.x + dx * 0.5, z: p.z + dz * 0.5 });
  }
  const verdict = judge(next, new Set(next.keys()));
  if (!verdict.ok) {
    sayProblem(verdict.problem);
    return;
  }
  commit({ ...s, items: s.items.map((p) => next.get(p.uid) ?? p) });
}

/** A selects what is under the cursor, or lets the selection go. */
export function pickAtCursor(): void {
  if (selection().size) {
    clearSelection();
    return;
  }
  const [a, b] = cursor();
  const uid = itemAt(a, b);
  setCursorShown(true);
  if (uid) select([uid]);
  else sync();
}

export function putAway(uids: Iterable<string> = selection()): void {
  const list = [...uids];
  if (!list.length) return;
  const leaving = withDependents(room(), list);
  const next = store(room(), list);
  setSelection(new Set<string>());
  commit(next);
  say(tr("notice.stored", { n: leaving.size }), "info", "stored");
}

export function setVariant(variant: number): void {
  const s = room();
  const sel = selection();
  if (!sel.size) return;
  commit({ ...s, items: s.items.map((p) => (sel.has(p.uid) ? { ...p, variant: Math.min(variant, (item(p.item)?.variants.length ?? 1) - 1) } : p)) });
}

/** Switches a lamp or a television (outside the history, as in the browser). */
export function toggle(uid: string): void {
  const s = room();
  const p = byUid(s, uid);
  const def = p && item(p.item);
  if (!p || !def) return;
  const on = !(p.on ?? def.light?.startsOn ?? false);
  model.replace({ ...s, items: s.items.map((q) => (q.uid === uid ? { ...q, on } : q)) });
  persist();
  sync();
}

export function undo(): void {
  cancelCarry();
  if (model.undo()) {
    pruneSelection();
    persist();
    sync();
  }
}
export function redo(): void {
  cancelCarry();
  if (model.redo()) {
    pruneSelection();
    persist();
    sync();
  }
}
function pruneSelection(): void {
  const s = room();
  const kept = [...selection()].filter((uid) => byUid(s, uid));
  if (kept.length !== selection().size) setSelection(new Set(kept));
}

// ---------------------------------------------------------------- placing

/** The free spot nearest to (x, z) (tiles; on a wall, u along it) where `def` fits, or null. */
function freeSpot(def: ItemData, variant: number, near?: { layer: Layer; x: number; z: number; wall?: WallSide }): Placement | null {
  const s = room();
  const base: Placement = { uid: newUid(), item: def.id, variant, layer: "floor", x: 0, z: 0, rot: 0 };
  if (def.light) base.on = def.light.startsOn ?? false;
  if (def.kind === "wall") {
    const sides: WallSide[] = near?.wall ? [near.wall, ...WALLS.filter((w) => w !== near.wall)] : layer() === "wall" ? [wall(), ...WALLS.filter((w) => w !== wall())] : ["back", "left", "right"];
    for (const side of sides) {
      const length = wallLength(s, side);
      const v0 = def.hang ?? 1.5;
      const u0 = near?.wall === side ? near.x : length / 2;
      for (let step = 0; step <= length * 2; step++) {
        for (const sign of step ? [1, -1] : [1]) {
          const [u, v] = snapWall(s, def, side, u0 + sign * step * 0.5, v0);
          const p = { ...base, layer: "wall" as const, wall: side, u, v };
          if (check(s, catalog, p).ok) return p;
        }
      }
    }
    return null;
  }
  const layerOf: Layer = def.kind === "ceiling" ? "ceiling" : def.kind === "rug" ? "rug" : "floor";
  const cx = near ? near.x : s.w / 2, cz = near ? near.z : s.d / 2;
  // Rings outward from the centre, half a tile at a time.
  const spots: [number, number][] = [];
  for (let x = 0.5; x < s.w; x += 0.5) for (let z = 0.5; z < s.d; z += 0.5) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  for (const [x, z] of spots) {
    const [sx, sz] = snapFloor(s, def, 0, x, z);
    const p = { ...base, layer: layerOf, x: sx, z: sz };
    if (check(s, catalog, p).ok) return p;
  }
  // A small thing with no floor left can still go on a top.
  if (def.kind === "misc") {
    for (const host of s.items) {
      const hs = item(host.item);
      if (host.layer !== "floor" || !hs?.surface) continue;
      const spot = surfaceAt(s, catalog, def, 0, host.x, host.z);
      if (!spot) continue;
      const p = { ...base, layer: "surface" as const, host: spot.host, x: spot.x, z: spot.z, rot: spot.rot };
      if (check(s, catalog, p).ok) return p;
    }
  }
  return null;
}

/** From the catalogue or from storage: into the room where there is room, selected. */
export function place(def: ItemData, variant: number, fromStorage: number | null = null): boolean {
  if (room().items.length >= ITEM_LIMIT) {
    say(tr("problem.limit", { max: ITEM_LIMIT }), "warn", "limit");
    return false;
  }
  const p = freeSpot(def, variant);
  if (!p) {
    say(tr("ds.catalog.full"), "warn", "full");
    return false;
  }
  const s = room();
  const storage = fromStorage === null ? s.storage : s.storage.filter((_, i) => i !== fromStorage);
  commit({ ...s, items: [...s.items, p], storage });
  // The plan shows the layer the new piece is on.
  const need: LayerFilter = p.layer === "wall" ? "wall" : p.layer === "ceiling" ? "ceiling" : p.layer === "rug" ? "rug" : layer() === "floor" ? "floor" : "all";
  if (p.layer === "wall" && p.wall) setWallSignal(p.wall);
  if (need !== layer()) setLayer(need);
  select([p.uid]);
  say(tr("ds.catalog.placed", { name: nameOf(def) }), "good", "placed");
  return true;
}

/** L or R held with a tap: a copy beside the original. */
export function copy(uid: string): void {
  const s = room();
  const p = byUid(s, uid);
  const def = p && item(p.item);
  if (!p || !def) return;
  if (s.items.length >= ITEM_LIMIT) {
    say(tr("problem.limit", { max: ITEM_LIMIT }), "warn", "limit");
    return;
  }
  const [x, z] = p.layer === "wall" ? [p.u ?? 0, p.v ?? 0] : centerOf(s, p);
  const spot = freeSpot(def, p.variant, { layer: p.layer, x, z, wall: p.wall });
  if (!spot) {
    say(tr("ds.catalog.full"), "warn", "full");
    return;
  }
  commit({ ...s, items: [...s.items, { ...spot, rot: p.layer === "wall" ? 0 : spot.rot, on: p.on }] });
  select([spot.uid]);
  say(tr("ds.copied"), "good", "copied");
}

export function applyFinish(id: string): void {
  const f = finish(id);
  if (!f) return;
  const s = room();
  commit(f.kind === "wallpaper" ? { ...s, wallpaper: id } : { ...s, flooring: id });
  say(tr("catalog.applied", { name: finishNameOf(f) }), "good", "finish");
}

// ---------------------------------------------------------------- rooms

/** Opens a whole room: a set (`own`, undoable) or a showroom, which is not kept. */
export function loadRoom(state: RoomState, own: boolean, show: SeriesId | "all" | null = null): void {
  cancelCarry();
  if (show && !showroom()) ownRoom = model.state;
  if (own) {
    if (showroom()) {
      model.reset(ownRoom ?? model.state);
      ownRoom = null;
    }
    model.commit(sanitize(structuredCopy(state)));
  } else {
    model.reset(sanitize(structuredCopy(state)));
  }
  setShowroom(show);
  setSelection(new Set<string>());
  setCursor([model.state.w / 2, model.state.d / 2]);
  syncPlan();
  persist();
  sync();
}

export function backToMyRoom(): void {
  if (!showroom()) return;
  const mine = ownRoom ?? presetRoom("wooden");
  ownRoom = null;
  setShowroom(null);
  model.reset(mine);
  setSelection(new Set<string>());
  syncPlan();
  sync();
  say(tr("room.backed"), "info", "back");
}

export function resizeRoom(w: number, d: number): void {
  const s = room();
  if (s.w === w && s.d === d) return;
  const next = resize(s, catalog, w, d);
  const lost = s.items.length - next.items.length;
  commit(next);
  syncPlan();
  say(lost ? tr("room.resizedLost", { w, d, n: lost }) : tr("room.resized", { w, d }), lost ? "warn" : "info", "resized");
}

export function putAllAway(): void {
  const s = room();
  commit(store(s, s.items.map((p) => p.uid)));
  setSelection(new Set<string>());
}

export function resetRoom(): void {
  loadRoom(presetRoom("wooden"), true);
}

export function saveToCard(): void {
  island.save("layout", JSON.stringify(room()));
  say(tr("ds.room.saved"), "good", "saved");
}

export function loadFromCard(): void {
  const text = island.load("layout");
  const state = text ? parseRoom(JSON.parse(text)) : null;
  if (!state) {
    say(tr("ds.room.none"), "warn", "none");
    return;
  }
  loadRoom(state, true);
  say(tr("room.imported"), "good", "imported");
}

/** The pack the renderer read, and whether it names this catalogue. */
export function packProblem(): string | null {
  const info = island.info();
  if (!info.ok) return tr("ds.packError", { error: info.error || "?" });
  if (info.catalogue && info.catalogue !== CATALOG_HASH) return tr("ds.catalogue");
  return null;
}

export const itemCount = () => room().items.length;
