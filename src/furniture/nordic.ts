// Simple series: white, light oak, soft grey and sage textiles. Clean lines, but
// every edge stays round and every cushion puffy, so it still feels like a
// toy room rather than a catalogue page.

import * as THREE from "three";
import { K, M, book, bulb, cushion, dome, framed, knob, pot, rug, shade } from "./common.ts";
import type { V3 } from "./common.ts";
import { drawn } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

const OAK = "#dcbb8c";
const OAK_DEEP = "#c9a273";
const WHITE = "#f6f3ec";
const OAT = "#e6dccb";
const LINEN = "#f2ede3";
const GREY = "#c8c8c3";
const SAGE = "#b3c3a3";

const oak = () => M.wood(OAK, "fine");
const UP = new THREE.Vector3(0, 1, 0);

/** Point an object's +Y from `from` toward `to`, standing at `from`. */
export function orient<T extends THREE.Object3D>(o: T, from: V3, to: V3): T {
  o.position.set(...from);
  o.quaternion.setFromUnitVectors(UP, new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize());
  return o;
}

/** A tapered round leg from its foot up to `top`. */
export function taper(top: V3, foot: V3, rTop: number, rFoot: number, mat: THREE.Material): THREE.Mesh {
  const len = Math.hypot(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]);
  const g = K.lathe([[0, 0], [rFoot * 0.75, 0], [rFoot, 0.014], [rTop, len], [0, len]], 18);
  return orient(K.part(g, mat), foot, top);
}

/** Four splayed legs: tops at the corners of tw×td, feet pushed out by `splay`. */
export function splayLegs(tw: number, td: number, yTop: number, mat: THREE.Material, r = 0.032, splay = 0.04, z0 = 0): THREE.Mesh[] {
  return K.corners(tw, td).map(([x, , z]) => taper([x, yTop, z + z0], [x + Math.sign(x) * splay, 0, z + z0 + Math.sign(z) * splay], r, r * 0.62, mat));
}

/** A ring lying in the XY plane (rotate it to taste). */
export function ring(r: number, tube: number, mat: THREE.Material, p: V3, rot: V3 = [0, 0, 0]): THREE.Mesh {
  return K.part(new THREE.TorusGeometry(r, tube, 10, 56), mat, { p, r: rot });
}

/**
 * A curved band seen from above: a slice of a ring `r` out, `t` thick,
 * spanning `span` radians around the back (-Z), with round ends. Extruded
 * `h` tall and stood up, centred on y = 0.
 */
function band(r: number, t: number, span: number, h: number, bevel: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const a0 = Math.PI / 2 - span / 2, a1 = Math.PI / 2 + span / 2;
  const rm = r - t / 2;
  s.absarc(0, 0, r, a0, a1, false);
  s.absarc(Math.cos(a1) * rm, Math.sin(a1) * rm, t / 2, a1, a1 + Math.PI, false);
  s.absarc(0, 0, r - t, a1, a0, true);
  s.absarc(Math.cos(a0) * rm, Math.sin(a0) * rm, t / 2, a0 + Math.PI, a0 + Math.PI * 2, false);
  const g = K.extrude(s, h, bevel, 32);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A band whose height falls from full at the back to `low` of it at the ends: a tub chair's shell. */
function tub(r: number, t: number, span: number, h: number, bevel: number, low: number): THREE.BufferGeometry {
  const g = band(r, t, span, h, bevel);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const back = Math.max(0, Math.min(1, -p.getZ(i) / r));
    const f = low + (1 - low) * Math.pow(back, 1.4);
    p.setY(i, -h / 2 + (p.getY(i) + h / 2) * f);
  }
  return K.weld(g);
}

/** Case goods come in the series' four finishes; the top is always oak. */
const CASES = [
  { name: "White Oak", swatch: "#f3efe7", body: WHITE },
  { name: "Light Oak", swatch: "#dcbb8c", body: "" },
  { name: "Mist Grey", swatch: "#c8c8c3", body: GREY },
  { name: "Sage", swatch: "#b3c3a3", body: SAGE },
];
const caseVariants = CASES.map(({ name, swatch }) => ({ name, swatch }));
const caseBody = (v: number) => {
  const c = CASES[v] ?? CASES[0]!;
  return c.body ? M.paint(c.body, 0.55) : oak();
};

export const NORDIC: FurnitureDef[] = [
  {
    id: "simple-bed", name: "Simple Bed", series: "nordic", category: "bed", kind: "floor", size: [2, 2],
    variants: [{ name: "Oatmeal", swatch: "#e6dccb" }, { name: "Sage", swatch: "#b3c3a3" }, { name: "Mist Grey", swatch: "#c8c8c3" }],
    build(v) {
      const sets = [
        { white: false, pad: OAT, duvet: "#f1ebdf", knit: GREY, accent: SAGE },
        { white: false, pad: SAGE, duvet: "#f7f4ee", knit: SAGE, accent: OAT },
        { white: true, pad: GREY, duvet: "#deded9", knit: "#efe6d4", accent: SAGE },
      ];
      const c = sets[v] ?? sets[0]!;
      const frame = c.white ? M.paint(WHITE, 0.55) : oak();
      const head = K.roundedRectShape(1.86, 0.82, 0.2);
      const parts: THREE.Object3D[] = [
        // A low platform on short pegs.
        K.part(K.rbox(1.92, 0.2, 1.84, 0.07), frame, { p: [0, 0.21, 0.03] }),
        ...splayLegs(1.7, 1.6, 0.12, oak(), 0.04, 0.02, 0.03),
        // Headboard: a big soft-cornered oak slab with an upholstered pad.
        K.part(K.extrude(head, 0.09, 0.03), frame, { p: [0, 0.62, -0.915] }),
        cushion([0, 0.8, -0.85], 1.62, 0.36, 0.1, M.fabric(c.pad, 0.7), [0, 0, 0], 0.32, 0.2),
        // Mattress, duvet with its turned-down sheet, pillows.
        cushion([0, 0.42, 0.05], 1.8, 0.22, 1.74, M.fabric("#fbf8f2"), [0, 0, 0], 0.2, 0.1),
        cushion([0, 0.535, 0.2], 1.86, 0.12, 1.44, M.fabric(c.duvet, 0.65), [0, 0, 0], 0.18, 0.05),
        cushion([0, 0.575, -0.49], 1.86, 0.1, 0.2, M.fabric("#fbf8f2", 0.5), [0, 0, 0], 0.4, 0),
        cushion([-0.43, 0.65, -0.66], 0.78, 0.17, 0.4, M.fabric("#ffffff", 0.5), [-0.22, 0.04, 0], 0.45, 0.6),
        cushion([0.43, 0.65, -0.66], 0.78, 0.17, 0.4, M.fabric("#ffffff", 0.5), [-0.22, -0.04, 0], 0.45, 0.6),
        cushion([0.12, 0.66, -0.4], 0.38, 0.32, 0.11, M.fabric(c.accent, 0.7), [-0.45, -0.12, 0.08], 0.4, 0.55),
      ];
      // A chunky knitted throw over the foot: fat cords draped side to side.
      const knitA = M.fabric(c.knit, 0.9);
      const knitB = M.fabric(new THREE.Color(c.knit).multiplyScalar(0.93).getStyle(), 0.9);
      for (let i = 0; i < 10; i++) {
        const z = 0.44 + i * 0.05;
        const wob = (i % 2 ? 1 : -1) * 0.006;
        const path: V3[] = [[-0.925, 0.37, z], [-0.935, 0.5, z], [-0.89, 0.6, z], [-0.62, 0.63 + wob, z], [0, 0.635 - wob, z], [0.62, 0.63 + wob, z], [0.89, 0.6, z], [0.935, 0.5, z], [0.925, 0.37, z]];
        parts.push(K.part(K.tube(path, 0.027, 72, 10), i % 2 ? knitA : knitB));
      }
      return K.group(parts);
    },
  },
  {
    id: "simple-nightstand", name: "Simple Nightstand", series: "nordic", category: "storage", kind: "floor", size: [1, 1], variants: caseVariants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.7 },
    build(v) {
      const body = caseBody(v);
      const wood = oak();
      return K.group([
        K.part(K.rbox(0.86, 0.06, 0.82, 0.03), wood, { p: [0, 0.67, 0] }),
        // The drawer on top, an open cubby below.
        K.part(K.rbox(0.8, 0.26, 0.74, 0.045), body, { p: [0, 0.52, -0.02] }),
        K.part(K.rbox(0.72, 0.19, 0.04, 0.02), body, { p: [0, 0.52, 0.355] }),
        knob([0, 0.52, 0.37], wood, 0.04),
        K.part(K.rbox(0.07, 0.26, 0.74, 0.03), body, { p: [-0.365, 0.28, -0.02] }),
        K.part(K.rbox(0.07, 0.26, 0.74, 0.03), body, { p: [0.365, 0.28, -0.02] }),
        K.part(K.rbox(0.8, 0.06, 0.74, 0.03), body, { p: [0, 0.175, -0.02] }),
        K.part(K.rbox(0.68, 0.24, 0.03, 0.012), body, { p: [0, 0.28, -0.37] }),
        ...splayLegs(0.62, 0.56, 0.16, wood, 0.032, 0.04),
        // A woven basket and two books in the cubby.
        K.part(K.rbox(0.34, 0.15, 0.44, 0.04), M.rattan("#d9bb8a"), { p: [-0.13, 0.28, 0.0] }),
        K.part(K.rbox(0.35, 0.03, 0.45, 0.015), M.rattan("#cfae7b"), { p: [-0.13, 0.355, 0.0] }),
        K.group([book([0, 0, 0], 0.05, 0.26, 0.2, "#9fb5c9", Math.PI / 2)], { p: [0.2, 0.23, 0.02], r: [0, 0.15, 0] }),
        K.group([book([0, 0, 0], 0.045, 0.24, 0.18, "#e8c27a", Math.PI / 2)], { p: [0.2, 0.278, 0.02], r: [0, -0.1, 0] }),
      ]);
    },
  },
  {
    id: "simple-desk", name: "Simple Desk", series: "nordic", category: "table", kind: "floor", size: [2, 1], variants: caseVariants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 0.76 },
    build(v) {
      const body = caseBody(v);
      const wood = oak();
      return K.group([
        K.part(K.rbox(1.94, 0.06, 0.9, 0.03), wood, { p: [0, 0.73, 0] }),
        // A slim apron with one wide drawer.
        K.part(K.rbox(1.72, 0.12, 0.76, 0.04), body, { p: [0, 0.645, -0.02] }),
        K.part(K.rbox(0.66, 0.085, 0.04, 0.02), body, { p: [0.32, 0.645, 0.36] }),
        K.part(K.rbox(0.16, 0.03, 0.03, 0.012), wood, { p: [0.32, 0.645, 0.39] }),
        ...splayLegs(1.66, 0.66, 0.62, wood, 0.036, 0.06),
        // A stretcher between the back legs and a pegged rail for bags.
        K.part(K.rod([-0.83, 0.2, -0.355], [0.83, 0.2, -0.355], 0.018), wood),
      ]);
    },
  },
  {
    id: "simple-chair", name: "Simple Chair", series: "nordic", category: "seat", kind: "floor", size: [1, 1],
    variants: [{ name: "Light Oak", swatch: "#dcbb8c" }, { name: "White", swatch: "#f6f3ec" }, { name: "Sage", swatch: "#b3c3a3" }, { name: "Mist Grey", swatch: "#c8c8c3" }],
    build(v) {
      const sets = [
        { frame: OAK, seat: GREY },
        { frame: WHITE, seat: OAT },
        { frame: OAK, seat: SAGE },
        { frame: GREY, seat: LINEN },
      ];
      const c = sets[v] ?? sets[0]!;
      const frame = c.frame === OAK ? oak() : M.paint(c.frame, 0.5);
      const wood = oak();
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(0.6, 0.06, 0.56, 0.03), frame, { p: [0, 0.4, 0.04] }),
        cushion([0, 0.465, 0.05], 0.54, 0.08, 0.5, M.fabric(c.seat, 0.7), [0, 0, 0], 0.3, 0.25),
        ...[-1, 1].flatMap((sx) => [
          taper([sx * 0.235, 0.39, 0.27], [sx * 0.28, 0, 0.32], 0.03, 0.021, wood),
          // The back legs run on up to carry the curved rail.
          taper([sx * 0.225, 0.9, -0.215], [sx * 0.27, 0, -0.27], 0.024, 0.024, wood),
        ]),
        K.part(band(0.37, 0.035, 1.55, 0.16, 0.022), frame, { p: [0, 0.8, 0.075] }),
        K.part(K.rod([-0.25, 0.16, 0.3], [0.25, 0.16, 0.3], 0.014), wood),
        K.part(K.rod([-0.25, 0.16, -0.25], [0.25, 0.16, -0.25], 0.014), wood),
      ];
      return K.group(parts);
    },
  },
  {
    id: "simple-sofa", name: "Simple Sofa", series: "nordic", category: "seat", kind: "floor", size: [2, 1],
    variants: [{ name: "Mist Grey", swatch: "#c8c8c3" }, { name: "Oatmeal", swatch: "#e6dccb" }, { name: "Sage", swatch: "#b3c3a3" }, { name: "Mist Blue", swatch: "#b7c6d3" }],
    build(v) {
      const sets = [
        { cloth: GREY, a: SAGE, b: LINEN },
        { cloth: OAT, a: GREY, b: SAGE },
        { cloth: SAGE, a: LINEN, b: OAT },
        { cloth: "#b7c6d3", a: LINEN, b: "#e9c98f" },
      ];
      const c = sets[v] ?? sets[0]!;
      const cloth = M.fabric(c.cloth, 0.7);
      const wood = oak();
      return K.group([
        ...splayLegs(1.64, 0.62, 0.17, wood, 0.034, 0.05),
        cushion([0, 0.275, 0.0], 1.9, 0.22, 0.88, cloth, [0, 0, 0], 0.25, 0.1),
        cushion([-0.835, 0.43, 0.01], 0.23, 0.36, 0.86, cloth, [0, 0, 0], 0.32, 0.08),
        cushion([0.835, 0.43, 0.01], 0.23, 0.36, 0.86, cloth, [0, 0, 0], 0.32, 0.08),
        cushion([0, 0.6, -0.335], 1.5, 0.5, 0.2, cloth, [0, 0, 0], 0.3, 0.1),
        cushion([-0.36, 0.445, 0.07], 0.72, 0.15, 0.7, cloth, [0, 0, 0], 0.3, 0.35),
        cushion([0.36, 0.445, 0.07], 0.72, 0.15, 0.7, cloth, [0, 0, 0], 0.3, 0.35),
        cushion([-0.36, 0.67, -0.2], 0.7, 0.38, 0.17, cloth, [-0.2, 0, 0], 0.4, 0.3),
        cushion([0.36, 0.67, -0.2], 0.7, 0.38, 0.17, cloth, [-0.2, 0, 0], 0.4, 0.3),
        // Two throw pillows in the series' accents.
        cushion([-0.52, 0.66, -0.06], 0.3, 0.3, 0.11, M.fabric(c.a, 0.8), [-0.3, 0.3, -0.12], 0.45, 0.55),
        cushion([0.55, 0.64, -0.05], 0.28, 0.28, 0.11, M.fabric(c.b, 0.8), [-0.32, -0.35, 0.15], 0.45, 0.55),
      ]);
    },
  },
  {
    id: "lounge-chair", name: "Lounge Chair", series: "nordic", category: "seat", kind: "floor", size: [1, 1],
    variants: [{ name: "Milk White", swatch: "#f3eee4" }, { name: "Oatmeal", swatch: "#e2d5bf" }, { name: "Sage", swatch: "#b3c3a3" }, { name: "Mist Grey", swatch: "#c8c8c3" }],
    build(v) {
      const tones = [["#f3eee4", SAGE], ["#e2d5bf", "#f6f1e6"], [SAGE, "#f3eee4"], [GREY, "#e9c98f"]];
      const [c, accent] = tones[v] ?? tones[0]!;
      // Boucle: a deep, nubbly pile.
      const boucle = M.plush(c!);
      const wood = oak();
      return K.group([
        ...splayLegs(0.5, 0.48, 0.16, wood, 0.034, 0.035),
        cushion([0, 0.255, 0.0], 0.84, 0.22, 0.8, boucle, [0, 0, 0], 0.45, 0.1),
        // The tub: a low ring for the arms, a taller one for the back.
        K.part(tub(0.37, 0.13, 4.4, 0.52, 0.06, 0.58), boucle, { p: [0, 0.56, 0.02] }),
        cushion([0, 0.405, 0.06], 0.6, 0.13, 0.56, boucle, [0, 0, 0], 0.5, 0.3),
        cushion([0, 0.58, -0.17], 0.36, 0.22, 0.1, M.fabric(accent!, 0.8), [-0.25, 0, 0], 0.45, 0.5),
      ]);
    },
  },
  {
    id: "side-table", name: "Round Side Table", series: "nordic", category: "table", kind: "floor", size: [1, 1],
    variants: [{ name: "White", swatch: "#f6f3ec" }, { name: "Light Oak", swatch: "#dcbb8c" }, { name: "Sage", swatch: "#b3c3a3" }, { name: "Mist Grey", swatch: "#c8c8c3" }],
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.56 },
    build(v) {
      const tops = [WHITE, "", SAGE, GREY];
      const t = tops[v] ?? WHITE;
      const top = t ? M.paint(t, 0.5) : oak();
      const wood = oak();
      // A tray top with a fat rolled rim.
      const tray = K.lathe([[0, 0.5], [0.4, 0.5], [0.44, 0.505], [0.458, 0.525], [0.458, 0.555], [0.444, 0.572], [0.425, 0.575], [0.41, 0.568], [0.4, 0.56], [0, 0.56]], 48);
      const legsOut = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        return taper([Math.cos(a) * 0.22, 0.51, Math.sin(a) * 0.22], [Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36], 0.032, 0.022, wood);
      });
      return K.group([
        K.part(tray, top),
        ...legsOut,
        K.part(K.puck(0.32, 0.035, 0.015, 40), top, { p: [0, 0.19, 0] }),
        K.group([book([0, 0, 0], 0.045, 0.3, 0.22, "#e3a58a", Math.PI / 2)], { p: [0, 0.248, 0], r: [0, 0.4, 0] }),
        K.group([book([0, 0, 0], 0.04, 0.26, 0.2, "#9fb5c9", Math.PI / 2)], { p: [0.01, 0.291, 0], r: [0, 0.1, 0] }),
      ]);
    },
  },
  {
    id: "tripod-lamp", name: "Tripod Floor Lamp", series: "nordic", category: "lamp", kind: "floor", size: [1, 1],
    variants: [{ name: "Linen", swatch: "#f4efe4" }, { name: "Mist Grey", swatch: "#c8c8c3" }, { name: "Sage", swatch: "#b3c3a3" }],
    light: { at: [0, 1.5, 0], color: "#ffe2a8", intensity: 4, distance: 4.5, halo: 1.3, startsOn: true },
    build(v) {
      const c = ["#f4efe4", GREY, SAGE][v] ?? "#f4efe4";
      const wood = oak();
      const brass = M.metal("#d8b26a", 0.35);
      const joint: V3 = [0, 1.06, 0];
      const parts: THREE.Object3D[] = [];
      for (const a of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) {
        const foot: V3 = [Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36];
        // Each leg runs a little past the joint, the way tripods cross.
        const top: V3 = [joint[0] - foot[0] * 0.12, joint[1] + 0.13, joint[2] - foot[2] * 0.12];
        parts.push(taper(top, foot, 0.024, 0.02, wood));
      }
      const s = shade(0.28, 0.25, 0.34, c, "#ffe2a8", 0.85);
      s.position.set(0, 1.56, 0);
      parts.push(
        K.part(K.lathe([[0, 0], [0.05, 0], [0.055, 0.03], [0.05, 0.08], [0, 0.08]], 24), brass, { p: [0, 1.03, 0] }),
        K.part(K.rod([0, 1.1, 0], [0, 1.42, 0], 0.016), brass),
        s,
        ring(0.28, 0.014, M.paint(c, 0.5), [0, 1.39, 0], [Math.PI / 2, 0, 0]),
        ring(0.25, 0.014, M.paint(c, 0.5), [0, 1.73, 0], [Math.PI / 2, 0, 0]),
        bulb([0, 1.5, 0], 0.07),
      );
      return K.group(parts);
    },
  },
  {
    id: "cube-shelf", name: "Cube Shelf", series: "nordic", category: "storage", kind: "floor", size: [2, 1],
    variants: [{ name: "White", swatch: "#f6f3ec" }, { name: "Light Oak", swatch: "#dcbb8c" }, { name: "Sage", swatch: "#b3c3a3" }],
    surface: { rect: [-1, -0.5, 1, 0.5], y: 1.0 },
    build(v) {
      const f = [M.paint(WHITE, 0.5), oak(), M.paint(SAGE, 0.5)][v] ?? M.paint(WHITE, 0.5);
      const zc = -0.02;
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.94, 0.06, 0.86, 0.025), f, { p: [0, 0.97, zc] }),
        K.part(K.rbox(1.94, 0.06, 0.86, 0.025), f, { p: [0, 0.12, zc] }),
        K.part(K.rbox(0.06, 0.9, 0.86, 0.025), f, { p: [-0.94, 0.545, zc] }),
        K.part(K.rbox(0.06, 0.9, 0.86, 0.025), f, { p: [0.94, 0.545, zc] }),
        K.part(K.rbox(1.84, 0.045, 0.84, 0.018), f, { p: [0, 0.545, zc] }),
        K.part(K.rbox(1.84, 0.82, 0.03, 0.012), f, { p: [0, 0.545, -0.43] }),
        K.part(K.rbox(1.8, 0.09, 0.7, 0.03), M.paint("#e3ddd2", 0.6), { p: [0, 0.045, -0.04] }),
      ];
      for (const x of [-0.47, 0, 0.47]) parts.push(K.part(K.rbox(0.045, 0.82, 0.84, 0.018), f, { p: [x, 0.545, zc] }));
      const cols = [-0.705, -0.235, 0.235, 0.705];
      const rows = [0.15, 0.5675];
      // Fabric bins: a soft box with a turned cuff and a finger hole.
      const bin = (x: number, y0: number, color: string) => {
        const cloth = M.fabric(color, 0.6);
        const hole = M.paint(new THREE.Color(color).multiplyScalar(0.6).getStyle(), 0.9);
        return [
          K.part(K.rbox(0.37, 0.3, 0.62, 0.045), cloth, { p: [x, y0 + 0.155, 0.08] }),
          K.part(K.rbox(0.385, 0.05, 0.635, 0.025), cloth, { p: [x, y0 + 0.29, 0.08] }),
          K.part(K.rbox(0.13, 0.045, 0.02, 0.02), hole, { p: [x, y0 + 0.235, 0.39] }),
        ];
      };
      const binColors = [[GREY, SAGE, OAT, "#d9c9b3"], [LINEN, GREY, SAGE, LINEN], [LINEN, OAT, GREY, LINEN]][v] ?? [GREY, SAGE, OAT, "#d9c9b3"];
      parts.push(...bin(cols[2]!, rows[1]!, binColors[0]!), ...bin(cols[0]!, rows[0]!, binColors[1]!), ...bin(cols[1]!, rows[0]!, binColors[2]!), ...bin(cols[3]!, rows[0]!, binColors[3]!));
      // Top left: books with one leaning.
      const covers = ["#9fb5c9", "#e8c27a", "#e3a58a", "#b3c3a3", "#f2ede3"];
      let x = -0.89;
      covers.forEach((c, i) => {
        const w = 0.06 + (i % 2) * 0.012;
        const h = 0.27 + ((i * 3) % 4) * 0.02;
        parts.push(book([x + w / 2, rows[1]! + h / 2 + 0.003, -0.02], w, h, 0.36, c, i === 4 ? -0.32 : 0));
        x += w + 0.008;
      });
      // Second: a round vase with a sprig of eucalyptus.
      const vx = cols[1]!;
      const vy = rows[1]!;
      parts.push(K.part(K.lathe([[0, 0], [0.07, 0], [0.1, 0.05], [0.095, 0.11], [0.05, 0.16], [0.04, 0.2], [0.05, 0.215], [0.035, 0.215], [0, 0.2]], 32), M.ceramic("#f2ede3"), { p: [vx - 0.05, vy, 0.05] }));
      const leafM = M.leaf("#9db592");
      for (let i = 0; i < 3; i++) {
        const tip: V3 = [vx - 0.05 + (i - 1) * 0.07, vy + 0.33 + (i % 2) * 0.03, 0.05 + (i - 1) * 0.02];
        parts.push(K.part(K.tube([[vx - 0.05, vy + 0.18, 0.05], [vx - 0.05 + (i - 1) * 0.03, vy + 0.26, 0.05], tip], 0.008, 12, 5), M.paint("#7e9a74")));
        for (let k = 0; k < 4; k++) {
          const t = 0.35 + k * 0.18;
          const p: V3 = [vx - 0.05 + (tip[0] - vx + 0.05) * t, vy + 0.2 + (tip[1] - vy - 0.2) * t, 0.05 + (tip[2] - 0.05) * t];
          parts.push(K.part(new THREE.SphereGeometry(0.026, 14, 10), leafM, { p, s: [1, 0.35, 1], r: [0.3 * (k % 2 ? 1 : -1), 0, 0.5 * (k % 2 ? 1 : -1)] }));
        }
      }
      parts.push(K.part(new THREE.SphereGeometry(0.055, 20, 14), M.paint("#e9c98f", 0.7), { p: [vx + 0.11, vy + 0.055, 0.12] }));
      // Top right: a little cactus in a terracotta pot.
      const { parts: potParts, top } = pot(0.1, 0.14, M.ceramic("#dfa486"));
      const cactus = M.paint("#7fae78", 0.6);
      parts.push(K.group([
        ...potParts,
        K.part(K.soft(0.11, 0.2, 0.11, 0.6), cactus, { p: [0, top + 0.09, 0] }),
        K.part(K.soft(0.06, 0.1, 0.06, 0.6), cactus, { p: [0.07, top + 0.1, 0], r: [0, 0, -0.5] }),
        K.part(new THREE.SphereGeometry(0.02, 10, 8), M.paint("#f4a8b8", 0.6), { p: [0, top + 0.2, 0] }),
      ], { p: [cols[3]!, rows[1]!, 0.05] }));
      return K.group(parts);
    },
  },
  {
    id: "floor-mirror", name: "Floor Mirror", series: "nordic", category: "decor", kind: "floor", size: [1, 0.5],
    variants: [{ name: "Light Oak", swatch: "#dcbb8c" }, { name: "White", swatch: "#f6f3ec" }, { name: "Mist Grey", swatch: "#c8c8c3" }, { name: "Gold", swatch: "#d8b26a" }],
    build(v) {
      const frameMat = [oak(), M.paint(WHITE, 0.45), M.paint(GREY, 0.5), M.metal("#d8b26a", 0.3)][v] ?? oak();
      const w = 0.78, h = 1.66, b = 0.075;
      const outer = K.archShape(w, h, 0);
      outer.holes.push(K.archShape(w - b * 2, h - b * 2, b) as unknown as THREE.Path);
      const glassGeo = K.planarUV(new THREE.ShapeGeometry(K.archShape(w - b * 2 + 0.03, h - b * 2 + 0.03, b - 0.015), 32), w, h);
      const shine = M.paint("#ffffff", 0.3);
      const streak = (x: number, y: number, len: number, wid: number) => K.part(new THREE.PlaneGeometry(wid, len), shine, { p: [x, y, 0.006], r: [0, 0, 0.62] });
      const mirror = K.group([
        K.part(K.extrude(outer, 0.06, 0.016), frameMat, {}),
        K.part(glassGeo, M.gloss("#e2eef2", 0.06), { p: [0, 0, 0.0] }),
        K.part(K.extrude(K.archShape(w - 0.04, h - 0.04, 0.02), 0.02, 0.006), M.paint("#d9d2c6", 0.8), { p: [0, 0, -0.02] }),
        streak(0.08, 1.2, 0.34, 0.05),
        streak(0.15, 1.12, 0.18, 0.025),
        streak(-0.08, 0.5, 0.22, 0.035),
      ], { p: [0, 0.015, 0.1], r: [-0.17, 0, 0] });
      return K.group([
        mirror,
        // A little stop on the floor so it does not slide.
        K.part(K.rbox(0.82, 0.05, 0.08, 0.022), oak(), { p: [0, 0.025, 0.165] }),
      ]);
    },
  },
  {
    id: "snake-plant", name: "Snake Plant", series: "nordic", category: "plant", kind: "misc", size: [1, 1],
    variants: [{ name: "White Pot", swatch: "#f6f3ec" }, { name: "Concrete Pot", swatch: "#bdbcb8" }, { name: "Woven Basket", swatch: "#d8b582" }, { name: "Sage", swatch: "#b3c3a3" }],
    build(v) {
      const potMat = [M.ceramic(WHITE), M.paint("#bdbcb8", 0.9), M.rattan("#d8b582"), M.ceramic(SAGE)][v] ?? M.ceramic(WHITE);
      const body = K.part(K.lathe([[0, 0], [0.17, 0], [0.185, 0.015], [0.2, 0.3], [0.205, 0.33], [0.19, 0.335], [0.18, 0.31], [0.178, 0.26], [0, 0.26]], 40), potMat);
      const soil = K.part(K.puck(0.181, 0.035, 0.01, 32), M.paint("#6b4a33", 0.95), { p: [0, 0.262, 0] });
      // Banded blades with butter-yellow edges.
      const tex = drawn("nordic:snake-leaf", 64, 256, (g, w, h) => {
        g.fillStyle = "#3f7d47";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 22; i++) {
          const y = (i / 22) * h + ((i * 37) % 7);
          g.fillStyle = i % 2 ? "#5d9a58" : "#356f3f";
          g.beginPath();
          g.moveTo(0, y);
          for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.18 + i) * 3);
          g.lineTo(w, y + 4);
          for (let x = w; x >= 0; x -= 8) g.lineTo(x, y + 4 + Math.sin(x * 0.2 + i * 2) * 2);
          g.fill();
        }
        g.fillStyle = "#e6dc84";
        g.fillRect(0, 0, w * 0.1, h);
        g.fillRect(w * 0.9, 0, w * 0.1, h);
      });
      const leafMat = M.printed("nordic:snake-leaf", tex, 0.5);
      leafMat.side = THREE.DoubleSide;
      const blades: THREE.Object3D[] = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const yaw = i * 2.4;
        const len = 0.5 + ((i * 7) % 5) * 0.075 - (i === 0 ? 0 : 0);
        const lean = 0.08 + ((i * 3) % 4) * 0.07;
        const l = K.part(K.leafGeometry(len, 0.13, 0.35, -0.04, "long"), leafMat, {});
        l.rotation.order = "YXZ";
        l.rotation.set(-(Math.PI / 2 - lean), yaw, 0);
        l.position.set(Math.sin(yaw) * 0.04, 0.28, Math.cos(yaw) * 0.04);
        blades.push(l);
      }
      return K.group([body, soil, ...blades]);
    },
  },

  // ---------- Wall ----------
  {
    id: "wall-shelf", name: "Wall Shelf", series: "nordic", category: "wall", kind: "wall", size: [2, 0.5], hang: 1.75,
    variants: [{ name: "Light Oak", swatch: "#dcbb8c" }, { name: "White", swatch: "#f6f3ec" }, { name: "Mist Grey", swatch: "#c8c8c3" }],
    build(v) {
      const board = [oak(), M.paint(WHITE, 0.5), M.paint(GREY, 0.5)][v] ?? oak();
      const iron = M.paint("#6f6b68", 0.5);
      const y0 = -0.165;
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.84, 0.05, 0.25, 0.022), board, { p: [0, y0 - 0.025, 0.125] }),
      ];
      for (const x of [-0.62, 0.62]) {
        parts.push(
          K.part(K.rbox(0.04, 0.05, 0.025, 0.012), iron, { p: [x, y0 - 0.055, 0.0125] }),
          K.part(K.rbox(0.04, 0.024, 0.2, 0.011), iron, { p: [x, y0 - 0.062, 0.1] }),
        );
      }
      // Books standing at the left end.
      const covers = ["#e3a58a", "#9fb5c9", "#f2ede3", "#b3c3a3"];
      let x = -0.86;
      covers.forEach((c, i) => {
        const w = 0.05 + (i % 2) * 0.01;
        const h = 0.26 + ((i * 5) % 3) * 0.025;
        parts.push(book([x + w / 2, y0 + h / 2, 0.12], w, h, 0.18, c, i === 3 ? -0.28 : 0));
        x += w + 0.006;
      });
      // A small framed photo leaning on the wall.
      const photo = framed("nordic:shelf-photo", 0.22, 0.27, oak(), (g, w, h) => {
        g.fillStyle = "#f6efe2"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#cfe3ec"; g.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.5);
        g.fillStyle = "#9fbf8f"; g.beginPath(); g.ellipse(w * 0.5, h * 0.62, w * 0.42, h * 0.16, 0, Math.PI, 0); g.fill();
        g.fillStyle = "#f6d27a"; g.beginPath(); g.arc(w * 0.68, h * 0.3, w * 0.08, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#b9a58c"; g.fillRect(w * 0.12, h * 0.72, w * 0.76, h * 0.04);
      }, 0.03, 0.03);
      parts.push(K.group([photo], { p: [-0.42, y0 + 0.135, 0.06], r: [-0.14, 0.08, 0] }));
      // A pale vase of pampas grass.
      const vx = -0.12;
      parts.push(K.part(K.lathe([[0, 0], [0.05, 0], [0.075, 0.04], [0.07, 0.1], [0.04, 0.14], [0.035, 0.16], [0.045, 0.17], [0.03, 0.17], [0, 0.16]], 32), M.ceramic("#efe7da"), { p: [vx, y0, 0.12] }));
      const stem = M.paint("#c9b58e", 0.8);
      const plume = M.plush("#efe2c4");
      for (let i = 0; i < 3; i++) {
        const from: V3 = [vx, y0 + 0.15, 0.12];
        const tip: V3 = [vx + (i - 1) * 0.1, y0 + 0.3 + (i === 1 ? 0.03 : 0), 0.12 + (i - 1) * 0.02];
        parts.push(K.part(K.tube([from, [vx + (i - 1) * 0.04, y0 + 0.24, 0.12], tip], 0.007, 12, 5), stem));
        parts.push(orient(K.part(K.soft(0.06, 0.14, 0.06, 0.65), plume), [tip[0] - (i - 1) * 0.012, tip[1] - 0.02, tip[2]], [tip[0] + (i - 1) * 0.05, tip[1] + 0.2, tip[2]]));
      }
      // A pothos trailing over the edge.
      const px = 0.3;
      const { parts: potParts, top } = pot(0.085, 0.12, M.ceramic(SAGE));
      parts.push(K.group(potParts, { p: [px, y0, 0.12] }));
      const vine = M.paint("#6d9a55");
      const lf = M.leaf("#5c9e4f");
      const lf2 = M.leaf("#7bb565");
      const leaf = (p: V3, yaw: number, pitch: number, i: number, s = 1) => {
        const l = K.part(K.leafGeometry(0.09 * s, 0.075 * s, 0.2, -0.1, "heart"), i % 2 ? lf : lf2, {});
        l.rotation.order = "YXZ";
        l.rotation.set(pitch, yaw, 0);
        l.position.set(...p);
        return l;
      };
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        parts.push(leaf([px + Math.cos(a) * 0.03, y0 + top + 0.01, 0.12 + Math.sin(a) * 0.03], Math.PI / 2 - a, -0.5, i, 1.1));
      }
      const trail: V3[] = [[px + 0.05, y0 + top, 0.16], [px + 0.09, y0 + 0.02, 0.22], [px + 0.11, y0 - 0.05, 0.255], [px + 0.14, y0 - 0.075, 0.26]];
      parts.push(K.part(K.tube(trail, 0.008, 16, 5), vine));
      parts.push(leaf([px + 0.09, y0 + 0.02, 0.23], 0.6, 0.9, 1), leaf([px + 0.12, y0 - 0.05, 0.255], 0.2, 1.3, 2, 0.9));
      // Two little wooden houses.
      const house = (hx: number, w: number, hh: number, body: THREE.Material, roof: THREE.Material) => {
        const tri = new THREE.Shape();
        tri.moveTo(-w / 2 - 0.012, 0); tri.lineTo(w / 2 + 0.012, 0); tri.lineTo(0, w * 0.55); tri.lineTo(-w / 2 - 0.012, 0);
        return K.group([
          K.part(K.rbox(w, hh, 0.07, 0.012), body, { p: [0, hh / 2, 0] }),
          K.part(K.extrude(tri, 0.08, 0.008), roof, { p: [0, hh, 0] }),
          K.part(K.rbox(0.022, 0.035, 0.01, 0.004), M.paint("#8a6a52"), { p: [0, 0.02, 0.036] }),
        ], { p: [hx, y0, 0.12] });
      };
      parts.push(house(0.6, 0.085, 0.09, M.paint(WHITE, 0.5), M.wood(OAK_DEEP)));
      parts.push(house(0.74, 0.07, 0.13, oak(), M.paint(GREY, 0.5)));
      return K.group(parts);
    },
  },
  {
    id: "abstract-print", name: "Art Print", series: "nordic", category: "wall", kind: "wall", size: [1.5, 1], hang: 2,
    variants: [{ name: "Arches", swatch: "#d98c6a" }, { name: "Leaf Shadows", swatch: "#a9bd9c" }, { name: "Hills", swatch: "#e9c46a" }],
    build(v) {
      const mat = (g: CanvasRenderingContext2D, w: number, h: number) => {
        g.fillStyle = "#fbf8f2";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#f1e9dc";
        g.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
      };
      const draws = [
        (g: CanvasRenderingContext2D, w: number, h: number) => {
          mat(g, w, h);
          const base = h * 0.82;
          g.fillStyle = "#d98c6a";
          g.beginPath(); g.moveTo(w * 0.2, base); g.lineTo(w * 0.2, h * 0.5); g.arc(w * 0.33, h * 0.5, w * 0.13, Math.PI, 0); g.lineTo(w * 0.46, base); g.fill();
          g.fillStyle = "#f1e9dc";
          g.beginPath(); g.moveTo(w * 0.27, base); g.lineTo(w * 0.27, h * 0.55); g.arc(w * 0.33, h * 0.55, w * 0.06, Math.PI, 0); g.lineTo(w * 0.39, base); g.fill();
          g.fillStyle = "#a9bd9c";
          g.beginPath(); g.arc(w * 0.62, base, w * 0.17, Math.PI, 0); g.fill();
          g.fillStyle = "#e9c46a";
          g.beginPath(); g.arc(w * 0.7, h * 0.32, w * 0.07, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "#8b7f73"; g.lineWidth = 3;
          g.beginPath();
          for (let x = w * 0.5; x <= w * 0.86; x += 2) g.lineTo(x, h * 0.5 + Math.sin(x * 0.12) * 4);
          g.stroke();
          g.fillStyle = "#cdb9a0"; g.fillRect(w * 0.12, base, w * 0.76, h * 0.03);
        },
        (g: CanvasRenderingContext2D, w: number, h: number) => {
          mat(g, w, h);
          const leafShape = (x: number, y: number, len: number, a: number, c: string) => {
            g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = c;
            g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.35, -len * 0.3, 0, -len); g.quadraticCurveTo(-len * 0.35, -len * 0.3, 0, 0); g.fill();
            g.strokeStyle = "#f1e9dc"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -len * 0.05); g.lineTo(0, -len * 0.92); g.stroke();
            g.restore();
          };
          leafShape(w * 0.36, h * 0.86, h * 0.62, -0.35, "#a9bd9c");
          leafShape(w * 0.42, h * 0.86, h * 0.5, 0.15, "#8fa886");
          leafShape(w * 0.62, h * 0.86, h * 0.56, 0.4, "#c6d2b8");
          g.fillStyle = "#d9a184";
          g.beginPath(); g.arc(w * 0.7, h * 0.3, w * 0.06, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#9a9590";
          for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(w * (0.16 + (i % 3) * 0.04), h * (0.2 + Math.floor(i / 3) * 0.07), 3, 0, Math.PI * 2); g.fill(); }
        },
        (g: CanvasRenderingContext2D, w: number, h: number) => {
          mat(g, w, h);
          g.save(); g.beginPath(); g.rect(w * 0.08, h * 0.1, w * 0.84, h * 0.8); g.clip();
          g.fillStyle = "#e9c46a";
          g.beginPath(); g.arc(w * 0.5, h * 0.52, w * 0.12, 0, Math.PI * 2); g.fill();
          const hill = (cy: number, amp: number, phase: number, c: string) => {
            g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
            for (let x = 0; x <= w; x += 4) g.lineTo(x, cy + Math.sin(x / w * Math.PI * 2 + phase) * amp);
            g.lineTo(w, h); g.fill();
          };
          hill(h * 0.6, h * 0.06, 0.4, "#c6d2b8");
          hill(h * 0.7, h * 0.05, 2.2, "#a9bd9c");
          hill(h * 0.8, h * 0.04, 4.1, "#d6c3a8");
          g.restore();
        },
      ];
      const frameMat = [oak(), M.paint(WHITE, 0.45), M.wood(OAK_DEEP)][v] ?? oak();
      return framed(`nordic:print:${v}`, 1.4, 0.92, frameMat, draws[v] ?? draws[0]!, 0.045, 0.045);
    },
  },

  // ---------- Ceiling ----------
  {
    id: "globe-pendant", name: "Globe Pendant", series: "nordic", category: "ceiling", kind: "ceiling", size: [1, 1],
    variants: [{ name: "Milk White", swatch: "#fbf6ee" }, { name: "Smoke", swatch: "#cfcfcb" }, { name: "Sage", swatch: "#cfdcc4" }, { name: "Three Globes", swatch: "#f3ece0" }],
    light: { at: [0, -0.74, 0], color: "#ffe2a8", intensity: 5, distance: 5.5, halo: 1.3, startsOn: true },
    build(v) {
      const brass = M.metal("#d8b26a", 0.35);
      const cordMat = M.paint("#ece6dc", 0.6);
      const globe = (p: V3, r: number, tint: string, strength: number, drop: number) => {
        // Opal glass: a sphere open only under the socket, lit from inside.
        const prof: Array<[number, number]> = [];
        for (let i = 0; i <= 16; i++) {
          const a = -Math.PI / 2 + (i / 16) * (Math.PI - 0.32);
          prof.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        const g = dome(prof, tint, "#ffe2a8", strength);
        g.position.set(...p);
        return [
          K.part(K.puck(0.07, 0.03, 0.012, 24), cordMat, { p: [p[0], -0.03, p[2]] }),
          K.part(K.rod([p[0], -0.02, p[2]], [p[0], p[1] + r + 0.05, p[2]], 0.01, 8), cordMat),
          K.part(K.lathe([[0, 0], [0.05, 0], [0.055, 0.03], [0.04, 0.07], [0.02, 0.08], [0, 0.08]], 24), brass, { p: [p[0], p[1] + r - 0.03, p[2]] }),
          g,
          bulb([p[0], p[1] - drop, p[2]], r * 0.3),
        ];
      };
      if (v === 3) {
        return K.group([
          ...globe([0.16, -0.62, -0.1], 0.15, "#fbf6ee", 0.9, 0),
          ...globe([-0.18, -0.74, -0.04], 0.16, "#fbf6ee", 0.9, 0),
          ...globe([0.02, -0.84, 0.18], 0.13, "#fbf6ee", 0.9, 0),
        ]);
      }
      const tint = ["#fbf6ee", "#cfcfcb", "#d3e0c8"][v] ?? "#fbf6ee";
      const strength = [0.95, 0.6, 0.85][v] ?? 0.95;
      return K.group(globe([0, -0.74, 0], 0.22, tint, strength, 0));
    },
  },

  // ---------- Rugs ----------
  {
    id: "wool-rug", name: "Wool Rug", series: "nordic", category: "rug", kind: "rug", size: [3, 2],
    variants: [{ name: "Oatmeal", swatch: "#efe7d8" }, { name: "Sage", swatch: "#b3c3a3" }, { name: "Mist Grey", swatch: "#c8c8c3" }],
    build(v) {
      const sets = [["#f2ebdd", "#8d857b", "#d9cdb8"], ["#b9c8aa", "#f4efe4", "#a3b591"], ["#cfcfca", "#f6f3ec", "#b8b8b2"]];
      const [bg, line, band] = sets[v] ?? sets[0]!;
      const body = rug(`nordic:wool:${v}`, 2.74, 1.84, 0.16, (g, w, h) => {
        g.fillStyle = bg!;
        g.fillRect(0, 0, w, h);
        g.fillStyle = band!;
        g.fillRect(0, h * 0.06, w, h * 0.035);
        g.fillRect(0, h * 0.905, w, h * 0.035);
        // A berber lattice of soft diamonds.
        g.strokeStyle = line!;
        g.lineWidth = 7;
        g.lineCap = "round";
        g.lineJoin = "round";
        const cells = 7;
        const cw = w / cells;
        const top = h * 0.16, bot = h * 0.84;
        for (const [y0, y1] of [[top, (top + bot) / 2], [(top + bot) / 2, bot]] as const) {
          g.beginPath();
          for (let i = 0; i <= cells; i++) {
            g.lineTo(i * cw, y0);
            if (i < cells) g.lineTo(i * cw + cw / 2, y1);
          }
          g.stroke();
          g.beginPath();
          for (let i = 0; i <= cells; i++) {
            g.lineTo(i * cw, y1);
            if (i < cells) g.lineTo(i * cw + cw / 2, y0);
          }
          g.stroke();
        }
        g.fillStyle = line!;
        for (let i = 0; i < cells; i++) {
          for (const yy of [top + (bot - top) * 0.25, top + (bot - top) * 0.75]) {
            g.beginPath(); g.arc(i * cw + cw / 2, yy, 6, 0, Math.PI * 2); g.fill();
          }
        }
      }, 0.04);
      // Tassels along the short ends.
      const fringe = M.fabric(bg!, 0.5);
      const tassels: THREE.Object3D[] = [];
      for (let i = 0; i < 16; i++) {
        const z = -0.78 + (i / 15) * 1.56;
        for (const s of [-1, 1]) tassels.push(K.part(K.rod([s * 1.33, 0.014, z], [s * 1.455, 0.014, z + ((i % 3) - 1) * 0.008], 0.013, 6), fringe));
      }
      return K.group([body, ...tassels]);
    },
  },
];
