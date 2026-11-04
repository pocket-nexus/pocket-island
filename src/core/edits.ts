// What decorating does to a room, the same in the browser's editor (src/editor.ts) and the
// console's (apps/island-3ds/editor.ts): whether pieces moved together fit, a quarter turn of a
// selection, half a tile's nudge, and where a piece stands in the world. Each asks the rules
// (./rules.ts, the island's core) and returns placements; the editors commit them and say why not.
// What the player does to the room by hand outside the editor (./game.ts change) is `handled`.

import type { RoomChange } from "./game.ts";
import { addRot, byUid, centerOf, check, newUid, rotatePoint, snapAxis, snapFloor, snapOnSurface, turned, WALL_HEIGHT, worldRot, type Catalog } from "./rules.ts";
import type { Placement, RoomState, Verdict } from "./types.ts";

/** Whether every candidate fits, the items in `ignore` moving with them (they never block each other). */
export function judge(state: RoomState, catalog: Catalog, candidates: Map<string, Placement>, ignore: ReadonlySet<string>): Verdict {
  const moved = { ...state, items: state.items.map((p) => candidates.get(p.uid) ?? p) };
  for (const p of candidates.values()) {
    const others = new Set([...ignore].filter((u) => u !== p.uid));
    const v = check({ ...moved, items: moved.items.filter((q) => !others.has(q.uid) || q.uid === p.host) }, catalog, p);
    if (!v.ok) return v;
  }
  return { ok: true };
}

/** The rest of a carried selection, keeping its offset from the anchor now at `next` (not on a wall or a table top). */
export function withAnchor(originals: ReadonlyMap<string, Placement>, anchor: string, next: Placement): Map<string, Placement> {
  const out = new Map([[anchor, next]]);
  if (originals.size < 2 || next.layer === "wall" || next.layer === "surface") return out;
  const a = originals.get(anchor)!;
  const dx = next.x - a.x, dz = next.z - a.z;
  for (const [uid, o] of originals) if (uid !== anchor) out.set(uid, { ...o, x: o.x + dx, z: o.z + dz });
  return out;
}

/** A quarter turn clockwise of each of `uids` where it stands (wall items do not turn): on a table, kept on its top. */
export function turnEach(state: RoomState, catalog: Catalog, uids: Iterable<string>): Map<string, Placement> {
  const next = new Map<string, Placement>();
  for (const uid of uids) {
    const p = byUid(state, uid);
    const spec = p && catalog(p.item);
    if (!p || !spec || p.layer === "wall") continue;
    const rot = addRot(p.rot, 1);
    const hostSpec = p.layer === "surface" ? catalog(byUid(state, p.host)?.item ?? "") : undefined;
    const [x, z] = hostSpec ? snapOnSurface(spec, hostSpec, rot, p.x, p.z) : snapFloor(state, spec, rot, p.x, p.z);
    next.set(uid, { ...p, rot, x, z });
  }
  return next;
}

/** A carried group turned a quarter about its anchor: each keeps its place relative to it, on the grid. */
export function turnAbout(catalog: Catalog, originals: ReadonlyMap<string, Placement>, anchor: string): Map<string, Placement> {
  const a = originals.get(anchor)!;
  const out = new Map<string, Placement>();
  for (const [uid, o] of originals) {
    if (uid === anchor) { out.set(uid, o); continue; }
    const rot = addRot(o.rot, 1);
    const [w, d] = turned(catalog(o.item)!, rot);
    const [dx, dz] = rotatePoint(o.x - a.x, o.z - a.z, 1);
    out.set(uid, { ...o, rot, x: snapAxis(a.x + dx, w), z: snapAxis(a.z + dz, d) });
  }
  return out;
}

/** Each of `uids` moved half a tile by (dx, dz) as seen from the front: a wall item along its wall, a table's along its top. */
export function nudgeEach(state: RoomState, uids: Iterable<string>, dx: number, dz: number): Map<string, Placement> {
  const next = new Map<string, Placement>();
  for (const uid of uids) {
    const p = byUid(state, uid);
    if (!p) continue;
    // Seen from the front, the left wall's back end is on the right and the right wall's on the left.
    if (p.layer === "wall") next.set(uid, { ...p, u: (p.u ?? 0) + (p.wall === "left" ? -dx : dx) * 0.5, v: (p.v ?? 0) - dz * 0.5 });
    else if (p.layer === "surface") {
      const host = byUid(state, p.host)!;
      const [lx, lz] = rotatePoint(dx * 0.5, dz * 0.5, addRot(0, -host.rot));
      next.set(uid, { ...p, x: p.x + lx, z: p.z + lz });
    } else next.set(uid, { ...p, x: p.x + dx * 0.5, z: p.z + dz * 0.5 });
  }
  return next;
}

/** Where a piece stands in the world (the room's middle at the origin) and which way it faces: x, y, z, yaw. */
export function placeOf(state: RoomState, catalog: Catalog, p: Placement): [number, number, number, number] {
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
    y = (host && catalog(host.item)?.surface?.y) ?? 0;
  }
  return [x - hw, y, z - hd, (-worldRot(state, p) * Math.PI) / 2];
}

/**
 * `state` (the room the core holds, ./game.ts room) with what the player did to it by hand: a piece
 * moved or turned (what stands on it goes with it), taken into the pockets (the core takes what stands
 * on a table first), or `piece` (its id and look, a lamp as it starts) put down from them.
 */
export function handled(state: RoomState, change: RoomChange, piece?: { item: string; variant: number; on?: boolean }): RoomState {
  if (change.kind === "moved") {
    const p = state.items[change.index];
    if (!p) return state;
    return { ...state, items: state.items.map((q, i) => (i === change.index ? { ...q, x: change.x, z: change.z, rot: change.rot } : q)) };
  }
  if (change.kind === "taken") {
    const p = state.items[change.index];
    if (!p) return state;
    return { ...state, items: state.items.filter((q) => q !== p && q.host !== p.uid) };
  }
  if (!piece) return state;
  const host = change.host >= 0 ? state.items[change.host]?.uid : undefined;
  const placed: Placement = {
    uid: newUid(), item: piece.item, variant: piece.variant, layer: change.layer, x: change.x, z: change.z, rot: change.rot,
    ...(change.wall ? { wall: change.wall, u: change.u, v: change.v } : {}),
    ...(host ? { host } : {}),
    ...(piece.on !== undefined ? { on: piece.on } : {}),
  };
  return { ...state, items: [...state.items, placed] };
}
