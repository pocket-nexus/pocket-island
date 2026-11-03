// Rattan series: woven rattan, polished cane, natural linen and tropical greens —
// an island holiday. Most pieces come in four rattans, each with its own
// cushion colour.

import * as THREE from "three";
import { K, M, bulb, cushion, dome, knob, pot, rug } from "./common.ts";
import { drawn } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

type V3 = K.V3;
type P2 = [number, number];

const CANES = [
  { name: "Natural Rattan", swatch: "#d8b07a", cane: "#ddb57f", rim: "#b8864f", wood: "#cfa16b", cushion: "#f4ede0", accent: "#e39a74", stand: "#f2ece0" },
  { name: "Honey Rattan", swatch: "#c48c52", cane: "#c99258", rim: "#93623a", wood: "#a8743f", cushion: "#bcd2a8", accent: "#ecc46a", stand: "#5d4c40" },
  { name: "White Rattan", swatch: "#efe3cb", cane: "#f1e7d3", rim: "#d3bd96", wood: "#ece3d2", cushion: "#f6b19a", accent: "#9fcb92", stand: "#f2ece0" },
  { name: "Dark Rattan", swatch: "#9a6b45", cane: "#a8784c", rim: "#70492b", wood: "#7f5534", cushion: "#93c8cc", accent: "#f4ede0", stand: "#5d4c40" },
];
const variants = CANES.map(({ name, swatch }) => ({ name, swatch }));
const C = (v: number) => CANES[v] ?? CANES[0]!;
type Cane = (typeof CANES)[number];

/** The woven body, and the smooth polished cane for frames, rims and legs. */
const weave = (c: Cane) => M.rattan(c.cane);
const cane = (c: Cane) => M.gloss(c.rim, 0.42);
const LINEN = "#f7f2e8";

// ---------- Paths and shapes ----------

function arcPts(cx: number, cz: number, r: number, a0: number, a1: number, n = 8): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** A closed loop round a w×d rectangle with its corners rounded by r, as points at height y. */
function loop(w: number, d: number, r: number, y: number, cz = 0): V3[] {
  const x0 = -w / 2, x1 = w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const pts: P2[] = [
    ...arcPts(x0 + r, z1 - r, r, Math.PI, Math.PI / 2),
    ...arcPts(x1 - r, z1 - r, r, Math.PI / 2, 0),
    ...arcPts(x1 - r, z0 + r, r, 0, -Math.PI / 2),
    ...arcPts(x0 + r, z0 + r, r, -Math.PI / 2, -Math.PI),
  ];
  pts.push(pts[0]!, pts[1]!);
  return pts.map(([x, z]) => [x, y, z] as V3);
}

/** A circle of points at height y, closed with an overlap so a tube's ends meet. */
function ring(r: number, y: number, n = 36, cz = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n + 1; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([Math.sin(a) * r, y, cz + Math.cos(a) * r]);
  }
  return out;
}

/** A torus lying flat. */
function hoop(r: number, tube: number, mat: THREE.Material, p: V3): THREE.Mesh {
  return K.part(K.boxUV(new THREE.TorusGeometry(r, tube, 8, 48), 1, "y"), mat, { p, r: [Math.PI / 2, 0, 0] });
}

/** A short woven binding round a cane where two pieces meet. */
function binding(p: V3, r: number, h: number, mat: THREE.Material): THREE.Mesh {
  return K.part(K.puck(r, h, Math.min(0.012, h / 3), 16), mat, { p: [p[0], p[1] - h / 2, p[2]] });
}

/** Points along a smooth profile, resampled to n rows. */
function smoothProfile(pts: P2[], n: number): P2[] {
  return new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(n - 1).map((p) => [p.x, p.y] as P2);
}

/**
 * A woven shell turned round Y from `profile` rings [radius, y], bottom to
 * top, `thick` deep, with an opening at the front `gap(t, y)` radians wide
 * (t runs 0..1 up the rows). Returns the geometry and the line of its open
 * edge, for a rolled cane rim.
 */
function shell(profile: P2[], gap: (t: number, y: number) => number, thick: number, seg = 56): { geo: THREE.BufferGeometry; rim: V3[] } {
  const R = profile.length, cols = seg + 1;
  const gaps = profile.map(([, y], j) => Math.max(0, gap(j / (R - 1), y)));
  const pos: number[] = [];
  const normal2 = (j: number): P2 => {
    const a = profile[Math.max(0, j - 1)]!, b = profile[Math.min(R - 1, j + 1)]!;
    const dr = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  };
  for (const inner of [false, true]) {
    for (let j = 0; j < R; j++) {
      let [r, y] = profile[j]!;
      if (inner) {
        const [nr, ny] = normal2(j);
        r = Math.max(0, r - nr * thick);
        y -= ny * thick;
      }
      const g = gaps[j]!;
      for (let i = 0; i <= seg; i++) {
        const a = g / 2 + (Math.PI * 2 - g) * (i / seg);
        pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      }
    }
  }
  const O = (j: number, i: number) => j * cols + i;
  const I = (j: number, i: number) => (R + j) * cols + i;
  const idx: number[] = [];
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < seg; i++) {
      idx.push(O(j, i), O(j, i + 1), O(j + 1, i), O(j, i + 1), O(j + 1, i + 1), O(j + 1, i));
      idx.push(I(j, i), I(j + 1, i), I(j, i + 1), I(j, i + 1), I(j + 1, i), I(j + 1, i + 1));
    }
    if (gaps[j]! > 1e-3 || gaps[j + 1]! > 1e-3) {
      idx.push(O(j, 0), O(j + 1, 0), I(j, 0), O(j + 1, 0), I(j + 1, 0), I(j, 0));
      idx.push(O(j, seg), I(j, seg), O(j + 1, seg), O(j + 1, seg), I(j, seg), I(j + 1, seg));
    }
  }
  const lip = (j: number, up: boolean) => {
    for (let i = 0; i < seg; i++) {
      const o0 = O(j, i), o1 = O(j, i + 1), i0 = I(j, i), i1 = I(j, i + 1);
      if (up) idx.push(o0, o1, i0, o1, i1, i0);
      else idx.push(o0, i0, o1, o1, i0, i1);
    }
  };
  if (profile[R - 1]![0] > 1e-3) lip(R - 1, true);
  if (profile[0]![0] > 1e-3) lip(0, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Where the shell is closed, the first and last columns meet: smooth the seam.
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (let j = 0; j < R; j++) {
    if (gaps[j]! > 1e-3) continue;
    for (const [a, b] of [[O(j, 0), O(j, seg)], [I(j, 0), I(j, seg)]] as Array<[number, number]>) {
      const n = new THREE.Vector3(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
      nor.setXYZ(a, n.x, n.y, n.z);
      nor.setXYZ(b, n.x, n.y, n.z);
    }
  }
  K.boxUV(geo, 1);
  // The rim: up one side of the opening, round the top if it is open, down the other.
  const mid = (j: number, i: number): V3 => {
    const o = O(j, i) * 3, n = I(j, i) * 3;
    return [(pos[o]! + pos[n]!) / 2, (pos[o + 1]! + pos[n + 1]!) / 2, (pos[o + 2]! + pos[n + 2]!) / 2];
  };
  const rim: V3[] = [];
  const j0 = gaps.findIndex((g) => g > 1e-3);
  if (j0 >= 0) {
    let j1 = R - 1;
    while (gaps[j1]! <= 1e-3) j1--;
    const topOpen = j1 === R - 1 && profile[R - 1]![0] > 1e-3;
    const lo = Math.max(0, j0 - 1), hi = topOpen ? R - 1 : Math.min(R - 1, j1 + 1);
    for (let j = lo; j <= hi; j++) rim.push(mid(j, 0));
    if (topOpen) for (let i = 2; i < seg - 1; i += 2) rim.push(mid(R - 1, i));
    for (let j = topOpen ? hi : hi - 1; j >= lo; j--) rim.push(mid(j, seg));
  }
  return { geo, rim };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- Prints ----------

function frond(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, col: string): void {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  g.strokeStyle = col;
  g.lineCap = "round";
  g.lineWidth = len * 0.035;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(ex, ey);
  g.stroke();
  g.lineWidth = len * 0.05;
  for (let i = 2; i < 15; i++) {
    const t = i / 15;
    const px = x + (ex - x) * t, py = y + (ey - y) * t;
    const l = len * 0.34 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + len * 0.04;
    for (const side of [-1, 1]) {
      const a = ang + side * 0.75;
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + Math.cos(a) * l * 0.6, py + Math.sin(a) * l * 0.6 - l * 0.05, px + Math.cos(a + side * 0.25) * l, py + Math.sin(a + side * 0.25) * l);
      g.stroke();
    }
  }
}

function palmPrint(): THREE.Texture {
  return drawn("rattan:palm", 320, 180, (g, w, h) => {
    const bg = "#f8f2e4";
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    frond(g, w * 0.16, h * 0.86, h * 0.72, -1.15, "#5d9e5c");
    frond(g, w * 0.5, h * 0.92, h * 0.78, -1.62, "#3f7f4c");
    frond(g, w * 0.84, h * 0.86, h * 0.7, -2.0, "#6aab62");
    frond(g, w * 0.3, h * 0.12, h * 0.42, 0.55, "#7cb86c");
    frond(g, w * 0.72, h * 0.14, h * 0.4, 2.55, "#4f9256");
    g.strokeStyle = bg;
    g.lineWidth = 22;
    g.strokeRect(0, 0, w, h);
  });
}

// ---------- Items ----------

export const RATTAN: FurnitureDef[] = [
  {
    id: "rattan-bed", name: "Rattan Bed", series: "rattan", category: "bed", kind: "floor", size: [2, 2], variants,
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const rx = 0.84, ry = 0.82, by = 0.54, fz = -0.9;
      const fan = new THREE.Shape();
      fan.moveTo(rx, 0);
      fan.absellipse(0, 0, rx, ry, 0, Math.PI, false, 0);
      fan.lineTo(rx, 0);
      const arc: V3[] = [];
      for (let i = 0; i <= 28; i++) {
        const a = (Math.PI * i) / 28;
        arc.push([Math.cos(a) * rx, by + Math.sin(a) * ry, fz]);
      }
      const parts: THREE.Object3D[] = [
        // A woven base with rolled rims on short cane legs.
        K.part(K.rbox(1.84, 0.26, 1.7, 0.05), w, { p: [0, 0.27, 0.06] }),
        K.part(K.tube(loop(1.86, 1.72, 0.08, 0.4, 0.06), 0.028, 96, 8), k),
        K.part(K.tube(loop(1.86, 1.72, 0.08, 0.15, 0.06), 0.024, 96, 8), k),
        ...K.corners(1.66, 1.56).map(([x, , z]) => K.part(K.lathe([[0, 0], [0.04, 0], [0.05, 0.08], [0.055, 0.15], [0, 0.15]], 16), k, { p: [x, 0, z + 0.06] })),
        // A peacock-fan headboard: woven panel, cane frame and ribs.
        K.part(K.extrude(fan, 0.05, 0.015), w, { p: [0, by, fz] }),
        K.part(K.tube(arc, 0.042, 72, 10), k),
        K.part(K.rod([-rx, by, fz], [rx, by, fz], 0.04), k),
        K.part(K.puck(0.15, 0.05, 0.02, 32), k, { p: [0, by, fz + 0.01], r: [Math.PI / 2, 0, 0] }),
        ...[-1, 1].map((s) => K.part(K.rod([s * rx, 0.045, fz], [s * rx, by + 0.04, fz], 0.045), k)),
        ...[-1, 1].map((s) => K.part(new THREE.SphereGeometry(0.055, 16, 12), k, { p: [s * rx, by + 0.08, fz] })),
        // White linen, a terracotta throw, and a palm-print pillow.
        cushion([0, 0.5, 0.06], 1.74, 0.2, 1.68, M.fabric("#fbf8f0", 0.5), [0, 0, 0], 0.22, 0.1),
        cushion([0, 0.545, 0.33], 1.84, 0.24, 1.24, M.fabric(LINEN, 0.55), [0, 0, 0], 0.25, 0.08),
        cushion([0, 0.65, -0.27], 1.86, 0.1, 0.2, M.fabric("#fbf8f0", 0.5), [0, 0, 0], 0.4, 0),
        cushion([0, 0.68, 0.64], 1.88, 0.07, 0.44, M.fabric(c.accent, 0.7), [0, 0, 0], 0.2, 0.05),
        cushion([-0.42, 0.7, -0.6], 0.68, 0.18, 0.37, M.fabric("#fffaf2", 0.5), [-0.2, 0, 0.03], 0.45, 0.6),
        K.part(K.planarUV(K.soft(0.64, 0.17, 0.36, 0.45, 0.6, 36), 0.64, 0.36, "y"), M.printedCloth("rattan:palm", palmPrint(), false), { p: [0.4, 0.71, -0.57], r: [-0.25, 0, -0.04] }),
        cushion([0.02, 0.71, -0.4], 0.46, 0.15, 0.16, M.fabric(c.cushion, 0.7), [-0.3, 0, 0], 0.5, 0.4),
      ];
      for (let i = 1; i < 8; i++) {
        const a = (Math.PI * i) / 8;
        parts.push(K.part(K.rod([Math.cos(a) * 0.12, by + Math.sin(a) * 0.12, fz + 0.035], [Math.cos(a) * (rx - 0.03), by + Math.sin(a) * (ry - 0.03), fz + 0.035], 0.017, 8), k));
      }
      return K.group(parts);
    },
  },
  {
    id: "rattan-nightstand", name: "Rattan Nightstand", series: "rattan", category: "storage", kind: "floor", size: [1, 1], variants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.7 },
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const wood = M.wood(c.wood);
      return K.group([
        ...K.corners(0.62, 0.56).map(([x, , z]) => K.part(K.rod([x, 0.16, z], [x * 1.1, 0.03, z * 1.12], 0.03, 10), k)),
        K.part(K.rbox(0.07, 0.5, 0.72, 0.03), w, { p: [-0.355, 0.4, -0.01] }),
        K.part(K.rbox(0.07, 0.5, 0.72, 0.03), w, { p: [0.355, 0.4, -0.01] }),
        K.part(K.rbox(0.68, 0.5, 0.05, 0.02), w, { p: [0, 0.4, -0.345] }),
        K.part(K.rbox(0.78, 0.05, 0.74, 0.02), wood, { p: [0, 0.17, -0.01] }),
        K.part(K.rbox(0.68, 0.04, 0.7, 0.015), wood, { p: [0, 0.41, -0.01] }),
        ...[-1, 1].map((s) => K.part(K.rod([s * 0.36, 0.16, 0.34], [s * 0.36, 0.64, 0.34], 0.026, 10), k)),
        // A drawer with a woven front, and two rolled towels below.
        K.part(K.rbox(0.66, 0.2, 0.04, 0.02), wood, { p: [0, 0.53, 0.33] }),
        K.part(K.rbox(0.56, 0.12, 0.03, 0.012), w, { p: [0, 0.53, 0.345] }),
        knob([0, 0.53, 0.36], M.wood(c.rim), 0.032),
        K.part(K.rod([-0.25, 0.272, 0.2], [-0.05, 0.272, 0.19], 0.072), M.fabric(LINEN, 0.6)),
        K.part(K.rod([0.04, 0.272, 0.12], [0.25, 0.272, 0.14], 0.072), M.fabric(c.accent, 0.6)),
        K.part(K.rbox(0.84, 0.06, 0.8, 0.025), wood, { p: [0, 0.665, 0] }),
        K.part(K.tube(loop(0.86, 0.82, 0.06, 0.67), 0.03, 80, 8), k),
      ]);
    },
  },
  {
    id: "rattan-armchair", name: "Rattan Armchair", series: "rattan", category: "seat", kind: "floor", size: [1, 1], variants,
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const base = shell(smoothProfile([[0.31, 0.12], [0.35, 0.2], [0.375, 0.32], [0.385, 0.42]], 10), () => 0, 0.035, 48);
      const backGap = (_t: number, y: number) => 2.2 + 1.3 * smooth(0.62, 0.7, y) + 1.0 * smooth(0.7, 0.9, y);
      const back = shell(smoothProfile([[0.385, 0.42], [0.395, 0.58], [0.41, 0.78], [0.418, 0.95]], 44), backGap, 0.04, 64);
      return K.group([
        ...K.corners(0.44, 0.4).map(([x, , z]) => K.part(K.rod([x, 0.14, z], [x * 1.18, 0.03, z * 1.2], 0.03, 10), k)),
        K.part(base.geo, w),
        K.part(K.tube(ring(0.385, 0.42), 0.028, 80, 8), k),
        K.part(K.tube(ring(0.31, 0.12), 0.024, 64, 8), k),
        K.part(back.geo, w),
        K.part(K.tube(back.rim, 0.032, 160, 10), k),
        cushion([0, 0.48, 0.03], 0.7, 0.15, 0.68, M.fabric(c.cushion, 0.7), [0, 0, 0], 0.7, 0.25),
        cushion([0, 0.7, -0.25], 0.52, 0.36, 0.14, M.fabric(c.cushion, 0.7), [-0.22, 0, 0], 0.45, 0.4),
        cushion([0.13, 0.63, -0.12], 0.26, 0.24, 0.09, M.fabric(c.accent, 0.7), [-0.3, -0.3, -0.2], 0.5, 0.4),
      ]);
    },
  },
  {
    id: "rattan-low-table", name: "Rattan Low Table", series: "rattan", category: "table", kind: "floor", size: [2, 1], variants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 0.45 },
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const wrap = M.rattan(c.rim);
      const parts: THREE.Object3D[] = [
        K.part(K.extrude(K.roundedRectShape(1.76, 0.78, 0.3), 0.05, 0.015), w, { p: [0, 0.42, 0], r: [-Math.PI / 2, 0, 0] }),
        K.part(K.tube(loop(1.8, 0.82, 0.32, 0.42), 0.03, 120, 10), k),
        K.part(K.extrude(K.roundedRectShape(1.46, 0.52, 0.14), 0.04, 0.012), w, { p: [0, 0.13, 0], r: [-Math.PI / 2, 0, 0] }),
        K.part(K.tube(loop(1.5, 0.56, 0.16, 0.13), 0.022, 100, 8), k),
      ];
      for (const [x, , z] of K.corners(1.4, 0.5)) {
        const sx = Math.sign(x), sz = Math.sign(z);
        parts.push(K.part(K.rod([x, 0.41, z], [x + sx * 0.05, 0.034, z + sz * 0.05], 0.034, 10), k));
        parts.push(binding([x + sx * 0.003, 0.37, z + sz * 0.003], 0.046, 0.06, wrap));
        parts.push(binding([x + sx * 0.04, 0.13, z + sz * 0.04], 0.046, 0.06, wrap));
      }
      return K.group(parts);
    },
  },
  {
    id: "rattan-cabinet", name: "Rattan Cabinet", series: "rattan", category: "storage", kind: "floor", size: [2, 1], variants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 0.88 },
    build(v) {
      const c = C(v);
      const w = weave(c);
      const wood = M.wood(c.wood);
      const trim = M.wood(c.rim);
      const parts: THREE.Object3D[] = [
        ...K.corners(1.64, 0.56).map(([x, , z]) => K.part(K.lathe([[0, 0], [0.028, 0], [0.04, 0.14], [0.045, 0.18], [0, 0.18]], 16), wood, { p: [x, 0, z - 0.03] })),
        K.part(K.rbox(1.86, 0.68, 0.78, 0.04), wood, { p: [0, 0.5, -0.03] }),
        K.part(K.rbox(1.92, 0.05, 0.86, 0.022), wood, { p: [0, 0.855, -0.02] }),
        K.part(K.rbox(1.88, 0.04, 0.82, 0.015), trim, { p: [0, 0.17, -0.03] }),
      ];
      // Two arched cane doors, three drawers between.
      for (const s of [-1, 1]) {
        parts.push(K.part(K.rbox(0.6, 0.6, 0.04, 0.02), wood, { p: [s * 0.62, 0.5, 0.37] }));
        parts.push(K.part(K.extrude(K.archShape(0.46, 0.5, -0.25), 0.03, 0.01), trim, { p: [s * 0.62, 0.49, 0.385] }));
        parts.push(K.part(K.extrude(K.archShape(0.4, 0.44, -0.22), 0.03, 0.008), w, { p: [s * 0.62, 0.49, 0.395] }));
        parts.push(knob([s * 0.37, 0.5, 0.39], trim, 0.03));
      }
      for (const y of [0.71, 0.5, 0.29]) {
        parts.push(K.part(K.rbox(0.56, 0.18, 0.04, 0.02), wood, { p: [0, y, 0.37] }));
        parts.push(K.part(K.rbox(0.46, 0.1, 0.02, 0.008), w, { p: [0, y, 0.39] }));
        parts.push(knob([0, y, 0.4], trim, 0.028));
      }
      return K.group(parts);
    },
  },
  {
    id: "rattan-floor-lamp", name: "Rattan Floor Lamp", series: "rattan", category: "lamp", kind: "floor", size: [1, 1], variants,
    light: { at: [0, 1.36, 0], color: "#ffe2b0", intensity: 4, distance: 4.5, halo: 1.3, startsOn: true },
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const parts: THREE.Object3D[] = [
        K.part(K.lathe([[0, 0], [0.21, 0], [0.22, 0.03], [0.18, 0.08], [0.07, 0.11], [0.03, 0.12], [0, 0.12]], 36), w),
        K.part(K.tube(ring(0.215, 0.025), 0.02, 64, 8), k),
        K.part(K.rod([0, 0.1, 0], [0, 1.16, 0], 0.022), k),
        ...[0.42, 0.78].map((y) => K.part(K.puck(0.03, 0.025, 0.01, 12), k, { p: [0, y, 0] })),
        K.part(K.puck(0.045, 0.03, 0.012, 16), k, { p: [0, 1.12, 0] }),
      ];
      // A paper globe that lights up, caged in rattan hoops.
      const globe = K.part(new THREE.SphereGeometry(0.2, 32, 22), M.glow("#ffe2a8", "#fbf1dc", 0.8, 0.8), { p: [0, 1.36, 0] });
      globe.castShadow = false;
      parts.push(globe);
      for (let i = 0; i < 10; i++) {
        parts.push(K.part(K.boxUV(new THREE.TorusGeometry(0.235, 0.012, 6, 48), 1, "y"), k, { p: [0, 1.36, 0], r: [0, (i / 10) * Math.PI, 0] }));
      }
      for (const y of [-0.12, 0, 0.12]) parts.push(hoop(Math.sqrt(0.235 ** 2 - y * y), 0.012, k, [0, 1.36 + y, 0]));
      parts.push(K.part(K.lathe([[0, 0], [0.04, 0], [0.03, 0.03], [0, 0.04]], 12), k, { p: [0, 1.59, 0] }));
      parts.push(bulb([0, 1.36, 0], 0.06));
      return K.group(parts);
    },
  },
  {
    id: "rattan-hanging-chair", name: "Hanging Rattan Chair", series: "rattan", category: "seat", kind: "floor", size: [1.5, 1.5], variants,
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const stand = M.gloss(c.stand, 0.35);
      const y0 = 0.36, H = 1.3, R = 0.48;
      const rows: P2[] = [];
      for (let j = 0; j <= 40; j++) {
        const s = j / 40;
        rows.push([R * Math.sin(Math.PI * s) * (1 + 0.12 * Math.cos(Math.PI * s)), y0 + (H * (1 - Math.cos(Math.PI * s))) / 2]);
      }
      const egg = shell(rows, (t) => {
        const u = (t - 0.27) / (0.86 - 0.27);
        return u <= 0 || u >= 1 ? 0 : 2.7 * Math.pow(Math.sin(Math.PI * u), 0.45);
      }, 0.045, 64);
      const pole: V3[] = [[0, 0.06, -0.5], [0, 0.5, -0.62], [0, 1.2, -0.66], [0, 1.75, -0.56], [0, 2.02, -0.3], [0, 2.08, -0.06], [0, 2.03, 0.03]];
      const parts: THREE.Object3D[] = [
        K.part(K.lathe([[0, 0], [0.44, 0], [0.45, 0.02], [0.43, 0.05], [0.12, 0.075], [0, 0.075]], 48), stand),
        K.part(K.tube(pole, 0.038, 64, 12), stand),
        K.part(egg.geo, w, { p: [0, 0, 0.04] }),
        K.group([K.part(K.tube(egg.rim, 0.034, 200, 10), k)], { p: [0, 0, 0.04] }),
        K.part(K.lathe([[0, 0], [0.06, 0.0], [0.05, 0.03], [0.02, 0.05], [0, 0.05]], 20), k, { p: [0, y0 + H - 0.03, 0.04] }),
        // Cushions inside the egg.
        cushion([0, 0.63, 0.06], 0.72, 0.16, 0.66, M.fabric(c.cushion, 0.7), [0, 0, 0], 0.7, 0.25),
        cushion([0, 0.96, -0.26], 0.56, 0.5, 0.16, M.fabric(c.cushion, 0.7), [-0.25, 0, 0], 0.45, 0.35),
        cushion([0.16, 0.83, -0.12], 0.3, 0.28, 0.1, M.fabric(c.accent, 0.7), [-0.25, -0.3, -0.25], 0.5, 0.4),
      ];
      // A short chain from the hook.
      for (let i = 0; i < 5; i++) {
        parts.push(K.part(K.boxUV(new THREE.TorusGeometry(0.026, 0.01, 6, 16), 1), stand, { p: [0, 1.98 - i * 0.055, 0.04], r: [0, (i % 2) * (Math.PI / 2), 0] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "bird-of-paradise", name: "Bird of Paradise", series: "rattan", category: "plant", kind: "floor", size: [1, 1],
    variants: [{ name: "Rattan Pot", swatch: "#d6ae78" }, { name: "White Ceramic Pot", swatch: "#f3efe6" }, { name: "Terracotta Pot", swatch: "#c97a52" }],
    build(v) {
      const parts: THREE.Object3D[] = [];
      let top: number;
      if (v === 0) {
        const basket = K.lathe([[0, 0], [0.22, 0], [0.25, 0.03], [0.29, 0.2], [0.3, 0.38], [0.3, 0.42], [0.27, 0.42], [0.27, 0.36], [0, 0.36]], 40);
        parts.push(K.part(basket, M.rattan("#d6ae78")));
        parts.push(hoop(0.288, 0.024, M.gloss("#a87a48", 0.42), [0, 0.42, 0]));
        parts.push(hoop(0.25, 0.02, M.gloss("#a87a48", 0.42), [0, 0.03, 0]));
        parts.push(K.part(K.puck(0.275, 0.02, 0.008, 32), M.paint("#6b4a33", 0.95), { p: [0, 0.38, 0] }));
        top = 0.4;
      } else {
        const made = pot(0.28, 0.44, v === 1 ? M.ceramic("#f3efe6") : M.paint("#c97a52", 0.7));
        parts.push(...made.parts);
        top = made.top;
      }
      const leafA = M.leaf("#3f8a4e"), leafB = M.leaf("#52a25b");
      const stem = M.paint("#5f9a4c");
      // Paddle leaves in a flat two-sided fan, the inner ones tall and
      // upright, the outer ones shorter and leaning out.
      for (let i = 0; i < 10; i++) {
        const s = i % 2 ? 1 : -1, k = Math.floor(i / 2);
        const len = 0.8 - k * 0.11, th = 0.06 + k * 0.11;
        const dz = (k % 2 ? 0.05 : -0.04) * s;
        const tip: V3 = [s * Math.sin(th) * len, top + Math.cos(th) * len, dz];
        parts.push(K.part(K.tube([[0, top - 0.02, 0], [tip[0] * 0.35, top + Math.cos(th) * len * 0.55, dz * 0.5], tip], 0.014, 16, 6), stem));
        const l = K.part(K.leafGeometry(0.5 - Math.max(0, k - 1) * 0.035, 0.27, 0.16, -0.08, "oval"), i % 3 ? leafA : leafB);
        l.rotation.order = "YXZ";
        l.rotation.set(-(Math.PI / 2 - th - 0.2), s * (Math.PI / 2) + (dz > 0 ? -0.25 : 0.25) * s, 0);
        l.position.set(...tip);
        parts.push(l);
      }
      // Two flowers: a beak, orange crests and a blue tongue.
      const orange = M.leaf("#f8962e"), blue = M.leaf("#4f6fd0"), beak = M.paint("#6f8f5c", 0.55);
      for (const [a, h] of [[0.45, 0.66], [2.7, 0.56]] as P2[]) {
        const tip: V3 = [Math.cos(a) * 0.07, top + h, 0.06 + Math.sin(a) * 0.05];
        parts.push(K.part(K.tube([[0, top - 0.02, 0], [tip[0] * 0.5, top + h * 0.6, tip[2] * 0.5], tip], 0.012, 12, 6), stem));
        const flower: THREE.Object3D[] = [
          K.part(K.lathe([[0, 0], [0.024, 0.02], [0.028, 0.07], [0.018, 0.15], [0, 0.21]], 12), beak, { r: [0, 0, -Math.PI / 2 + 0.25] }),
        ];
        for (let k = 0; k < 3; k++) {
          const s = K.part(K.leafGeometry(0.17 - k * 0.02, 0.045, 0.3, 0.15, "long"), orange);
          s.rotation.order = "YXZ";
          s.rotation.set(-1.05 - k * 0.12, Math.PI / 2 + 0.5 - k * 0.3, 0);
          s.position.set(0.04, 0.02, 0);
          flower.push(s);
        }
        const tongue = K.part(K.leafGeometry(0.11, 0.035, 0.3, 0.1, "long"), blue);
        tongue.rotation.order = "YXZ";
        tongue.rotation.set(-0.7, Math.PI / 2 + 0.1, 0);
        tongue.position.set(0.05, 0.03, 0.01);
        flower.push(tongue);
        parts.push(K.group(flower, { p: tip, r: [0, -a, 0], s: 1.8 }));
      }
      return K.group(parts);
    },
  },
  {
    id: "rattan-basket", name: "Rattan Basket", series: "rattan", category: "storage", kind: "misc", size: [1, 1], variants,
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const basket = K.lathe([[0, 0], [0.16, 0], [0.19, 0.03], [0.215, 0.12], [0.215, 0.22], [0.2, 0.3], [0.19, 0.32], [0.17, 0.32], [0.18, 0.29], [0.195, 0.22], [0.195, 0.12], [0.17, 0.045], [0, 0.045]], 40);
      const handle = (s: number) => K.part(K.tube([[s * 0.19, 0.24, -0.08], [s * 0.245, 0.27, -0.06], [s * 0.262, 0.3, 0], [s * 0.245, 0.27, 0.06], [s * 0.19, 0.24, 0.08]], 0.017, 24, 8), k);
      return K.group([
        K.part(basket, w),
        hoop(0.183, 0.022, k, [0, 0.32, 0]),
        hoop(0.17, 0.016, k, [0, 0.02, 0]),
        handle(-1),
        handle(1),
        // A folded blanket, one end hanging over the rim.
        cushion([0, 0.33, -0.01], 0.32, 0.13, 0.3, M.fabric(c.accent, 0.7), [0.1, 0.3, 0], 0.45, 0.3),
        cushion([0.02, 0.27, 0.19], 0.24, 0.17, 0.05, M.fabric(c.accent, 0.7), [-0.35, 0, 0.05], 0.5, 0.2),
        cushion([-0.04, 0.39, -0.04], 0.24, 0.07, 0.2, M.fabric(LINEN, 0.6), [0.05, -0.4, 0], 0.4, 0.3),
      ]);
    },
  },
  {
    id: "ceiling-fan", name: "Rattan Ceiling Fan", series: "rattan", category: "ceiling", kind: "ceiling", size: [2, 2], variants,
    light: { at: [0, -0.6, 0], color: "#ffe2b0", intensity: 5, distance: 5.5, halo: 1.2, startsOn: true },
    build(v) {
      const c = C(v);
      const w = weave(c), k = cane(c);
      const wood = M.wood(c.wood);
      const bladeShape = K.roundedRectShape(0.62, 0.22, 0.1);
      const outline = bladeShape.getSpacedPoints(48).map((p) => [p.x, 0, -p.y] as V3);
      outline.push(outline[0]!, outline[1]!);
      const parts: THREE.Object3D[] = [
        K.part(K.lathe([[0, -0.07], [0.1, -0.07], [0.12, -0.05], [0.115, -0.02], [0.09, 0], [0, 0]], 32), wood),
        K.part(K.rod([0, -0.05, 0], [0, -0.37, 0], 0.022), k),
        K.part(K.lathe([[0, -0.53], [0.1, -0.53], [0.15, -0.5], [0.172, -0.45], [0.155, -0.4], [0.09, -0.365], [0, -0.355]], 40), wood),
        K.part(K.puck(0.176, 0.05, 0.015, 40), w, { p: [0, -0.48, 0] }),
        dome([[0, -0.71], [0.06, -0.705], [0.11, -0.67], [0.135, -0.61], [0.13, -0.56], [0.11, -0.53]], "#fff8ea", "#ffe2a8", 0.9),
        bulb([0, -0.6, 0], 0.05),
      ];
      for (let i = 0; i < 5; i++) {
        const blade = K.group([
          K.part(K.extrude(bladeShape, 0.026, 0.008), w, { r: [-Math.PI / 2, 0, 0] }),
          K.part(K.tube(outline, 0.014, 96, 6), k),
        ], { p: [0.63, 0, 0], r: [0.12, 0, 0] });
        parts.push(K.group([
          K.part(K.rbox(0.36, 0.025, 0.06, 0.012), k, { p: [0.3, 0, 0] }),
          blade,
        ], { p: [0, -0.465, 0], r: [0, (i / 5) * Math.PI * 2, 0] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "woven-rug", name: "Woven Rug", series: "rattan", category: "rug", kind: "rug", size: [3, 2],
    variants: [{ name: "Natural", swatch: "#d9bf94" }, { name: "Ocean Blue", swatch: "#6fb0c4" }, { name: "Palms", swatch: "#8fbf82" }],
    build(v) {
      const accent = ["#d47d58", "#4f93b0", "#5c9a5a"][v] ?? "#d47d58";
      const accent2 = ["#f0c27a", "#bfe2e8", "#ead27e"][v] ?? "#f0c27a";
      const mat = rug(`rattan:woven:${v}`, 2.82, 1.9, 0.1, (g, w, h) => {
        g.fillStyle = "#dcc39b";
        g.fillRect(0, 0, w, h);
        // Braided rows.
        for (let y = 0, row = 0; y < h; y += 9, row++) {
          g.strokeStyle = row % 2 ? "#ccb085" : "#e8d3ae";
          g.lineWidth = 3;
          g.beginPath();
          for (let x = -12 + (row % 2) * 6; x < w + 12; x += 12) {
            g.moveTo(x, y + 1);
            g.lineTo(x + 6, y + 7);
            g.lineTo(x + 12, y + 1);
          }
          g.stroke();
        }
        const band = (inset: number, width: number, col: string) => {
          g.strokeStyle = col;
          g.lineWidth = width;
          g.beginPath();
          g.roundRect(inset, inset, w - inset * 2, h - inset * 2, 18);
          g.stroke();
        };
        band(26, 14, accent);
        band(46, 5, accent2);
        band(58, 3, accent);
        // A row of diamonds down the middle, small triangles beside it.
        g.fillStyle = accent;
        const n = 7;
        for (let i = 0; i < n; i++) {
          const cx = w * 0.2 + ((w * 0.6) * i) / (n - 1), cy = h / 2, s = h * 0.13;
          g.beginPath();
          g.moveTo(cx, cy - s);
          g.lineTo(cx + s * 0.7, cy);
          g.lineTo(cx, cy + s);
          g.lineTo(cx - s * 0.7, cy);
          g.closePath();
          g.fill();
          g.fillStyle = accent2;
          g.beginPath();
          g.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = accent;
          for (const dy of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx - s * 0.35, cy + dy * s * 1.5);
            g.lineTo(cx + s * 0.35, cy + dy * s * 1.5);
            g.lineTo(cx, cy + dy * s * 1.15);
            g.closePath();
            g.fill();
          }
        }
      });
      // Tassels along the short ends.
      const half = 0.78, n = 30, step = (half * 2) / n, len = 0.075;
      const comb = new THREE.Shape();
      comb.moveTo(0, -half);
      for (let i = 0; i < n; i++) {
        const z0 = -half + i * step;
        comb.lineTo(len, z0);
        comb.lineTo(len, z0 + step * 0.55);
        comb.lineTo(0.02, z0 + step * 0.55);
        comb.lineTo(0.02, z0 + step);
      }
      comb.lineTo(0, half);
      comb.lineTo(0, -half);
      const fringe = M.fabric("#eadbbd", 0.4);
      const tassels = (s: number) => {
        const m = K.part(K.extrude(comb, 0.014, 0.004, 4), fringe, { p: [1.37, 0.012, 0], r: [-Math.PI / 2, 0, 0] });
        m.castShadow = false;
        return K.group([m], { r: [0, s > 0 ? 0 : Math.PI, 0] });
      };
      return K.group([mat, tassels(1), tassels(-1)]);
    },
  },
  {
    id: "shell-chime", name: "Shell Wind Chime", series: "rattan", category: "wall", kind: "wall", size: [1, 1], hang: 2,
    variants: [{ name: "Coral", swatch: "#f4a68c" }, { name: "White Shell", swatch: "#f5ede0" }, { name: "Sea Glass", swatch: "#8fd0c8" }],
    build(v) {
      const shells = [["#f7b7a0", "#fbe3d4", "#f29a7e"], ["#fbf4ea", "#efe2cf", "#f8ece0"], ["#fbe9dc", "#f5d7c4", "#fdf6ee"]][v] ?? ["#f7b7a0", "#fbe3d4", "#f29a7e"];
      const beadMat = v === 2 ? M.glass("#8fd8cc", 0.75) : M.wood("#c9a27a");
      const star = [M.gloss("#f29a62", 0.5), M.gloss("#f3d6b0", 0.5), M.gloss("#f6b48c", 0.5)][v] ?? M.gloss("#f29a62", 0.5);
      const cord = M.paint("#f3eadb", 0.7);
      const scallop = (R: number) => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.lineTo(-0.3 * R, 0.03 * R);
        s.lineTo(-0.32 * R, 0.2 * R);
        for (let i = 0; i <= 28; i++) {
          const a = Math.PI * (0.86 - 0.72 * (i / 28));
          const rr = R * (1 + 0.05 * Math.abs(Math.sin((i / 28) * Math.PI * 7)));
          s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9);
        }
        s.lineTo(0.32 * R, 0.2 * R);
        s.lineTo(0.3 * R, 0.03 * R);
        s.lineTo(0, 0);
        return K.extrude(s, 0.028, 0.01, 8);
      };
      const starGeo = () => {
        const s = new THREE.Shape();
        for (let i = 0; i <= 10; i++) {
          const a = Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 0.024 : 0.06;
          if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        return K.extrude(s, 0.022, 0.009, 4);
      };
      const spiral = K.lathe([[0, 0], [0.026, 0.012], [0.036, 0.035], [0.028, 0.055], [0.032, 0.07], [0.022, 0.088], [0.024, 0.1], [0.014, 0.118], [0.009, 0.13], [0, 0.14]], 16);
      const parts: THREE.Object3D[] = [
        K.part(K.tube([[-0.43, 0.355, 0.06], [-0.22, 0.38, 0.066], [0.03, 0.362, 0.06], [0.24, 0.384, 0.062], [0.43, 0.368, 0.058]], 0.03, 40, 10), M.wood("#cdbba3", "bold")),
        K.part(K.tube([[-0.34, 0.38, 0.05], [0, 0.46, 0.025], [0.34, 0.385, 0.05]], 0.009, 24, 6, false), cord),
        K.part(new THREE.SphereGeometry(0.018, 12, 8), M.metal("#d6b16a"), { p: [0, 0.465, 0.02] }),
      ];
      const strands: Array<[number, number]> = [[-0.32, -0.12], [-0.16, -0.32], [0, -0.42], [0.16, -0.28], [0.32, -0.1]];
      strands.forEach(([x, bottom], i) => {
        parts.push(K.part(K.rod([x, 0.36, 0.07], [x, bottom + 0.04, 0.07], 0.01, 6), cord));
        const kinds = [[0, 1, 2], [3, 0, 1], [1, 2, 0], [0, 3, 1], [2, 1, 0]][i]!;
        const ys = [0.22, 0.05, bottom + 0.04].filter((y) => y > bottom + 0.02);
        ys.forEach((y, k) => {
          const kind = k === ys.length - 1 ? 0 : kinds[k]!;
          const col = shells[(i + k) % 3]!;
          if (kind === 0) parts.push(K.part(scallop(0.075), M.ceramic(col), { p: [x, y + 0.01, 0.085], r: [0, 0, Math.PI] }));
          else if (kind === 1) {
            parts.push(K.part(new THREE.SphereGeometry(0.022, 14, 10), beadMat, { p: [x, y + 0.03, 0.07] }));
            parts.push(K.part(new THREE.SphereGeometry(0.018, 14, 10), beadMat, { p: [x, y - 0.015, 0.07] }));
          } else if (kind === 2) parts.push(K.part(starGeo(), star, { p: [x, y - 0.02, 0.085], r: [0, 0, i * 0.4] }));
          else parts.push(K.part(spiral, M.ceramic(col), { p: [x, y + 0.04, 0.075], r: [Math.PI, 0, 0.2] }));
        });
      });
      return K.group(parts);
    },
  },
  {
    id: "surfboard", name: "Surfboard", series: "rattan", category: "decor", kind: "floor", size: [1, 0.5],
    variants: [{ name: "Sunset", swatch: "#f59a6b" }, { name: "Waves", swatch: "#5fb8c9" }, { name: "Hibiscus", swatch: "#f6efe2" }, { name: "Mint", swatch: "#a5dcc6" }],
    build(v) {
      const L = 1.5, W = 0.44;
      const hw = (t: number) => (W / 2) * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * t)), 0.55);
      const s = new THREE.Shape();
      const n = 40;
      s.moveTo(0, -L / 2);
      for (let i = 0; i <= n; i++) s.lineTo(hw(i / n), -L / 2 + (L * i) / n);
      for (let i = n - 1; i >= 0; i--) s.lineTo(-hw(i / n), -L / 2 + (L * i) / n);
      s.lineTo(0, -L / 2);
      const geo = K.planarUV(K.extrude(s, 0.055, 0.022, 48), W + 0.05, L + 0.05, "z");
      const tex = drawn(`rattan:surf:${v}`, 128, 420, (g, w, h) => {
        const base = ["#fbf3e3", "#5fb8c9", "#fbf5ea", "#a5dcc6"][v] ?? "#fbf3e3";
        g.fillStyle = base;
        g.fillRect(0, 0, w, h);
        if (v === 0) {
          ["#f6cf5a", "#f59a6b", "#ef7f86"].forEach((col, i) => {
            g.fillStyle = col;
            g.fillRect(0, h * (0.38 + i * 0.07), w, h * 0.055);
          });
        } else if (v === 1) {
          g.fillStyle = "#fbf5ea";
          g.beginPath();
          g.moveTo(0, h * 0.62);
          for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.6 + Math.sin((x / w) * Math.PI * 2) * h * 0.03);
          g.lineTo(w, h);
          g.lineTo(0, h);
          g.fill();
          g.fillStyle = "#2f8fae";
          g.fillRect(0, h * 0.69, w, h * 0.025);
        } else if (v === 2) {
          const cx = w / 2, cy = h * 0.42;
          g.fillStyle = "#e9505a";
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            g.beginPath();
            g.ellipse(cx + Math.cos(a) * w * 0.17, cy + Math.sin(a) * w * 0.17, w * 0.2, w * 0.14, a, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = "#f6cf5a";
          g.beginPath();
          g.arc(cx, cy, w * 0.07, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#5d9e5c";
          g.fillRect(0, h * 0.82, w, h * 0.03);
        } else {
          g.fillStyle = "#f6d867";
          g.fillRect(0, h * 0.3, w, h * 0.04);
          g.fillRect(0, h * 0.36, w, h * 0.015);
        }
        g.fillStyle = "rgba(120, 82, 50, 0.55)";
        g.fillRect(w / 2 - 1.5, 0, 3, h);
      });
      const board = K.part(geo, M.printed(`rattan:surf:${v}`, tex, 0.32), { p: [0, 0.1 + L / 2, 0] });
      const wood = M.wood("#c79a66");
      return K.group([
        K.part(K.rbox(0.62, 0.07, 0.34, 0.03), wood, { p: [0, 0.035, 0] }),
        K.part(K.rbox(0.5, 0.17, 0.06, 0.025), wood, { p: [0, 0.14, -0.066] }),
        K.part(K.rbox(0.5, 0.17, 0.06, 0.025), wood, { p: [0, 0.14, 0.066] }),
        K.group([board], { r: [-0.04, 0, 0] }),
      ]);
    },
  },
];
