// Wooden series: chunky pine furniture with rounded edges, after the island's
// wooden series. Every piece comes in the same four woods.

import type * as THREE from "three";
import { K, M, blockLegs, book, bulb, cushion, drawer, knob, shade } from "./common.ts";
import type { FurnitureDef } from "./types.ts";

const WOODS = [
  { name: "Pine", swatch: "#d9a86c", wood: "#d9a46a", trim: "#b98552", knob: "#8a5a36" },
  { name: "Walnut", swatch: "#8a5a3c", wood: "#94603f", trim: "#75482c", knob: "#e2b77a" },
  { name: "White", swatch: "#f1ebe0", wood: "#f2ebdf", trim: "#ddd0bc", knob: "#b48a5c" },
  { name: "Peppermint", swatch: "#a9d6c2", wood: "#a9d5c1", trim: "#86bba3", knob: "#f5efe2" },
];
const variants = WOODS.map(({ name, swatch }) => ({ name, swatch }));
const W = (v: number) => WOODS[v] ?? WOODS[0]!;

export const WOODEN: FurnitureDef[] = [
  {
    id: "wooden-bed", name: "Wooden Bed", series: "wooden", category: "bed", kind: "floor", size: [2, 2], variants,
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood, "fine");
      const trim = M.wood(c.trim, "fine");
      const parts = [
        // Rails and the slatted base.
        K.part(K.rbox(1.86, 0.24, 1.86, 0.05), wood, { p: [0, 0.27, 0.02] }),
        ...blockLegs(1.86, 1.86, 0.18, trim, 0.13, 0.0),
        // Headboard with round-capped posts.
        K.part(K.rbox(1.7, 0.78, 0.1, 0.04), wood, { p: [0, 0.72, -0.9] }),
        K.part(K.rbox(1.5, 0.08, 0.12, 0.03), trim, { p: [0, 1.0, -0.89] }),
        K.part(K.rbox(0.15, 1.12, 0.15, 0.05, 3, "y"), trim, { p: [-0.9, 0.56, -0.9] }),
        K.part(K.rbox(0.15, 1.12, 0.15, 0.05, 3, "y"), trim, { p: [0.9, 0.56, -0.9] }),
        K.part(K.lathe([[0, 0], [0.08, 0], [0.09, 0.04], [0.06, 0.09], [0, 0.1]], 20), trim, { p: [-0.9, 1.12, -0.9] }),
        K.part(K.lathe([[0, 0], [0.08, 0], [0.09, 0.04], [0.06, 0.09], [0, 0.1]], 20), trim, { p: [0.9, 1.12, -0.9] }),
        // Footboard.
        K.part(K.rbox(1.7, 0.36, 0.1, 0.04), wood, { p: [0, 0.48, 0.92] }),
        K.part(K.rbox(0.14, 0.62, 0.14, 0.05, 3, "y"), trim, { p: [-0.9, 0.31, 0.92] }),
        K.part(K.rbox(0.14, 0.62, 0.14, 0.05, 3, "y"), trim, { p: [0.9, 0.31, 0.92] }),
        // Mattress, blanket with its folded edge, pillow.
        cushion([0, 0.47, -0.02], 1.66, 0.2, 1.72, M.fabric("#fbf6ea"), [0, 0, 0], 0.22, 0.1),
        cushion([0, 0.555, 0.26], 1.72, 0.12, 1.22, M.fabric("#9fc98a", 0.7), [0, 0, 0], 0.18, 0.05),
        cushion([0, 0.6, -0.33], 1.72, 0.1, 0.18, M.fabric("#fbf6ea"), [0, 0, 0], 0.4, 0),
        cushion([0, 0.66, -0.62], 0.86, 0.17, 0.42, M.fabric("#ffffff", 0.5), [-0.18, 0, 0], 0.45, 0.6),
      ];
      return K.group(parts);
    },
  },
  {
    id: "wooden-nightstand", name: "Wooden Nightstand", series: "wooden", category: "storage", kind: "floor", size: [1, 1], variants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.72 },
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      return K.group([
        K.part(K.rbox(0.86, 0.06, 0.82, 0.025), trim, { p: [0, 0.69, 0] }),
        K.part(K.rbox(0.78, 0.56, 0.74, 0.04), wood, { p: [0, 0.38, -0.01] }),
        ...drawer([0, 0.52, 0.37], 0.66, 0.2, trim, M.wood(c.knob)),
        ...drawer([0, 0.27, 0.37], 0.66, 0.2, trim, M.wood(c.knob)),
        ...blockLegs(0.78, 0.74, 0.1, trim, 0.09, 0.0),
      ]);
    },
  },
  {
    id: "wooden-wardrobe", name: "Wooden Wardrobe", series: "wooden", category: "storage", kind: "floor", size: [2, 1], variants,
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      const k = M.wood(c.knob);
      return K.group([
        K.part(K.rbox(1.84, 1.86, 0.8, 0.05), wood, { p: [0, 1.05, -0.04] }),
        K.part(K.rbox(1.96, 0.1, 0.9, 0.04), trim, { p: [0, 2.02, -0.02] }),
        K.part(K.rbox(1.9, 0.12, 0.86, 0.04), trim, { p: [0, 0.1, -0.02] }),
        // Two doors with raised panels.
        K.part(K.rbox(0.86, 1.62, 0.05, 0.025), trim, { p: [-0.44, 1.12, 0.37] }),
        K.part(K.rbox(0.86, 1.62, 0.05, 0.025), trim, { p: [0.44, 1.12, 0.37] }),
        K.part(K.rbox(0.62, 0.66, 0.04, 0.03), wood, { p: [-0.44, 1.5, 0.4] }),
        K.part(K.rbox(0.62, 0.66, 0.04, 0.03), wood, { p: [0.44, 1.5, 0.4] }),
        K.part(K.rbox(0.62, 0.56, 0.04, 0.03), wood, { p: [-0.44, 0.7, 0.4] }),
        K.part(K.rbox(0.62, 0.56, 0.04, 0.03), wood, { p: [0.44, 0.7, 0.4] }),
        knob([-0.08, 1.1, 0.4], k, 0.04),
        knob([0.08, 1.1, 0.4], k, 0.04),
      ]);
    },
  },
  {
    id: "wooden-desk", name: "Wooden Desk", series: "wooden", category: "table", kind: "floor", size: [2, 1], variants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 0.8 },
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      return K.group([
        K.part(K.rbox(1.94, 0.08, 0.9, 0.035), wood, { p: [0, 0.76, 0] }),
        // A drawer stack on the right, a leg pair on the left.
        K.part(K.rbox(0.56, 0.68, 0.78, 0.03), trim, { p: [0.62, 0.36, -0.02] }),
        ...drawer([0.62, 0.55, 0.38], 0.46, 0.2, wood, M.wood(c.knob)),
        ...drawer([0.62, 0.29, 0.38], 0.46, 0.24, wood, M.wood(c.knob)),
        K.part(K.rbox(0.09, 0.72, 0.09, 0.025, 2, "y"), trim, { p: [-0.88, 0.36, -0.35] }),
        K.part(K.rbox(0.09, 0.72, 0.09, 0.025, 2, "y"), trim, { p: [-0.88, 0.36, 0.35] }),
        K.part(K.rbox(0.06, 0.06, 0.66, 0.02), trim, { p: [-0.88, 0.14, 0] }),
        K.part(K.rbox(1.2, 0.08, 0.04, 0.02), trim, { p: [-0.25, 0.66, -0.4] }),
      ]);
    },
  },
  {
    id: "wooden-chair", name: "Wooden Chair", series: "wooden", category: "seat", kind: "floor", size: [1, 1], variants,
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      return K.group([
        K.part(K.rbox(0.66, 0.07, 0.62, 0.03), wood, { p: [0, 0.46, 0.02] }),
        ...blockLegs(0.62, 0.58, 0.43, trim, 0.07, 0.02).map((o) => K.place(o, { p: [o.position.x, o.position.y, o.position.z + 0.02] })),
        K.part(K.rbox(0.07, 0.62, 0.07, 0.025, 2, "y"), trim, { p: [-0.27, 0.8, -0.25] }),
        K.part(K.rbox(0.07, 0.62, 0.07, 0.025, 2, "y"), trim, { p: [0.27, 0.8, -0.25] }),
        K.part(K.rbox(0.62, 0.2, 0.05, 0.025), wood, { p: [0, 1.0, -0.25] }),
        K.part(K.rbox(0.5, 0.05, 0.04, 0.015), wood, { p: [0, 0.72, -0.25] }),
        cushion([0, 0.52, 0.02], 0.54, 0.07, 0.5, M.fabric("#9fc98a"), [0, 0, 0], 0.3, 0.3),
      ]);
    },
  },
  {
    id: "wooden-bookshelf", name: "Wooden Bookshelf", series: "wooden", category: "storage", kind: "floor", size: [2, 1], variants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 1.72 },
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      const covers = ["#e0745f", "#5f8fcf", "#f2c14e", "#7cb87a", "#c98bd6", "#f29fb3", "#6bb5b0"];
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(0.08, 1.7, 0.8, 0.03, 2, "y"), wood, { p: [-0.92, 0.85, -0.05] }),
        K.part(K.rbox(0.08, 1.7, 0.8, 0.03, 2, "y"), wood, { p: [0.92, 0.85, -0.05] }),
        K.part(K.rbox(1.92, 0.06, 0.84, 0.025), trim, { p: [0, 1.69, -0.04] }),
        K.part(K.rbox(1.8, 1.62, 0.04, 0.01), trim, { p: [0, 0.85, -0.43] }),
      ];
      for (const y of [0.06, 0.6, 1.14]) parts.push(K.part(K.rbox(1.8, 0.05, 0.78, 0.015), wood, { p: [0, y, -0.05] }));
      // Books on the two lower shelves.
      let i = 0;
      for (const y of [0.085, 0.625]) {
        let x = -0.82;
        while (x < 0.78) {
          const w = 0.07 + ((i * 37) % 5) * 0.012;
          const h = 0.32 + ((i * 53) % 7) * 0.025;
          const lean = i % 9 === 8 ? -0.25 : 0;
          if (i % 6 !== 5) parts.push(book([x + w / 2, y + h / 2, -0.08], w, h, 0.52, covers[i % covers.length]!, lean));
          x += w + 0.008 + (i % 6 === 5 ? 0.1 : 0);
          i++;
        }
      }
      // A stack lying flat on the top shelf, and a few standing beside it.
      for (let j = 0; j < 4; j++) {
        parts.push(K.group([book([0, 0, 0], 0.055, 0.42, 0.34, covers[(j + 2) % covers.length]!, Math.PI / 2)], { p: [-0.45, 1.195 + j * 0.056, -0.1], r: [0, 0.18 * j - 0.25, 0] }));
      }
      for (let j = 0; j < 5; j++) parts.push(book([0.25 + j * 0.085, 1.165 + 0.17, -0.08], 0.075, 0.34, 0.5, covers[(j + 4) % covers.length]!));
      return K.group(parts);
    },
  },
  {
    id: "wooden-round-table", name: "Wooden Round Table", series: "wooden", category: "table", kind: "floor", size: [2, 2], variants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.74 },
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      return K.group([
        K.part(K.puck(0.82, 0.08, 0.03, 56), wood, { p: [0, 0.66, 0] }),
        K.part(K.lathe([[0, 0], [0.4, 0], [0.42, 0.04], [0.3, 0.08], [0.1, 0.14], [0.08, 0.6], [0.22, 0.66], [0, 0.66]], 40), trim),
      ]);
    },
  },
  {
    id: "wooden-stool", name: "Wooden Stool", series: "wooden", category: "seat", kind: "floor", size: [1, 1], variants,
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood, "bold");
      const trim = M.wood(c.trim);
      const legsOut = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        return K.part(K.rod([Math.cos(a) * 0.12, 0.44, Math.sin(a) * 0.12], [Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27], 0.035), trim);
      });
      return K.group([K.part(K.puck(0.3, 0.09, 0.035, 40), wood, { p: [0, 0.42, 0] }), ...legsOut]);
    },
  },
  {
    id: "wooden-chest", name: "Wooden Chest", series: "wooden", category: "storage", kind: "floor", size: [2, 1], variants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 1.02 },
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      const k = M.wood(c.knob);
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.94, 0.06, 0.86, 0.025), trim, { p: [0, 0.99, -0.02] }),
        K.part(K.rbox(1.84, 0.86, 0.78, 0.04), wood, { p: [0, 0.53, -0.04] }),
        ...blockLegs(1.84, 0.78, 0.1, trim, 0.1, 0),
      ];
      for (const y of [0.82, 0.54, 0.26]) {
        parts.push(...drawer([-0.45, y, 0.36], 0.82, 0.24, trim, k));
        parts.push(...drawer([0.45, y, 0.36], 0.82, 0.24, trim, k));
      }
      return K.group(parts);
    },
  },
  {
    id: "wooden-lamp", name: "Wooden Lamp", series: "wooden", category: "lamp", kind: "misc", size: [1, 1], variants,
    light: { at: [0, 0.5, 0], color: "#ffdcaa", intensity: 2.2, distance: 3, halo: 0.8, startsOn: true },
    build(v) {
      const c = W(v);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      const cloth = ["#f6ecd6", "#efe2c8", "#fbf6ec", "#e6f3ec"][v] ?? "#f6ecd6";
      const lampShade = shade(0.22, 0.16, 0.24, cloth, "#ffe2a8", 0.9);
      lampShade.position.set(0, 0.56, 0);
      return K.group([
        K.part(K.rbox(0.3, 0.06, 0.3, 0.025), trim, { p: [0, 0.03, 0] }),
        K.part(K.lathe([[0, 0.06], [0.06, 0.06], [0.05, 0.14], [0.035, 0.2], [0.035, 0.42], [0.05, 0.45], [0, 0.46]], 24), wood),
        lampShade,
        bulb([0, 0.5, 0], 0.06),
      ]);
    },
  },
];
