import { describe, expect, test } from "bun:test";
import {
  check, doorRect, resize, snapFloor, snapWall, store, surfaceAt, turned, footprint, centerOf, worldRot, ITEM_LIMIT, WALL_HEIGHT,
} from "../src/core/rules.ts";
import type { ItemSpec, Placement, RoomState } from "../src/core/types.ts";
import { RoomModel } from "../src/core/model.ts";

const specs: Record<string, ItemSpec> = {
  bed: { id: "bed", kind: "floor", size: [2, 2] },
  wardrobe: { id: "wardrobe", kind: "floor", size: [2, 1] },
  desk: { id: "desk", kind: "floor", size: [2, 1], surface: { rect: [-1, -0.5, 1, 0.5], y: 0.75 } },
  lamp: { id: "lamp", kind: "misc", size: [1, 1] },
  book: { id: "book", kind: "misc", size: [1, 0.5] },
  rug: { id: "rug", kind: "rug", size: [3, 2] },
  clock: { id: "clock", kind: "wall", size: [1, 1], hang: 2 },
  window: { id: "window", kind: "wall", size: [2, 1.5], hang: 1.75 },
  pendant: { id: "pendant", kind: "ceiling", size: [1, 1] },
};
const catalog = (id: string) => specs[id];

let n = 0;
function item(partial: Partial<Placement> & Pick<Placement, "item" | "layer">): Placement {
  return { uid: `u${++n}`, variant: 0, x: 0, z: 0, rot: 0, ...partial };
}

function room(items: Placement[] = [], w = 6, d = 6): RoomState {
  return { w, d, wallpaper: "plain", flooring: "wood", items, storage: [] };
}

describe("floor grid", () => {
  test("a quarter turn swaps width and depth", () => {
    expect(turned(specs.wardrobe!, 0)).toEqual([2, 1]);
    expect(turned(specs.wardrobe!, 1)).toEqual([1, 2]);
  });

  test("centres snap so edges land on half tiles, and stay inside the room", () => {
    // 2×1 wardrobe: x edges on halves, centre on halves; depth 1 likewise.
    expect(snapFloor(room(), specs.wardrobe!, 0, 2.3, 0.2)).toEqual([2.5, 0.5]);
    // 1×0.5 book: centre on a quarter so its edges sit on halves.
    expect(snapFloor(room(), specs.book!, 0, 3.1, 3.1)).toEqual([3, 3.25]);
    // Pushed past the wall, it stops against it.
    expect(snapFloor(room(), specs.bed!, 0, -3, 99)).toEqual([1, 5]);
  });

  test("furniture may stand on half tiles but never overlaps", () => {
    const bed = item({ item: "bed", layer: "floor", x: 1, z: 1 });
    const s = room([bed]);
    expect(check(s, catalog, item({ item: "wardrobe", layer: "floor", x: 3, z: 0.5 })).ok).toBe(true);
    expect(check(s, catalog, item({ item: "wardrobe", layer: "floor", x: 2.5, z: 0.5 })).ok).toBe(false);
    // Edge to edge is allowed.
    expect(check(s, catalog, item({ item: "lamp", layer: "floor", x: 2.5, z: 1.5 })).ok).toBe(true);
  });

  test("turning checks the turned footprint", () => {
    const s = room([item({ item: "bed", layer: "floor", x: 1, z: 1 })]);
    const w = item({ item: "wardrobe", layer: "floor", x: 2.5, z: 1, rot: 1 });
    expect(check(s, catalog, w).ok).toBe(true);
    expect(check(s, catalog, { ...w, rot: 0 }).ok).toBe(false);
  });

  test("the entrance tile stays clear for furniture but not for rugs", () => {
    const s = room();
    expect(doorRect(s)).toEqual([2.5, 5, 3.5, 6]);
    const verdict = check(s, catalog, item({ item: "lamp", layer: "floor", x: 3, z: 5.5 }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problem.code).toBe("door");
    expect(check(s, catalog, item({ item: "rug", layer: "rug", x: 3, z: 5 })).ok).toBe(true);
  });

  test("nothing stands outside the room", () => {
    const verdict = check(room(), catalog, item({ item: "bed", layer: "floor", x: 5.5, z: 1 }));
    expect(verdict.ok).toBe(false);
  });
});

describe("rugs", () => {
  test("furniture stands on rugs, rugs never overlap each other", () => {
    const rug = item({ item: "rug", layer: "rug", x: 3, z: 3 });
    const s = room([rug]);
    expect(check(s, catalog, item({ item: "bed", layer: "floor", x: 3, z: 3 })).ok).toBe(true);
    expect(check(s, catalog, item({ item: "rug", layer: "rug", x: 4, z: 3.5 })).ok).toBe(false);
    expect(check(s, catalog, item({ item: "rug", layer: "rug", x: 3, z: 1 })).ok).toBe(true);
  });
});

describe("table tops", () => {
  const desk = item({ item: "desk", layer: "floor", x: 3, z: 0.5, rot: 0 });

  test("a misc item over a desk lands on its top, snapped to half tiles", () => {
    const s = room([desk]);
    const spot = surfaceAt(s, catalog, specs.lamp!, 0, 2.2, 0.4);
    expect(spot).toEqual({ host: desk.uid, x: -0.5, z: 0, rot: 0 });
    const lamp = item({ item: "lamp", layer: "surface", host: desk.uid, x: spot!.x, z: spot!.z });
    expect(check(s, catalog, lamp).ok).toBe(true);
    // Two fit side by side, a third does not.
    const s2 = room([desk, lamp]);
    expect(check(s2, catalog, item({ item: "lamp", layer: "surface", host: desk.uid, x: 0.5, z: 0 })).ok).toBe(true);
    expect(check(s2, catalog, item({ item: "lamp", layer: "surface", host: desk.uid, x: 0, z: 0 })).ok).toBe(false);
  });

  test("housewares never go on a table", () => {
    const s = room([desk]);
    expect(surfaceAt(s, catalog, specs.wardrobe!, 0, 3, 0.5)).toBeNull();
    expect(check(s, catalog, item({ item: "wardrobe", layer: "surface", host: desk.uid })).ok).toBe(false);
  });

  test("what stands on a table turns and moves with it", () => {
    const lamp = item({ item: "lamp", layer: "surface", host: desk.uid, x: -0.5, z: 0 });
    const turnedDesk = { ...desk, x: 2.5, z: 1, rot: 1 as const };
    const s = room([turnedDesk, lamp]);
    // Turned a quarter clockwise, the desk's left half now lies toward the back.
    expect(centerOf(s, lamp)).toEqual([2.5, 0.5]);
    expect(worldRot(s, lamp)).toBe(1);
    expect(footprint(s, catalog, lamp)).toEqual([2, 0, 3, 1]);
  });

  test("a turned desk still takes items in its own frame", () => {
    const turnedDesk = { ...desk, x: 0.5, z: 3, rot: 1 as const };
    const s = room([turnedDesk]);
    const spot = surfaceAt(s, catalog, specs.book!, 1, 0.5, 3.6);
    expect(spot).not.toBeNull();
    expect(spot!.rot).toBe(0);
    const book = item({ item: "book", layer: "surface", host: turnedDesk.uid, x: spot!.x, z: spot!.z, rot: spot!.rot });
    expect(check(s, catalog, book).ok).toBe(true);
  });

  test("putting a table away takes what stands on it", () => {
    const lamp = item({ item: "lamp", layer: "surface", host: desk.uid, x: -0.5, z: 0 });
    const s = store(room([desk, lamp]), [desk.uid]);
    expect(s.items).toHaveLength(0);
    expect(s.storage.map((x) => x.item).sort()).toEqual(["desk", "lamp"]);
  });
});

describe("walls and ceiling", () => {
  test("wall items snap on the wall's grid and never overlap on the same wall", () => {
    const s0 = room();
    expect(snapWall(s0, specs.window!, "back", 0.2, 9)).toEqual([1, WALL_HEIGHT - 0.75]);
    const win = item({ item: "window", layer: "wall", wall: "back", u: 2, v: 1.75 });
    const s = room([win]);
    expect(check(s, catalog, item({ item: "clock", layer: "wall", wall: "back", u: 2.5, v: 2 })).ok).toBe(false);
    expect(check(s, catalog, item({ item: "clock", layer: "wall", wall: "left", u: 2.5, v: 2 })).ok).toBe(true);
    expect(check(s, catalog, item({ item: "clock", layer: "wall", wall: "back", u: 3.5, v: 2 })).ok).toBe(true);
  });

  test("wall items ignore the furniture below them", () => {
    const s = room([item({ item: "wardrobe", layer: "floor", x: 2, z: 0.5 })]);
    expect(check(s, catalog, item({ item: "clock", layer: "wall", wall: "back", u: 2, v: 1 })).ok).toBe(true);
  });

  test("ceiling items share a grid of their own", () => {
    const s = room([item({ item: "bed", layer: "floor", x: 3, z: 3 }), item({ item: "pendant", layer: "ceiling", x: 3, z: 3 })]);
    expect(check(s, catalog, item({ item: "pendant", layer: "ceiling", x: 3.5, z: 3 })).ok).toBe(false);
    expect(check(s, catalog, item({ item: "pendant", layer: "ceiling", x: 4, z: 3 })).ok).toBe(true);
  });
});

describe("room", () => {
  test(`holds at most ${ITEM_LIMIT} items`, () => {
    const many = Array.from({ length: ITEM_LIMIT }, () => item({ item: "clock", layer: "wall", wall: "back", u: 99, v: 99 }));
    const verdict = check(room(many), catalog, item({ item: "lamp", layer: "floor", x: 0.5, z: 0.5 }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problem.code).toBe("limit");
  });

  test("shrinking keeps the layout centred and stores what no longer fits", () => {
    const keep = item({ item: "bed", layer: "floor", x: 4, z: 1 });
    const lost = item({ item: "wardrobe", layer: "floor", x: 7, z: 0.5 });
    const top = item({ item: "lamp", layer: "surface", host: lost.uid, x: 0, z: 0 });
    const s = resize(room([keep, lost, top], 8, 8), catalog, 6, 6);
    expect(s.items.map((p) => p.uid)).toEqual([keep.uid]);
    expect(s.items[0]!.x).toBe(3);
    expect(s.storage.map((x) => x.item).sort()).toEqual(["lamp", "wardrobe"]);
  });

  test("history undoes and redoes whole states", () => {
    const model = new RoomModel(room());
    model.commit({ ...model.state, wallpaper: "stripe" });
    model.commit({ ...model.state, flooring: "tile" });
    expect(model.undo()).toBe(true);
    expect(model.state.flooring).toBe("wood");
    expect(model.redo()).toBe(true);
    expect(model.state.flooring).toBe("tile");
  });
});
