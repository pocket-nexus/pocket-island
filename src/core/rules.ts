// Placement rules, after Animal Crossing: New Horizons' interior editor:
//
// - The floor is a grid of tiles. Items have a footprint of whole or half
//   tiles and may stand on half-tile positions. They turn in quarter turns,
//   which swaps the footprint's width and depth.
// - Housewares and miscellaneous items on the floor never overlap.
// - Rugs lie on a layer of their own: furniture stands on them, but two rugs
//   never overlap.
// - Miscellaneous items may also stand on a table's top. Each table holds
//   what fits inside its surface; what stands on it moves, turns and is put
//   away with it.
// - Walls have a grid like the floor's. Wall items never overlap on the same
//   wall, and do not collide with the floor's furniture.
// - The ceiling has a grid of its own for hanging items.
// - The tile in front of the entrance stays clear.
// - A room holds at most 150 items, wall and ceiling items included.
//
// Whether a placement may stand where it says (`check`), where a misc item lands on a table
// (`surfaceAt`) and where anything lands on its grid (`snapFloor`, `snapWall`, `snapOnSurface`) are
// decided by the island's core (crates/island-core/src/room.rs); this module hands it the room and
// keeps the geometry the interface draws with. The room's sizes below are the core's
// (`room::WALL_HEIGHT`, `ITEM_LIMIT`, `door_rect`), checked against it by test/core-mirror.test.ts.

import { core } from "./abi.ts";
import { furnitureCode } from "../furniture/codes.ts";
import type { ItemSpec, Placement, Problem, ProblemReason, Rect, RoomState, Rot, Stored, Verdict, WallSide } from "./types.ts";

export const WALL_HEIGHT = 3;
export const ITEM_LIMIT = 150;
/** Where a wall item's middle hangs when its definition does not say (every one in the catalogue does). */
export const DEFAULT_HANG = 1.5;

export const ROOM_SIZES = [
  { id: "tent", name: "Tent", w: 4, d: 4 },
  { id: "cottage", name: "Cottage", w: 6, d: 6 },
  { id: "main", name: "Main room", w: 8, d: 8 },
  { id: "upstairs", name: "Upstairs", w: 10, d: 6 },
] as const;

export type Catalog = (id: string) => ItemSpec | undefined;

/** Width and depth after `rot` quarter turns. */
export function turned(spec: ItemSpec, rot: Rot): [number, number] {
  const [w, d] = spec.size;
  return rot % 2 === 0 ? [w, d] : [d, w];
}

export function addRot(a: number, b: number): Rot {
  return ((((a + b) % 4) + 4) % 4) as Rot;
}

/** A centre with the item's near edge on a half tile counted from `origin`, unbounded (the core's grid). */
export function snapAxis(center: number, extent: number, origin = 0): number {
  return core().pi_rules_snap_axis(center, extent, origin);
}

/** A centre that follows (x, z) for something `w` × `d`, kept inside `rect` on the half tiles from its corner (the core's grid). */
export function snapIn(w: number, d: number, x: number, z: number, rect: Rect): [number, number] {
  const c = core();
  c.pi_rules_snap(w, d, x, z, rect[0], rect[1], rect[2], rect[3]);
  return [c.out[0]!, c.out[1]!];
}

export function rectAt(x: number, z: number, w: number, d: number): Rect {
  return [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
}

/** A point in an item's unrotated frame, carried into the frame it is turned into. */
export function rotatePoint(x: number, z: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [x, z];
    case 1: return [-z, x];
    case 2: return [-x, -z];
    case 3: return [z, -x];
  }
}

export function rotateRect(r: Rect, rot: Rot): Rect {
  const [ax, az] = rotatePoint(r[0], r[1], rot);
  const [bx, bz] = rotatePoint(r[2], r[3], rot);
  return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
}

/** The entrance is in the front wall's middle; the tile inside it stays clear. */
export function doorRect(state: Pick<RoomState, "w" | "d">): Rect {
  return [state.w / 2 - 0.5, state.d - 1, state.w / 2 + 0.5, state.d];
}

export function wallLength(state: Pick<RoomState, "w" | "d">, side: WallSide): number {
  return side === "back" ? state.w : state.d;
}

export function byUid(state: RoomState, uid: string | undefined): Placement | undefined {
  return uid ? state.items.find((p) => p.uid === uid) : undefined;
}

/** A host's surface in room tiles. */
export function surfaceRect(host: Placement, spec: ItemSpec): Rect | null {
  if (!spec.surface || host.layer !== "floor") return null;
  const r = rotateRect(spec.surface.rect, host.rot);
  return [r[0] + host.x, r[1] + host.z, r[2] + host.x, r[3] + host.z];
}

/** A wall item's rectangle on its wall: [u0, v0, u1, v1]. */
export function wallRect(spec: ItemSpec, p: Placement): Rect {
  const [w, h] = spec.size;
  return rectAt(p.u ?? 0, p.v ?? 0, w, h);
}

// ---------------------------------------------------------------- the rules, in the island's core

// The core (crates/island-core/src/room.rs) holds one room: its catalogue's specs by number and its
// items by index. A state is handed over the first time a rule is asked of it, and again when its
// items have been added to in place (a preset being laid out).

/** The core's numbers for a spec's kind, a layer, a wall and a reason (room::Kind, Layer, Side, Reason). */
export const KIND = { floor: 0, misc: 1, wall: 2, ceiling: 3, rug: 4 } as const;
export const LAYER = { floor: 0, rug: 1, wall: 2, ceiling: 3, surface: 4 } as const;
export const WALL = { back: 0, left: 1, right: 2 } as const;
export const REASONS: ProblemReason[] = [
  "unknown", "unknown", "wrong-layer", "limit", "no-wall", "off-wall", "wall-overlap", "no-surface", "off-surface",
  "surface-overlap", "off-room", "door", "rug-overlap", "overlap",
];
const CODE: Record<ProblemReason, Problem["code"]> = {
  unknown: "kind", "wrong-layer": "kind", limit: "limit", "no-wall": "kind", "off-wall": "out", "wall-overlap": "overlap",
  "no-surface": "surface", "off-surface": "surface", "surface-overlap": "overlap", "off-room": "out", door: "door",
  "rug-overlap": "overlap", overlap: "overlap",
};

let heldCatalog: Catalog | null = null;
let specIds = new Map<string, number>();
let heldState: RoomState | null = null;
let heldItems: Placement[] | null = null;
let heldCount = -1;
let heldIndex = new Map<string, number>();

/**
 * The core's number for a catalogue item (handed over on first sight, with the number the pockets
 * keep it by, src/furniture/codes.ts), or -1: what `game.put` is told a piece in the pockets is.
 */
export function specIndex(catalog: Catalog, id: string): number {
  if (heldCatalog !== catalog) {
    heldCatalog = catalog;
    specIds = new Map();
    heldState = null;
  }
  let n = specIds.get(id);
  if (n !== undefined) return n;
  const spec = catalog(id);
  if (!spec) return -1;
  n = specIds.size;
  const s = spec.surface;
  core().pi_room_spec(n, furnitureCode(id), KIND[spec.kind], spec.size[0], spec.size[1], s ? 1 : 0, s?.rect[0] ?? 0, s?.rect[1] ?? 0, s?.rect[2] ?? 0, s?.rect[3] ?? 0, s?.y ?? 0, spec.hang ?? 0);
  specIds.set(id, n);
  return n;
}

function encode(catalog: Catalog, p: Placement, host: number) {
  return [specIndex(catalog, p.item), LAYER[p.layer], p.x, p.z, p.rot, p.wall ? WALL[p.wall] : 255, p.u ?? 0, p.v ?? 0, host] as const;
}

/** Hand `state` to the core, unless it holds it already. */
export function holdRoom(state: RoomState, catalog: Catalog): Map<string, number> {
  specIndex(catalog, "");
  if (heldState === state && heldItems === state.items && heldCount === state.items.length) return heldIndex;
  const c = core();
  c.pi_room_reset(state.w, state.d);
  const index = new Map<string, number>();
  state.items.forEach((p, i) => index.set(p.uid, i));
  for (const p of state.items) {
    const host = p.host !== undefined ? index.get(p.host) ?? -1 : -1;
    const [item, layer, x, z, rot, wall, u, v, h] = encode(catalog, p, host);
    c.pi_room_add(item < 0 ? 0xffff : item, p.variant, layer, x, z, rot, wall, u, v, h);
  }
  heldState = state;
  heldItems = state.items;
  heldCount = state.items.length;
  heldIndex = index;
  return index;
}

/** Rotation an item shows in the room: a surface item turns with its host. */
export function worldRot(state: RoomState, p: Placement): Rot {
  if (p.layer !== "surface") return p.rot;
  const host = byUid(state, p.host);
  return host ? addRot(host.rot, p.rot) : p.rot;
}

/** Centre in room tiles of anything but a wall item. */
export function centerOf(state: RoomState, p: Placement): [number, number] {
  if (p.layer !== "surface") return [p.x, p.z];
  const host = byUid(state, p.host);
  if (!host) return [p.x, p.z];
  const [dx, dz] = rotatePoint(p.x, p.z, host.rot);
  return [host.x + dx, host.z + dz];
}

/** Footprint in room tiles. Wall items have none on the floor. */
export function footprint(state: RoomState, catalog: Catalog, p: Placement): Rect | null {
  const spec = catalog(p.item);
  if (!spec || p.layer === "wall") return null;
  const [w, d] = turned(spec, worldRot(state, p));
  const [x, z] = centerOf(state, p);
  return rectAt(x, z, w, d);
}

function problem(reason: ProblemReason, withUid?: string): Verdict {
  return { ok: false, problem: { code: CODE[reason], reason, ...(withUid !== undefined ? { with: withUid } : {}) } as Problem };
}

/**
 * Whether `p` may stand where it says. It may already be in the room (a move) or not (a new item).
 * Items in `ignore` are treated as absent: the others moved together with it.
 */
export function check(state: RoomState, catalog: Catalog, p: Placement, ignore: ReadonlySet<string> = new Set()): Verdict {
  const index = holdRoom(state, catalog);
  const c = core();
  c.pi_room_clear_ignored();
  for (const uid of ignore) {
    const i = index.get(uid);
    if (i !== undefined) c.pi_room_ignore(i, 1);
  }
  const self = index.get(p.uid) ?? -1;
  const host = p.host !== undefined ? index.get(p.host) ?? -1 : -1;
  const [item, layer, x, z, rot, wall, u, v, h] = encode(catalog, p, host);
  const code = c.pi_rules_check(self, item, layer, x, z, rot, wall, u, v, h);
  if (code === 0) return { ok: true };
  const reason = REASONS[code] ?? "unknown";
  const other = c.out[0]!;
  return problem(reason, CODE[reason] === "overlap" && other >= 0 ? state.items[other]?.uid : undefined);
}

/** Snap a floor, rug or ceiling item whose centre follows (x, z) and keep it inside the room. */
export function snapFloor(state: Pick<RoomState, "w" | "d">, spec: ItemSpec, rot: Rot, x: number, z: number): [number, number] {
  const [w, d] = turned(spec, rot);
  return snapIn(w, d, x, z, [0, 0, state.w, state.d]);
}

/** Snap a wall item whose centre follows (u, v) on `side`. */
export function snapWall(state: Pick<RoomState, "w" | "d">, spec: ItemSpec, side: WallSide, u: number, v: number): [number, number] {
  const [w, h] = spec.size;
  return snapIn(w, h, u, v, [0, 0, wallLength(state, side), WALL_HEIGHT]);
}

/** Snap a misc item turned `rot` on its host's top, in the host's frame: kept on the top, on its grid. */
export function snapOnSurface(spec: ItemSpec, hostSpec: ItemSpec, rot: Rot, x: number, z: number): [number, number] {
  const [w, d] = turned(spec, rot);
  return hostSpec.surface ? snapIn(w, d, x, z, hostSpec.surface.rect) : [x, z];
}

/**
 * Where a misc item would stand on a table under the room point (x, z): the host and the centre and
 * turn in the host's frame. The top that holds the point wins; null when there is none.
 */
export function surfaceAt(
  state: RoomState, catalog: Catalog, spec: ItemSpec, rot: Rot, x: number, z: number, ignore: ReadonlySet<string> = new Set(),
): { host: string; x: number; z: number; rot: Rot } | null {
  const index = holdRoom(state, catalog);
  const c = core();
  c.pi_room_clear_ignored();
  for (const uid of ignore) {
    const i = index.get(uid);
    if (i !== undefined) c.pi_room_ignore(i, 1);
  }
  const host = c.pi_rules_surface_at(specIndex(catalog, spec.id), rot, x, z);
  if (host < 0) return null;
  return { host: state.items[host]!.uid, x: c.out[0]!, z: c.out[1]!, rot: c.out[2]! as Rot };
}

/** Everything that leaves with `uids`: the items and whatever stands on them. */
export function withDependents(state: RoomState, uids: Iterable<string>): Set<string> {
  const out = new Set(uids);
  for (const p of state.items) if (p.layer === "surface" && p.host && out.has(p.host)) out.add(p.uid);
  return out;
}

/** Put items away: they leave the room, with what stands on them, into storage. */
export function store(state: RoomState, uids: Iterable<string>): RoomState {
  const leaving = withDependents(state, uids);
  const stored: Stored[] = state.items.filter((p) => leaving.has(p.uid)).map((p) => ({ item: p.item, variant: p.variant }));
  return { ...state, items: state.items.filter((p) => !leaving.has(p.uid)), storage: [...stored, ...state.storage] };
}

/**
 * Change the room's size. The layout keeps its place relative to the middle
 * of the back wall; what no longer fits goes to storage.
 */
export function resize(state: RoomState, catalog: Catalog, w: number, d: number): RoomState {
  const shift = (w - state.w) / 2;
  const moved: Placement[] = state.items.map((p) => {
    if (p.layer === "floor" || p.layer === "rug" || p.layer === "ceiling") return { ...p, x: p.x + shift };
    if (p.layer === "wall" && p.wall === "back") return { ...p, u: (p.u ?? 0) + shift };
    return { ...p };
  });
  const next: RoomState = { ...state, w, d, items: moved };
  const misfits = moved.filter((p) => p.layer !== "surface" && !check({ ...next, items: moved }, catalog, p).ok).map((p) => p.uid);
  return misfits.length ? store(next, misfits) : next;
}

let counter = 0;
export function newUid(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
