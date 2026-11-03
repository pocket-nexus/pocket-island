// A showroom: every item of a series set out in one large room through the
// same rules a visitor's room follows. Floor pieces go in rows with a gap,
// small things go on the tops, wall items along the walls, ceiling items
// over the middle and rugs in the front rows.

import { check, newUid, snapAxis } from "./core/rules.ts";
import type { Placement, RoomState, WallSide } from "./core/types.ts";
import { FURNITURE, catalog } from "./furniture/catalog.ts";
import type { FurnitureDef, SeriesId } from "./furniture/types.ts";

export function showroom(series: SeriesId | "all", variant = 0): RoomState {
  const defs = FURNITURE.filter((d) => !d.hidden && (series === "all" || d.series === series));
  const floorDefs = defs.filter((d) => d.kind === "floor").sort((a, b) => b.size[1] - a.size[1] || b.size[0] - a.size[0]);
  const miscDefs = defs.filter((d) => d.kind === "misc");
  const rugs = defs.filter((d) => d.kind === "rug");
  const walls = defs.filter((d) => d.kind === "wall");
  const ceilings = defs.filter((d) => d.kind === "ceiling");
  const area = defs.reduce((a, d) => a + (d.kind === "floor" || d.kind === "misc" ? (d.size[0] + 0.5) * (d.size[1] + 0.5) : 0), 0);
  const w = series === "all" ? 14 : 10;
  const d = Math.max(6, Math.min(16, Math.ceil((area * 1.6) / w / 2) * 2 + (rugs.length ? 3 : 0)));
  const room: RoomState = { w, d, wallpaper: "white-plaster", flooring: "white-planks", items: [], storage: [] };
  const v = (def: FurnitureDef) => Math.min(variant, def.variants.length - 1);
  const put = (p: Placement): boolean => {
    const ok = check(room, catalog, p).ok;
    if (ok) room.items.push(p);
    return ok;
  };

  // Floor pieces, row by row from the back wall.
  let x = 0.5, z = 0.5, rowDepth = 0;
  const hosts: Placement[] = [];
  const placeFloor = (def: FurnitureDef) => {
    const [fw, fd] = def.size;
    for (let tries = 0; tries < 200; tries++) {
      if (x + fw > w - 0.5) {
        x = 0.5;
        z += rowDepth + 0.5;
        rowDepth = 0;
      }
      if (z + fd > d) return null;
      const p: Placement = { uid: newUid(), item: def.id, variant: v(def), layer: "floor", x: snapAxis(x + fw / 2, fw), z: snapAxis(z + fd / 2, fd), rot: 0 };
      x += fw + 0.5;
      if (put(p)) {
        rowDepth = Math.max(rowDepth, fd);
        return p;
      }
    }
    return null;
  };
  for (const def of floorDefs) {
    const p = placeFloor(def);
    if (p && def.surface) hosts.push(p);
  }
  // Small things on the tops first, then on the floor.
  for (const def of miscDefs) {
    let placed = false;
    for (const host of hosts) {
      const hs = catalog(host.item)!;
      const [x0, z0, x1, z1] = hs.surface!.rect;
      const [mw, md] = def.size;
      for (let lx = x0 + mw / 2; lx <= x1 - mw / 2 + 1e-6 && !placed; lx += 0.5) {
        for (let lz = z0 + md / 2; lz <= z1 - md / 2 + 1e-6 && !placed; lz += 0.5) {
          placed = put({ uid: newUid(), item: def.id, variant: v(def), layer: "surface", host: host.uid, x: lx, z: lz, rot: 0 });
        }
      }
      if (placed) break;
    }
    if (!placed) placeFloor(def);
  }
  // Rugs in the rows that are left.
  x = 0.5;
  z += rowDepth + 0.5;
  rowDepth = 0;
  for (const def of rugs) {
    const [fw, fd] = def.size;
    if (x + fw > w) { x = 0.5; z += rowDepth + 0.5; rowDepth = 0; }
    if (z + fd > d) break;
    if (put({ uid: newUid(), item: def.id, variant: v(def), layer: "rug", x: snapAxis(x + fw / 2, fw), z: snapAxis(z + fd / 2, fd), rot: 0 })) rowDepth = Math.max(rowDepth, fd);
    x += fw + 0.5;
  }
  // Wall items along the back wall, then the side walls.
  const order: WallSide[] = ["back", "left", "right"];
  let side = 0, u = 0.5;
  for (const def of walls) {
    const [ww, wh] = def.size;
    for (let tries = 0; tries < 3; tries++) {
      const len = order[side] === "back" ? w : d;
      if (u + ww > len - 0.25) { side++; u = 0.5; }
      if (side >= order.length) break;
      const vv = snapAxis(def.hang ?? 1.75, wh);
      const ok = put({ uid: newUid(), item: def.id, variant: v(def), layer: "wall", wall: order[side], u: snapAxis(u + ww / 2, ww), v: vv, x: 0, z: 0, rot: 0 });
      u += ww + 0.5;
      if (ok) break;
    }
  }
  // Ceiling items in a row across the middle.
  let cx = 1;
  for (const def of ceilings) {
    const [cw, cd] = def.size;
    put({ uid: newUid(), item: def.id, variant: v(def), layer: "ceiling", x: snapAxis(cx + cw / 2, cw), z: snapAxis(d / 2, cd), rot: 0 });
    cx += cw + 1;
  }
  return room;
}
