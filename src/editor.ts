// Decorating, after the island's: pick an item up, carry it over the grid
// and set it down where its footprint shows green. Items turn in quarter
// turns, snap to half tiles, go on tables, walls and the ceiling, and can be
// put away. Several can be selected with a box and moved together.
//
// While an item is carried the view shows a preview state; only a valid
// drop is committed to the model, which keeps the history.

import * as THREE from "three";
import { judge, nudgeEach, turnAbout, turnEach, withAnchor } from "./core/edits.ts";
import {
  DEFAULT_HANG, WALL_HEIGHT, addRot, byUid, check, footprint, newUid, snapFloor, snapWall, store, surfaceAt, surfaceRect, wallLength, wallRect,
  withDependents, centerOf,
} from "./core/rules.ts";
import type { RoomModel } from "./core/model.ts";
import type { Layer, Placement, Problem, Rect, RoomState, Rot, Verdict, WallSide } from "./core/types.ts";
import { catalog, furniture } from "./furniture/catalog.ts";
import type { FurnitureDef } from "./furniture/types.ts";
import type { Stage } from "./scene/stage.ts";
import type { RoomView } from "./scene/view.ts";
import type { Overlay } from "./scene/overlay.ts";

export type Mode = "view" | "decorate";
export type LayerFilter = "all" | "floor" | "wall" | "rug" | "ceiling";

export const LAYERS: readonly LayerFilter[] = ["all", "floor", "wall", "rug", "ceiling"];

/** Something the person should hear about; the interface puts it into words. */
export type Notice =
  | { kind: "problem"; problem: Problem; rotating?: boolean }
  | { kind: "selected"; count: number }
  | { kind: "stored"; count: number };

export interface EditorEvents {
  changed(): void;
  notice(n: Notice): void;
  /** The item under the pointer, for a name tag. */
  hover?(uid: string | null): void;
  /** In the view, a click on the floor with no lamp under it: where, in room tiles. */
  floor?(x: number, z: number): void;
}

interface Carry {
  /** The item under the pointer when the carry began; the others keep their offset from it. */
  anchor: string;
  uids: string[];
  originals: Map<string, Placement>;
  /** Pointer to anchor centre, on the anchor's plane, in room tiles. */
  grab: [number, number];
  candidate: Map<string, Placement>;
  verdict: Verdict;
  rot: number;
}

interface Placing {
  def: FurnitureDef;
  variant: number;
  rot: Rot;
  uid: string;
  fromStorage: number | null;
  candidate: Placement | null;
  verdict: Verdict;
}

type Press =
  | { kind: "item"; uid: string; x: number; y: number; shift: boolean }
  | { kind: "box"; x: number; y: number; shift: boolean }
  | { kind: "orbit"; x: number; y: number; moved: boolean; button: number }
  | { kind: "pan"; x: number; y: number };

const MOVE_THRESHOLD = 4;

export class Editor {
  mode: Mode = "view";
  /** Off while the player is outdoors: the room takes no pointer or key. */
  enabled = true;
  layer: LayerFilter = "all";
  readonly selection = new Set<string>();
  hover: string | null = null;
  private carry: Carry | null = null;
  placing: Placing | null = null;
  private press: Press | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private boxEl: HTMLDivElement;
  private lastPointer = { x: 0, y: 0, shift: false };
  /** Whether what is carried fits where it is: the outline turns red when not. */
  private okLook = true;

  constructor(
    private stage: Stage,
    private view: RoomView,
    private overlay: Overlay,
    private model: RoomModel,
    private events: EditorEvents,
  ) {
    const canvas = stage.canvas;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.key(e));
    this.boxEl = document.createElement("div");
    this.boxEl.className = "select-box";
    document.body.appendChild(this.boxEl);
    model.subscribe((next) => {
      for (const uid of [...this.selection]) if (!byUid(next, uid)) this.selection.delete(uid);
      if (!this.carry && !this.placing) this.view.sync(next);
      this.refreshOutline();
      this.events.changed();
    });
  }

  get state(): RoomState {
    return this.model.state;
  }

  // ---------- Mode and layers ----------

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.cancel();
    this.mode = mode;
    this.selection.clear();
    this.stage.rig.setView(mode === "decorate" ? "decorate" : "view");
    this.stage.setFocus(mode === "decorate");
    this.applyLayerVisibility();
    this.refreshOutline();
    this.events.changed();
  }

  setLayer(layer: LayerFilter): void {
    this.layer = layer;
    this.selection.clear();
    this.applyLayerVisibility();
    this.refreshOutline();
    this.events.changed();
  }

  private applyLayerVisibility(): void {
    const decorating = this.mode === "decorate";
    const carrying = this.carryingKinds();
    for (const e of this.view.all()) {
      e.root.visible = !(decorating && e.def.kind === "ceiling" && this.layer !== "ceiling" && !carrying.has("ceiling"));
    }
    this.overlay.show({
      floor: decorating && this.layer !== "ceiling" && this.layer !== "wall" || carrying.has("floor") || carrying.has("misc") || carrying.has("rug"),
      walls: decorating && this.layer === "wall" || carrying.has("wall"),
      ceiling: decorating && this.layer === "ceiling" || carrying.has("ceiling"),
    });
  }

  private carryingKinds(): Set<string> {
    const out = new Set<string>();
    if (this.placing) out.add(this.placing.def.kind);
    if (this.carry) for (const uid of this.carry.uids) { const p = byUid(this.state, uid); if (p) out.add(furniture(p.item)?.kind ?? ""); }
    return out;
  }

  private pickable(def: FurnitureDef): boolean {
    if (this.mode === "view") return true;
    switch (this.layer) {
      case "all": return def.kind !== "ceiling";
      case "floor": return def.kind === "floor" || def.kind === "misc";
      case "wall": return def.kind === "wall";
      case "rug": return def.kind === "rug";
      case "ceiling": return def.kind === "ceiling";
    }
  }

  // ---------- Picking ----------

  private aim(clientX: number, clientY: number): void {
    const r = this.stage.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.stage.camera);
  }

  /** The item under the pointer, among those this layer can pick. */
  private pickItem(clientX: number, clientY: number, filter?: (def: FurnitureDef) => boolean): string | null {
    this.aim(clientX, clientY);
    const roots = this.view.all().filter((e) => e.root.visible && this.pickable(e.def) && (!filter || filter(e.def))).map((e) => e.root);
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      const uid = this.view.uidOf(h.object);
      if (uid) return uid;
    }
    return null;
  }

  private planeHit(y: number): [number, number] | null {
    const hit = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    if (!hit) return null;
    return [hit.x + this.state.w / 2, hit.z + this.state.d / 2];
  }

  /** The wall under the pointer and the point on it: [side, u, v]. */
  private wallHit(): [WallSide, number, number] | null {
    const s = this.state;
    const hw = s.w / 2, hd = s.d / 2;
    const planes: Array<[WallSide, THREE.Plane]> = [
      ["back", new THREE.Plane(new THREE.Vector3(0, 0, 1), hd)],
      ["left", new THREE.Plane(new THREE.Vector3(1, 0, 0), hw)],
      ["right", new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw)],
    ];
    let best: [WallSide, number, number] | null = null;
    let bestT = Infinity;
    for (const [side, plane] of planes) {
      const hit = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) continue;
      const t = hit.distanceTo(this.ray.ray.origin);
      const u = side === "back" ? hit.x + hw : hit.z + hd;
      const v = hit.y;
      const len = wallLength(s, side);
      const margin = 0.6;
      if (u < -margin || u > len + margin || v < -margin || v > WALL_HEIGHT + 1.5) continue;
      // The floor comes first: a ray that reaches the floor before the wall is aiming at the floor.
      if (t < bestT) {
        bestT = t;
        best = [side, u, v];
      }
    }
    return best;
  }

  /**
   * Where `def` would go under the pointer, turned `rot`. `grab` offsets the
   * pointer from the item's centre; `ignore` are items moving with it.
   */
  private target(def: FurnitureDef, rot: Rot, grab: [number, number], ignore: Set<string>, base: Placement): Placement | null {
    const s = this.state;
    if (def.kind === "wall") {
      const hit = this.wallHit();
      if (!hit) return null;
      const [side, u0, v0] = hit;
      const [u, v] = snapWall(s, def, side, u0 + grab[0], v0 + grab[1]);
      return { ...base, layer: "wall", wall: side, u, v, x: 0, z: 0, rot: 0, host: undefined };
    }
    if (def.kind === "misc") {
      // A table top under the pointer takes the item; the nearest along the ray wins.
      let best: { p: Placement; t: number } | null = null;
      for (const host of s.items) {
        if (host.layer !== "floor" || ignore.has(host.uid)) continue;
        const hs = furniture(host.item);
        if (!hs?.surface) continue;
        const pt = this.planeHit(hs.surface.y);
        if (!pt) continue;
        const top = surfaceRect(host, hs)!;
        if (pt[0] < top[0] || pt[0] > top[2] || pt[1] < top[1] || pt[1] > top[3]) continue;
        const spot = surfaceAt({ ...s, items: [host] }, catalog, def, rot, pt[0], pt[1]);
        if (!spot) continue;
        const world = new THREE.Vector3(pt[0] - s.w / 2, hs.surface.y, pt[1] - s.d / 2);
        const t = world.distanceTo(this.ray.ray.origin);
        if (!best || t < best.t) best = { p: { ...base, layer: "surface", host: spot.host, x: spot.x, z: spot.z, rot: spot.rot, wall: undefined }, t };
      }
      if (best) return best.p;
    }
    const y = def.kind === "ceiling" ? WALL_HEIGHT : 0;
    const pt = this.planeHit(y);
    if (!pt) return null;
    const [x, z] = snapFloor(s, def, rot, pt[0] + grab[0], pt[1] + grab[1]);
    const layer: Layer = def.kind === "ceiling" ? "ceiling" : def.kind === "rug" ? "rug" : "floor";
    return { ...base, layer, x, z, rot, wall: undefined, host: undefined };
  }

  // ---------- Pointer ----------

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    this.stage.canvas.setPointerCapture?.(e.pointerId);
    this.lastPointer = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
    if (e.button === 2 || (e.button === 0 && this.mode === "view" && !this.placing)) {
      if (this.mode === "view" && e.button === 0) {
        this.press = { kind: "orbit", x: e.clientX, y: e.clientY, moved: false, button: 0 };
      } else {
        this.press = { kind: "orbit", x: e.clientX, y: e.clientY, moved: false, button: 2 };
      }
      return;
    }
    if (e.button === 1) {
      this.press = { kind: "pan", x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (this.placing) {
      this.dropPlacing(e.shiftKey);
      return;
    }
    const uid = this.pickItem(e.clientX, e.clientY);
    if (uid) {
      if (e.shiftKey) {
        if (this.selection.has(uid)) this.selection.delete(uid);
        else this.selection.add(uid);
      } else if (!this.selection.has(uid)) {
        this.selection.clear();
        this.selection.add(uid);
      }
      this.press = { kind: "item", uid, x: e.clientX, y: e.clientY, shift: e.shiftKey };
      this.refreshOutline();
      this.events.changed();
    } else {
      this.press = { kind: "box", x: e.clientX, y: e.clientY, shift: e.shiftKey };
    }
  }

  private move(e: PointerEvent): void {
    if (!this.enabled) return;
    this.lastPointer = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
    const r = this.stage.canvas.getBoundingClientRect();
    this.stage.rig.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    const p = this.press;
    if (p?.kind === "orbit") {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) > 2) p.moved = true;
      if (e.shiftKey) this.stage.rig.pan(dx, dy);
      else this.stage.rig.orbit(dx, dy);
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    if (p?.kind === "pan") {
      this.stage.rig.pan(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    if (p?.kind === "item" && !this.carry && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_THRESHOLD) {
      this.beginCarry(p.uid, p.x, p.y);
    }
    if (this.carry) {
      this.updateCarry(e.clientX, e.clientY);
      return;
    }
    if (p?.kind === "box") {
      const x0 = Math.min(p.x, e.clientX), y0 = Math.min(p.y, e.clientY);
      const w = Math.abs(e.clientX - p.x), h = Math.abs(e.clientY - p.y);
      if (w + h > MOVE_THRESHOLD) {
        Object.assign(this.boxEl.style, { display: "block", left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${h}px` });
      }
      return;
    }
    if (this.placing) {
      this.updatePlacing(e.clientX, e.clientY);
      return;
    }
    if (e.target !== this.stage.canvas) return;
    // Hover.
    const uid = this.pickItem(e.clientX, e.clientY);
    if (uid !== this.hover) {
      this.hover = uid;
      const def = uid ? furniture(byUid(this.state, uid)?.item ?? "") : undefined;
      this.stage.canvas.style.cursor = !def ? "" : this.mode === "decorate" ? "grab" : def.light || def.switchable ? "pointer" : "";
      this.refreshOutline();
    }
  }

  private up(e: PointerEvent): void {
    if (!this.enabled) return;
    const p = this.press;
    this.press = null;
    if (this.carry) {
      this.dropCarry();
      return;
    }
    if (!p) return;
    if (p.kind === "orbit") {
      if (!p.moved && p.button === 0 && this.mode === "view") this.interact(e.clientX, e.clientY);
      return;
    }
    if (p.kind === "box") {
      this.boxEl.style.display = "none";
      const w = Math.abs(e.clientX - p.x), h = Math.abs(e.clientY - p.y);
      if (w + h <= MOVE_THRESHOLD) {
        if (!p.shift) this.selection.clear();
      } else {
        this.boxSelect(Math.min(p.x, e.clientX), Math.min(p.y, e.clientY), Math.max(p.x, e.clientX), Math.max(p.y, e.clientY), p.shift);
      }
      this.refreshOutline();
      this.events.changed();
    }
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.enabled) return;
    const r = this.stage.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.stage.rig.zoom(Math.exp(e.deltaY * 0.0012), x, y);
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    if (!add) this.selection.clear();
    const r = this.stage.canvas.getBoundingClientRect();
    for (const e of this.view.all()) {
      if (!e.root.visible || !this.pickable(e.def)) continue;
      const p = byUid(this.state, e.uid);
      if (!p || p.layer === "surface") continue;
      const v = e.root.position.clone();
      v.y += 0.3;
      v.project(this.stage.camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) this.selection.add(e.uid);
    }
    if (this.selection.size > 1) this.events.notice({ kind: "selected", count: this.selection.size });
  }

  /** In the view, a click switches a lamp or a television. */
  private interact(clientX: number, clientY: number): void {
    const uid = this.pickItem(clientX, clientY, (d) => !!(d.light || d.switchable));
    if (uid) {
      this.toggle(uid);
      return;
    }
    const at = this.planeHit(0);
    if (at) this.events.floor?.(at[0], at[1]);
  }

  toggle(uid: string): void {
    const p = byUid(this.state, uid);
    const def = p && furniture(p.item);
    if (!p || !def) return;
    const on = !(p.on ?? def.light?.startsOn ?? false);
    const next = { ...this.state, items: this.state.items.map((q) => (q.uid === uid ? { ...q, on } : q)) };
    this.model.replace(next);
  }

  // ---------- Carrying ----------

  private beginCarry(anchor: string, clientX: number, clientY: number): void {
    const s = this.state;
    const a = byUid(s, anchor);
    const def = a && furniture(a.item);
    if (!a || !def) return;
    // Wall and table-top items move alone; floor-type items move as the selection.
    let uids = [anchor];
    if (a.layer !== "wall" && a.layer !== "surface") {
      uids = [...this.selection].filter((uid) => {
        const p = byUid(s, uid);
        return p && p.layer !== "wall" && p.layer !== "surface";
      });
      if (!uids.includes(anchor)) uids.push(anchor);
    }
    this.aim(clientX, clientY);
    let grab: [number, number] = [0, 0];
    if (a.layer === "wall") {
      const hit = this.wallHit();
      if (hit && hit[0] === a.wall) grab = [(a.u ?? 0) - hit[1], (a.v ?? 0) - hit[2]];
    } else if (a.layer !== "surface" && def.kind !== "misc") {
      const pt = this.planeHit(a.layer === "ceiling" ? WALL_HEIGHT : 0);
      if (pt) grab = [a.x - pt[0], a.z - pt[1]];
    }
    const originals = new Map(uids.map((uid) => [uid, byUid(s, uid)!]));
    this.carry = { anchor, uids, originals, grab, candidate: new Map(originals), verdict: { ok: true }, rot: 0 };
    for (const uid of uids) {
      const e = this.view.entry(uid);
      if (e) e.lift = e.def.kind === "wall" ? 0 : e.def.kind === "ceiling" ? -0.1 : 0.14;
    }
    this.stage.canvas.style.cursor = "grabbing";
    this.applyLayerVisibility();
    this.updateCarry(clientX, clientY);
  }

  private updateCarry(clientX: number, clientY: number): void {
    const c = this.carry;
    if (!c) return;
    const s = this.state;
    const a = c.originals.get(c.anchor)!;
    const def = furniture(a.item)!;
    this.aim(clientX, clientY);
    const ignore = new Set(c.uids);
    const rot = a.layer === "surface" ? addRot(a.rot, c.rot) : addRot(a.rot, c.rot);
    // A table-top item keeps its turn in the room as it moves between tops and the floor.
    const roomRot = a.layer === "surface" ? addRot(byUid(s, a.host)?.rot ?? 0, rot) : rot;
    const next = this.target(def, roomRot, c.grab, ignore, a);
    if (!next) return;
    // The rest of the selection keeps its offset from the anchor.
    c.candidate = withAnchor(c.originals, c.anchor, next);
    c.verdict = this.judge(c.candidate, ignore);
    this.preview();
  }

  /** Whether every candidate fits, given that the items in `ignore` are moving. */
  private judge(candidates: Map<string, Placement>, ignore: Set<string>): Verdict {
    return judge(this.state, catalog, candidates, ignore);
  }

  private preview(): void {
    const s = this.state;
    let items = s.items;
    let marks: Array<{ where: "floor" | "ceiling" | WallSide; rect: Rect; y?: number }> = [];
    let ok = true;
    if (this.carry) {
      const c = this.carry;
      items = s.items.map((p) => c.candidate.get(p.uid) ?? p);
      ok = c.verdict.ok;
    }
    if (this.placing?.candidate) {
      items = [...s.items, this.placing.candidate];
      ok = this.placing.verdict.ok;
    }
    const preview: RoomState = { ...s, items };
    const moving = this.carry ? [...this.carry.candidate.values()] : this.placing?.candidate ? [this.placing.candidate] : [];
    marks = moving.map((p) => this.markOf(preview, p)).filter((m): m is NonNullable<typeof m> => !!m);
    this.view.sync(preview);
    this.overlay.mark(marks, ok);
    this.okLook = ok;
    this.refreshOutline();
  }

  private markOf(s: RoomState, p: Placement): { where: "floor" | "ceiling" | WallSide; rect: Rect; y?: number } | null {
    const def = furniture(p.item);
    if (!def) return null;
    if (p.layer === "wall") return { where: p.wall!, rect: wallRect(def, p) };
    const rect = footprint(s, catalog, p);
    if (!rect) return null;
    if (p.layer === "ceiling") return { where: "ceiling", rect };
    if (p.layer === "surface") {
      const host = byUid(s, p.host);
      return { where: "floor", rect, y: (host && furniture(host.item)?.surface?.y) ?? 0 };
    }
    return { where: "floor", rect };
  }

  private dropCarry(): void {
    const c = this.carry;
    if (!c) return;
    this.carry = null;
    for (const uid of c.uids) {
      const e = this.view.entry(uid);
      if (e) e.lift = 0;
    }
    this.overlay.clearMarks();
    this.stage.canvas.style.cursor = "";
    const changed = [...c.candidate].some(([uid, p]) => JSON.stringify(p) !== JSON.stringify(c.originals.get(uid)));
    if (c.verdict.ok && changed) {
      const s = this.state;
      this.model.commit({ ...s, items: s.items.map((p) => c.candidate.get(p.uid) ?? p) });
    } else {
      if (!c.verdict.ok) this.events.notice({ kind: "problem", problem: c.verdict.problem });
      this.view.sync(this.state);
    }
    this.okLook = true;
    this.applyLayerVisibility();
    this.refreshOutline();
  }

  // ---------- Placing from the catalogue or storage ----------

  beginPlacing(def: FurnitureDef, variant: number, fromStorage: number | null = null): void {
    this.cancel();
    if (this.mode !== "decorate") this.setMode("decorate");
    if (def.kind === "ceiling" && this.layer !== "ceiling") this.setLayer("ceiling");
    else if (def.kind !== "ceiling" && this.layer === "ceiling") this.setLayer("all");
    this.selection.clear();
    this.placing = { def, variant, rot: 0, uid: newUid(), fromStorage, candidate: null, verdict: { ok: true } };
    this.applyLayerVisibility();
    this.updatePlacing(this.lastPointer.x, this.lastPointer.y);
    this.events.changed();
  }

  private updatePlacing(clientX: number, clientY: number): void {
    const pl = this.placing;
    if (!pl) return;
    this.aim(clientX, clientY);
    const base: Placement = { uid: pl.uid, item: pl.def.id, variant: pl.variant, layer: "floor", x: 0, z: 0, rot: pl.rot };
    const next = this.target(pl.def, pl.rot, [0, 0], new Set(), base);
    if (!next) return;
    if (next.layer === "wall") next.v = next.v ?? pl.def.hang ?? DEFAULT_HANG;
    pl.candidate = next;
    pl.verdict = check(this.state, catalog, next);
    this.preview();
    const e = this.view.entry(pl.uid);
    if (e) e.lift = pl.def.kind === "wall" ? 0 : 0.14;
  }

  private dropPlacing(again: boolean): void {
    const pl = this.placing;
    if (!pl?.candidate) return;
    if (!pl.verdict.ok) {
      this.events.notice({ kind: "problem", problem: pl.verdict.problem });
      return;
    }
    const s = this.state;
    const placed: Placement = { ...pl.candidate };
    if (pl.def.light?.startsOn === false) placed.on = false;
    const storage = pl.fromStorage === null ? s.storage : s.storage.filter((_, i) => i !== pl.fromStorage);
    this.placing = null;
    const e = this.view.entry(placed.uid);
    if (e) e.lift = 0;
    this.overlay.clearMarks();
    this.model.commit({ ...s, items: [...s.items, placed], storage });
    if (again && (pl.fromStorage === null)) {
      this.beginPlacing(pl.def, pl.variant, null);
      if (this.placing) (this.placing as Placing).rot = pl.rot;
    } else {
      this.selection.clear();
      this.selection.add(placed.uid);
      this.applyLayerVisibility();
      this.refreshOutline();
      this.events.changed();
    }
  }

  /** Stop carrying or placing; whatever was carried goes back. */
  cancel(): void {
    if (this.carry) {
      for (const uid of this.carry.uids) {
        const e = this.view.entry(uid);
        if (e) e.lift = 0;
      }
      this.carry = null;
      this.press = null;
    }
    if (this.placing) this.placing = null;
    this.overlay.clearMarks();
    this.view.sync(this.state);
    this.applyLayerVisibility();
  }

  // ---------- Commands ----------

  /** A quarter turn clockwise, of what is carried, placed or selected. */
  rotate(): void {
    if (this.placing) {
      if (this.placing.def.kind === "wall") return;
      this.placing.rot = addRot(this.placing.rot, 1);
      this.updatePlacing(this.lastPointer.x, this.lastPointer.y);
      return;
    }
    if (this.carry) {
      const a = this.carry.originals.get(this.carry.anchor)!;
      if (a.layer === "wall") return;
      this.carry.rot = (this.carry.rot + 1) % 4;
      // A group turns about the anchor.
      if (this.carry.uids.length > 1) this.carry.originals = turnAbout(catalog, this.carry.originals, this.carry.anchor);
      this.updateCarry(this.lastPointer.x, this.lastPointer.y);
      return;
    }
    if (!this.selection.size) return;
    const s = this.state;
    const next = turnEach(s, catalog, this.selection);
    if (!next.size) return;
    const verdict = this.judge(next, new Set(next.keys()));
    if (!verdict.ok) {
      this.events.notice({ kind: "problem", problem: verdict.problem, rotating: true });
      return;
    }
    this.model.commit({ ...s, items: s.items.map((p) => next.get(p.uid) ?? p) });
  }

  /** Move the selection by half a tile. */
  nudge(dx: number, dz: number): void {
    if (!this.selection.size || this.carry || this.placing) return;
    const s = this.state;
    const next = nudgeEach(s, this.selection, dx, dz);
    const verdict = this.judge(next, new Set(next.keys()));
    if (!verdict.ok) {
      this.events.notice({ kind: "problem", problem: verdict.problem });
      return;
    }
    this.model.commit({ ...s, items: s.items.map((p) => next.get(p.uid) ?? p) });
  }

  /** Put the selection away into storage, with what stands on it. */
  putAway(): void {
    if (!this.selection.size) return;
    const leaving = withDependents(this.state, this.selection);
    const next = store(this.state, this.selection);
    this.selection.clear();
    this.model.commit(next);
    this.events.notice({ kind: "stored", count: leaving.size });
  }

  setVariant(variant: number): void {
    const s = this.state;
    const sel = [...this.selection].map((uid) => byUid(s, uid)).filter((p): p is Placement => !!p);
    if (!sel.length) return;
    this.model.commit({ ...s, items: s.items.map((p) => (this.selection.has(p.uid) ? { ...p, variant: Math.min(variant, (furniture(p.item)?.variants.length ?? 1) - 1) } : p)) });
  }

  /** Every item in the room, on every layer. */
  selectAllEverything(): void {
    this.selection.clear();
    for (const p of this.state.items) if (p.layer !== "surface") this.selection.add(p.uid);
  }

  selectAll(): void {
    this.selection.clear();
    for (const e of this.view.all()) {
      const p = byUid(this.state, e.uid);
      if (p && p.layer !== "surface" && this.pickable(e.def) && e.root.visible) this.selection.add(e.uid);
    }
    this.refreshOutline();
    this.events.changed();
  }

  undo(): void {
    this.cancel();
    this.model.undo();
  }

  redo(): void {
    this.cancel();
    this.model.redo();
  }

  private refreshOutline(): void {
    const sel = [...this.selection];
    if (this.placing) sel.push(this.placing.uid);
    if (this.carry) sel.push(...this.carry.uids);
    this.view.highlight(sel, this.okLook);
    this.events.hover?.(this.hover && !this.carry && !this.placing ? this.hover : null);
  }

  /** Called every frame: objects for the outline may have been rebuilt. */
  frame(): void {
    this.applyLayerVisibility();
    if (this.view.moving) this.refreshOutline();
  }

  // ---------- Keys ----------

  private key(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.code === "KeyY") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && e.code === "KeyA" && this.mode === "decorate") {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (mod) return;
    switch (e.code) {
      case "KeyE":
        this.setMode(this.mode === "view" ? "decorate" : "view");
        break;
      case "KeyR":
        if (this.mode === "decorate") this.rotate();
        break;
      case "Delete":
      case "Backspace":
      case "KeyX":
        if (this.mode === "decorate") this.putAway();
        break;
      case "Escape":
        if (this.placing || this.carry) this.cancel();
        else this.selection.clear();
        this.refreshOutline();
        this.events.changed();
        break;
      case "Tab": {
        if (this.mode !== "decorate") return;
        e.preventDefault();
        this.setLayer(LAYERS[(LAYERS.indexOf(this.layer) + (e.shiftKey ? LAYERS.length - 1 : 1)) % LAYERS.length]!);
        break;
      }
      case "ArrowUp": case "KeyW": if (this.mode === "decorate") { e.preventDefault(); this.nudge(0, -1); } break;
      case "ArrowDown": case "KeyS": if (this.mode === "decorate") { e.preventDefault(); this.nudge(0, 1); } break;
      case "ArrowLeft": case "KeyA": if (this.mode === "decorate") { e.preventDefault(); this.nudge(-1, 0); } break;
      case "ArrowRight": case "KeyD": if (this.mode === "decorate") { e.preventDefault(); this.nudge(1, 0); } break;
      default:
        return;
    }
  }

  /** Room-space centres of the selection, for the UI. */
  selected(): Array<{ placement: Placement; def: FurnitureDef }> {
    return [...this.selection].map((uid) => byUid(this.state, uid)).filter((p): p is Placement => !!p)
      .map((placement) => ({ placement, def: furniture(placement.item)! })).filter((x) => !!x.def);
  }

  centre(p: Placement): [number, number] {
    return centerOf(this.state, p);
  }
}

