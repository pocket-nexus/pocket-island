// Starry series: navy and lavender, gold stars, crescent moons and puffy clouds,
// with soft glowing accents. A room made for dreaming.

import * as THREE from "three";
import { K, M, cushion } from "./common.ts";
import { drawn, rng } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const GOLD = "#f0c869";
const FACE = "#3b3866";
const goldM = () => M.metal(GOLD, 0.3);
/** Bright painted gold for stars and moons, which read better than metal. */
const starGoldM = () => M.gloss("#f7cd5a", 0.28);

// ---------- Shapes ----------

/** A five-pointed star with rounded points, one point up. */
function starShape(r: number, inner = 0.5, round = 0.24): THREE.Shape {
  const v: THREE.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    v.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const p = v[(i + 9) % 10]!, c = v[i]!, q = v[(i + 1) % 10]!;
    const k = i % 2 ? round * 0.5 : round;
    const a = c.clone().lerp(p, k), b = c.clone().lerp(q, k);
    if (i === 0) s.moveTo(a.x, a.y);
    else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(c.x, c.y, b.x, b.y);
  }
  s.closePath();
  return s;
}

/**
 * A crescent moon like ☾: an outer circle of radius R, `W` thick at its
 * back, spanning `span` radians, with round tips. It opens toward +X.
 */
function crescentShape(R: number, W: number, span = 3.6, tip = W * 0.2, steps = 40): THREE.Shape {
  const half = span / 2;
  const a0 = Math.PI - half, a1 = Math.PI + half;
  const at = (a: number, r: number) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  const thick = (u: number) => tip + (W / 2 - tip) * Math.pow(Math.cos((u * Math.PI) / 2), 0.9);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) pts.push(at(a0 + (span * i) / steps, R));
  const cap = (a: number, dir: number, from: number, to: number) => {
    const c = at(a, R - tip), n = at(a, 1), t = new THREE.Vector2(-Math.sin(a) * dir, Math.cos(a) * dir);
    for (let k = 1; k < 8; k++) {
      const f = from + ((to - from) * k) / 8;
      pts.push(new THREE.Vector2(c.x + tip * (Math.cos(f) * n.x + Math.sin(f) * t.x), c.y + tip * (Math.cos(f) * n.y + Math.sin(f) * t.y)));
    }
  };
  cap(a1, 1, 0, Math.PI);
  for (let i = steps; i >= 0; i--) pts.push(at(a0 + (span * i) / steps, R - 2 * thick((i / steps) * 2 - 1)));
  cap(a0, -1, Math.PI, 0);
  return new THREE.Shape(pts);
}

/**
 * An extruded crescent, centred on its bounding box. `back` is where the
 * thickest part of the moon ended up, for putting a face on it; `front` is
 * the z of its front face.
 */
function crescent(R: number, W: number, span: number, depth: number, bevel: number) {
  const geo = K.extrude(crescentShape(R, W, span), depth, bevel, 8);
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox!.getCenter(c);
  geo.translate(-c.x, -c.y, 0);
  return { geo, back: new THREE.Vector2(-R + W / 2 - c.x, -c.y), front: depth / 2 };
}

/** A chunky star with soft bevelled edges, facing +Z. */
function puffyStar(r: number, depth: number, mat: THREE.Material, at: K.At = {}, inner = 0.5): THREE.Mesh {
  return K.part(K.extrude(starShape(r, inner, 0.26), depth, depth * 0.38, 6), mat, at);
}

/** A ball of cloud: a slightly squashed sphere. */
const puff = (r: number, mat: THREE.Material, p: K.V3, squash = 0.88, deep = 0.9) => K.part(K.soft(r * 2, r * 2 * squash, r * 2 * deep, 0.92, 0, 26), mat, { p });

/** A sleeping face: two closed eyes and pink cheeks, on a front at z. */
function sleepyFace(x: number, y: number, z: number, s: number, single = false): THREE.Object3D[] {
  const ink = M.gloss(FACE, 0.4);
  const cheek = M.paint("#f6a7bd", 0.7);
  const out: THREE.Object3D[] = [];
  const eyes = single ? [x] : [x - s * 0.5, x + s * 0.5];
  for (const ex of eyes) {
    out.push(K.part(K.tube([[ex - s * 0.28, y + s * 0.06, z], [ex - s * 0.1, y - s * 0.07, z + 0.004], [ex + s * 0.1, y - s * 0.07, z + 0.004], [ex + s * 0.28, y + s * 0.06, z]], 0.011, 16, 6), ink));
    out.push(K.part(K.soft(s * 0.32, s * 0.2, 0.02, 0.8), cheek, { p: [ex - (single ? s * 0.05 : 0), y - s * 0.35, z] }));
  }
  return out;
}

// ---------- Prints ----------

function fillShape(g: CanvasRenderingContext2D, shape: THREE.Shape, x: number, y: number, s: number, rot: number, color: string): void {
  const pts = shape.getPoints(6);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, -s);
  g.fillStyle = color;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fill();
  g.restore();
}

const STAR = starShape(1, 0.5, 0.26);
const MOON = crescentShape(1, 0.62, 3.6);

/** Scattered stars, a few moons and dots on a plain ground. */
function starPrint(bg: string, inks: string[], seed: number, across = 7): Draw {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const r = rng(seed);
    const cell = w / across;
    for (let j = 0; j * cell < h; j++) for (let i = 0; i * cell < w; i++) {
      const x = (i + 0.2 + r() * 0.6) * cell, y = (j + 0.2 + r() * 0.6) * cell;
      const k = r();
      const ink = inks[Math.floor(r() * inks.length)]!;
      if (k < 0.12) fillShape(g, MOON, x, y, cell * 0.26, r() - 0.5, inks[0]!);
      else if (k < 0.78) fillShape(g, STAR, x, y, cell * (0.13 + r() * 0.13), r() - 0.5, ink);
      g.globalAlpha = 0.65;
      g.fillStyle = ink;
      g.beginPath();
      g.arc(x + cell * 0.45, y + cell * 0.3, cell * 0.035, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  };
}

/** A star map: dotted constellations joined by fine lines. */
function constellations(bg: string, line: string, dot: string): Draw {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const r = rng(29);
    g.fillStyle = dot;
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = 0.35 + r() * 0.4;
      g.beginPath();
      g.arc(r() * w, r() * h, 1 + r() * 1.8, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    const figures: Array<Array<[number, number]>> = [
      [[0.08, 0.3], [0.16, 0.22], [0.25, 0.28], [0.3, 0.42], [0.42, 0.45], [0.46, 0.62], [0.36, 0.7]],
      [[0.58, 0.18], [0.66, 0.3], [0.74, 0.22], [0.82, 0.34], [0.9, 0.26]],
      [[0.6, 0.62], [0.7, 0.55], [0.8, 0.66], [0.72, 0.8], [0.6, 0.62]],
      [[0.12, 0.72], [0.2, 0.84], [0.3, 0.8]],
    ];
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    for (const f of figures) {
      g.beginPath();
      f.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
      g.stroke();
    }
    g.setLineDash([]);
    for (const f of figures) for (const [x, y] of f) fillShape(g, STAR, x * w, y * h, h * 0.035, 0, dot);
    fillShape(g, MOON, w * 0.9, h * 0.8, h * 0.09, -0.4, dot);
    g.strokeStyle = dot;
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
  };
}

/** A simple cartoon map of the world, as an equirectangular texture. */
function worldMap(ocean: string, land: string, ice: string): Draw {
  const lands: Array<Array<[number, number]>> = [
    [[-165, 66], [-140, 70], [-100, 72], [-80, 66], [-62, 56], [-66, 45], [-80, 32], [-82, 25], [-97, 26], [-97, 18], [-88, 15], [-80, 8], [-92, 14], [-106, 22], [-117, 32], [-124, 42], [-128, 52], [-148, 60], [-166, 58]],
    [[-80, 10], [-62, 10], [-50, 0], [-35, -6], [-40, -22], [-48, -28], [-58, -38], [-66, -55], [-74, -48], [-72, -20], [-80, -6]],
    [[-56, 60], [-44, 60], [-22, 70], [-24, 80], [-58, 82], [-72, 77]],
    [[-10, 36], [-9, 44], [-2, 49], [8, 55], [20, 58], [28, 70], [45, 68], [48, 46], [36, 40], [26, 38], [14, 40], [4, 43]],
    [[-17, 15], [-12, 28], [-2, 35], [10, 37], [32, 31], [44, 12], [51, 11], [42, -2], [40, -15], [32, -28], [20, -35], [14, -24], [12, -6], [8, 4], [-8, 5]],
    [[44, 42], [48, 66], [70, 73], [100, 77], [140, 72], [170, 68], [178, 64], [160, 58], [142, 52], [134, 42], [122, 32], [120, 22], [108, 16], [104, 8], [98, 16], [90, 22], [80, 10], [72, 20], [60, 25], [50, 28]],
    [[114, -22], [122, -16], [130, -12], [142, -11], [146, -18], [153, -26], [148, -38], [138, -35], [130, -32], [115, -34]],
    [[46, -14], [50, -16], [48, -25], [44, -22]],
    [[130, 33], [136, 35], [141, 40], [142, 44], [139, 38], [133, 33]],
    [[-6, 50], [-4, 58], [1, 53]],
  ];
  return (g, w, h) => {
    g.fillStyle = ocean;
    g.fillRect(0, 0, w, h);
    const px = (lon: number) => ((lon + 180) / 360) * w;
    const py = (lat: number) => ((90 - lat) / 180) * h;
    g.fillStyle = land;
    for (const poly of lands) {
      g.beginPath();
      const pts = poly.map(([lon, lat]) => [px(lon), py(lat)] as const);
      const n = pts.length;
      const mid = (i: number) => [(pts[i % n]![0] + pts[(i + 1) % n]![0]) / 2, (pts[i % n]![1] + pts[(i + 1) % n]![1]) / 2] as const;
      g.moveTo(...mid(0));
      for (let i = 1; i <= n; i++) g.quadraticCurveTo(pts[i % n]![0], pts[i % n]![1], ...mid(i));
      g.fill();
    }
    g.fillStyle = ice;
    g.fillRect(0, h * 0.92, w, h * 0.08);
    g.fillRect(0, 0, w, h * 0.04);
    g.strokeStyle = "#ffffff55";
    g.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(0, (i / 6) * h);
      g.lineTo(w, (i / 6) * h);
      g.stroke();
    }
  };
}

const skyChart: Draw = (g, w, h) => {
  constellations("#2f3a72", "#d9c27a", "#f6d77a")(g, w, h);
  g.strokeStyle = "#f6d77a";
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.sin((x / w) * Math.PI * 2) * h * 0.13);
  g.stroke();
};

// ---------- Palettes ----------

const NIGHTS = [
  { name: "Night Sky", swatch: "#34407a", body: "#3a4680", trim: "#2c3566", mat: "#2f3a72", line: "#d9c27a", dot: "#f6d77a" },
  { name: "Lavender", swatch: "#b9a7e6", body: "#bba9e6", trim: "#9d89d2", mat: "#8f7cc8", line: "#fff3d0", dot: "#fff3c4" },
  { name: "Milk White", swatch: "#f5f1f9", body: "#f6f2fa", trim: "#ddd5ec", mat: "#cfe0f6", line: "#6d7fb8", dot: "#3a4680" },
  { name: "Pink", swatch: "#f4bdd2", body: "#f4bfd3", trim: "#e3a1bb", mat: "#d98aa8", line: "#fff3d0", dot: "#fff3c4" },
];
const nightVariants = NIGHTS.map(({ name, swatch }) => ({ name, swatch }));
const night = (v: number) => NIGHTS[v] ?? NIGHTS[0]!;

const BEDS = [
  { name: "Night Sky", swatch: "#34407a", frame: "#3a4680", panel: "#4f5c9c", moon: "#f8dc7a", duvet: "#3d4a88", print: ["#f6d36b", "#fff3cf", "#c9bdf2"], fold: "#f3eefb", star: "#f8d96e" },
  { name: "Lavender", swatch: "#b9a7e6", frame: "#b6a3e3", panel: "#d6cbf4", moon: "#fbe6a2", duvet: "#c4b4ee", print: ["#fff7d6", "#ffffff", "#f6d36b"], fold: "#fbf8ff", star: "#f8d96e" },
  { name: "Pink", swatch: "#f3b9cd", frame: "#f0b3c8", panel: "#f8d4e0", moon: "#fff0b8", duvet: "#f6c6d6", print: ["#ffffff", "#fff3c2", "#f6d36b"], fold: "#fff8fb", star: "#f8d96e" },
  { name: "Milk White", swatch: "#f4f0f8", frame: "#f4f0f7", panel: "#d5e3f7", moon: "#f7d774", duvet: "#cddff6", print: ["#f2c75c", "#ffffff", "#8fa6dc"], fold: "#fffdf8", star: "#f8d96e" },
];

/** A panel with round top corners and square-ish bottom ones. */
function archPanel(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2, b = 0.04;
  s.moveTo(x + b, y);
  s.lineTo(x + w - b, y);
  s.quadraticCurveTo(x + w, y, x + w, y + b);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + b);
  s.quadraticCurveTo(x, y, x + b, y);
  return s;
}

/** The outline of a union of circles, seen from the origin, fitted to w × h. */
function cloudOutline(circles: Array<[number, number, number]>, w: number, h: number, steps = 200): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (const [cx, cy, r] of circles) {
      const b = dx * cx + dy * cy;
      const disc = b * b - (cx * cx + cy * cy - r * r);
      if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
    }
    pts.push(new THREE.Vector2(dx * best, dy * best));
  }
  const box = new THREE.Box2().setFromPoints(pts);
  const c = box.getCenter(new THREE.Vector2()), size = box.getSize(new THREE.Vector2());
  return pts.map((p) => new THREE.Vector2(((p.x - c.x) / size.x) * w, ((p.y - c.y) / size.y) * h));
}

const CLOUD: Array<[number, number, number]> = [
  [-1.0, -0.15, 0.5], [-0.45, 0.28, 0.6], [0.25, 0.38, 0.58], [0.85, 0.08, 0.5], [1.12, -0.28, 0.38],
  [-1.18, -0.42, 0.34], [-0.5, -0.38, 0.5], [0.2, -0.36, 0.55], [0.78, -0.38, 0.45],
];

const SOFA_CLOUD: Array<[number, number, number]> = [
  [-0.78, -0.12, 0.32], [-0.36, 0.12, 0.4], [0.14, 0.2, 0.44], [0.58, 0.04, 0.36], [0.86, -0.14, 0.28],
  [-0.4, -0.28, 0.3], [0.06, -0.3, 0.32], [0.5, -0.28, 0.3],
];

export const STARRY: FurnitureDef[] = [
  {
    id: "star-bed", name: "Starry Bed", series: "starry", category: "bed", kind: "floor", size: [2, 2],
    variants: BEDS.map(({ name, swatch }) => ({ name, swatch })),
    build(v) {
      const b = BEDS[v] ?? BEDS[0]!;
      const frameM = M.gloss(b.frame, 0.38);
      const panelM = M.gloss(b.panel, 0.42);
      const gold = goldM();
      const duvetTex = drawn(`starry-bed:${v}`, 480, 340, starPrint(b.duvet, b.print, 17 + v));
      const duvetGeo = K.planarUV(K.soft(1.74, 0.12, 1.24, 0.18, 0.05), 1.74, 1.24, "y");
      const moon = crescent(0.32, 0.22, 3.7, 0.1, 0.035);
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.86, 0.24, 1.84, 0.08), frameM, { p: [0, 0.27, 0.02] }),
        ...K.corners(1.62, 1.62).map(([x, , z]) => K.part(K.lathe([[0, 0], [0.055, 0], [0.075, 0.035], [0.08, 0.08], [0.065, 0.13], [0, 0.15]], 24), gold, { p: [x, 0, z + 0.02] })),
        // Arched headboard with an inset panel, a crescent moon and stars.
        K.part(K.extrude(archPanel(1.84, 1.0, 0.45), 0.12, 0.035, 32), frameM, { p: [0, 0.78, -0.89] }),
        K.part(K.extrude(archPanel(1.56, 0.7, 0.32), 0.04, 0.015, 32), panelM, { p: [0, 0.86, -0.82] }),
        K.part(moon.geo, M.gloss(b.moon, 0.3), { p: [-0.5, 1.14, -0.78], r: [0, 0, 0.3] }),
        puffyStar(0.1, 0.045, starGoldM(), { p: [0.12, 1.02, -0.79], r: [0, 0, 0.2] }),
        puffyStar(0.075, 0.04, starGoldM(), { p: [0.5, 0.86, -0.79], r: [0, 0, -0.25] }),
        puffyStar(0.06, 0.04, starGoldM(), { p: [0.62, 1.1, -0.79], r: [0, 0, 0.4] }),
        puffyStar(0.05, 0.035, starGoldM(), { p: [-0.12, 0.8, -0.79], r: [0, 0, -0.1] }),
        // Low footboard with a star.
        K.part(K.extrude(archPanel(1.84, 0.42, 0.16), 0.1, 0.03, 24), frameM, { p: [0, 0.36, 0.9] }),
        puffyStar(0.09, 0.04, starGoldM(), { p: [0, 0.4, 0.945] }),
        // Mattress, starry duvet with its folded edge, pillow and a star cushion.
        cushion([0, 0.47, -0.02], 1.66, 0.2, 1.7, M.fabric("#fbf8f2"), [0, 0, 0], 0.22, 0.1),
        K.part(duvetGeo, M.printedCloth(`starry-bed:${v}`, duvetTex, false), { p: [0, 0.555, 0.25] }),
        cushion([0, 0.6, -0.34], 1.74, 0.1, 0.18, M.fabric(b.fold), [0, 0, 0], 0.4, 0),
        cushion([0, 0.66, -0.62], 0.86, 0.17, 0.4, M.fabric("#ffffff", 0.5), [-0.18, 0, 0], 0.45, 0.6),
        puffyStar(0.16, 0.1, M.plush(b.star), { p: [0.52, 0.76, -0.5], r: [-0.35, 0, -0.2] }),
      ];
      return K.group(parts);
    },
  },
  {
    id: "star-nightstand", name: "Starry Nightstand", series: "starry", category: "storage", kind: "floor", size: [1, 1], variants: nightVariants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.7 },
    build(v) {
      const c = night(v);
      const body = M.gloss(c.body, 0.38);
      const trim = M.gloss(c.trim, 0.38);
      const gold = goldM();
      const moon = crescent(0.07, 0.05, 3.6, 0.02, 0.008);
      return K.group([
        K.part(K.rbox(0.86, 0.06, 0.82, 0.03), trim, { p: [0, 0.67, 0] }),
        K.part(K.rbox(0.78, 0.52, 0.74, 0.06), body, { p: [0, 0.38, -0.01] }),
        K.part(K.rbox(0.66, 0.2, 0.05, 0.03), trim, { p: [0, 0.515, 0.36] }),
        K.part(K.rbox(0.66, 0.2, 0.05, 0.03), trim, { p: [0, 0.265, 0.36] }),
        puffyStar(0.05, 0.035, starGoldM(), { p: [0, 0.515, 0.395] }),
        puffyStar(0.05, 0.035, starGoldM(), { p: [0, 0.265, 0.395] }),
        K.part(moon.geo, starGoldM(), { p: [-0.22, 0.27, 0.39], r: [0, 0, 0.4] }),
        puffyStar(0.025, 0.02, starGoldM(), { p: [-0.16, 0.32, 0.39] }),
        puffyStar(0.02, 0.02, starGoldM(), { p: [0.22, 0.22, 0.39] }),
        ...K.corners(0.62, 0.58).map(([x, , z]) => K.part(K.lathe([[0, 0], [0.035, 0], [0.055, 0.03], [0.06, 0.07], [0.045, 0.11], [0, 0.12]], 20), gold, { p: [x, 0, z] })),
      ]);
    },
  },
  {
    id: "moon-chair", name: "Moon Chair", series: "starry", category: "seat", kind: "floor", size: [1, 1],
    variants: [
      { name: "Moonlight", swatch: "#f7d774" },
      { name: "Silver Moon", swatch: "#eeeef4" },
      { name: "Pink Moon", swatch: "#f6c2d4" },
    ],
    build(v) {
      const m = [
        { moon: "#f7d774", seat: "#3f4b8a", base: "#34407a", star: "#fff3c4" },
        { moon: "#f1f0ec", seat: "#b9a8e6", base: "#9d89d2", star: "#f8d96e" },
        { moon: "#f7c6d6", seat: "#4b5794", base: "#3a4680", star: "#f8d96e" },
      ][v] ?? { moon: "#f7d774", seat: "#3f4b8a", base: "#34407a", star: "#fff3c4" };
      const gold = goldM();
      const baseM = M.gloss(m.base, 0.4);
      const back = crescent(0.37, 0.28, 3.45, 0.16, 0.06);
      const tilt = 0.18;
      const face = back.back.clone().rotateAround(new THREE.Vector2(), tilt);
      const at: K.V3 = [0.02, 0.82, -0.22];
      return K.group([
        ...K.corners(0.5, 0.42).map(([x, , z]) => K.part(K.lathe([[0, 0], [0.03, 0], [0.04, 0.2], [0.045, 0.24], [0, 0.24]], 16), gold, { p: [x, 0.006, z + 0.03], r: [z * 0.25, 0, -x * 0.25] })),
        K.part(K.puck(0.33, 0.1, 0.04, 40), baseM, { p: [0, 0.23, 0.03], s: [1, 1, 0.88] }),
        K.part(K.puck(0.335, 0.025, 0.01, 40), gold, { p: [0, 0.3, 0.03], s: [1, 1, 0.88] }),
        cushion([0, 0.41, 0.05], 0.68, 0.17, 0.6, M.fabric(m.seat, 0.7), [0, 0, 0], 0.55, 0.35),
        // A sleepy crescent moon for a back.
        K.part(back.geo, M.gloss(m.moon, 0.3), { p: at, r: [0, 0, tilt] }),
        ...sleepyFace(at[0] + face.x + 0.01, at[1] + face.y + 0.06, at[2] + back.front + 0.003, 0.1, true),
        puffyStar(0.12, 0.08, M.plush(m.star), { p: [0.14, 0.6, -0.04], r: [-0.3, 0, -0.25] }),
      ]);
    },
  },
  {
    id: "cloud-sofa", name: "Cloud Sofa", series: "starry", category: "seat", kind: "floor", size: [2, 1],
    variants: [
      { name: "White Cloud", swatch: "#f7f5fc" },
      { name: "Lavender", swatch: "#d8cdf4" },
      { name: "Pink Cloud", swatch: "#f8d2e0" },
      { name: "Clear Sky", swatch: "#cfe2f8" },
    ],
    build(v) {
      const c = ["#f7f5fc", "#d8cdf4", "#f8d2e0", "#cfe2f8"][v] ?? "#f7f5fc";
      const fluff = M.plush(c);
      const deep = M.plush(new THREE.Color(c).lerp(new THREE.Color("#9c8fd0"), 0.12).getStyle());
      const gold = goldM();
      const moon = crescent(0.17, 0.12, 3.6, 0.09, 0.04);
      return K.group([
        K.part(K.rbox(1.6, 0.2, 0.7, 0.08), deep, { p: [0, 0.18, -0.02] }),
        ...[-0.66, -0.33, 0, 0.33, 0.66].map((x, i) => puff(0.19 + (i % 2) * 0.02, deep, [x, 0.22, 0.16])),
        cushion([0, 0.38, 0.06], 1.36, 0.18, 0.6, fluff, [0, 0, 0], 0.5, 0.3),
        // A cloud for a back.
        K.part(K.extrude(new THREE.Shape(cloudOutline(SOFA_CLOUD, 1.62, 0.6)), 0.36, 0.13, 6), fluff, { p: [0, 0.74, -0.24] }),
        puff(0.2, deep, [-0.46, 0.5, -0.14], 0.9, 0.8),
        puff(0.2, deep, [0.46, 0.5, -0.14], 0.9, 0.8),
        // Round arms.
        puff(0.2, fluff, [-0.74, 0.46, 0.14]),
        puff(0.21, fluff, [-0.74, 0.5, -0.1]),
        puff(0.2, fluff, [0.74, 0.46, 0.14]),
        puff(0.21, fluff, [0.74, 0.5, -0.1]),
        // A star and a moon to lean on.
        puffyStar(0.15, 0.1, M.plush("#f8d96e"), { p: [0.32, 0.6, -0.03], r: [-0.3, 0, -0.18] }),
        K.part(moon.geo, M.plush("#fff1b8"), { p: [-0.32, 0.6, -0.03], r: [-0.3, 0, 0.4] }),
        ...K.corners(1.4, 0.5).map(([x, , z]) => K.part(new THREE.SphereGeometry(0.045, 16, 12), starGoldM(), { p: [x, 0.045, z] })),
      ]);
    },
  },
  {
    id: "star-desk", name: "Starry Desk", series: "starry", category: "table", kind: "floor", size: [2, 1], variants: nightVariants.slice(0, 3),
    surface: { rect: [-1, -0.5, 1, 0.5], y: 0.78 },
    build(v) {
      const c = night(v);
      const body = M.gloss(c.body, 0.36);
      const trim = M.gloss(c.trim, 0.38);
      const gold = goldM();
      const tex = drawn(`starry-desk:${v}`, 400, 220, constellations(c.mat, c.line, c.dot));
      const moon = crescent(0.06, 0.042, 3.6, 0.018, 0.007);
      const leg = (x: number, z: number) => [
        K.part(K.lathe([[0, 0], [0.035, 0], [0.04, 0.03], [0.05, 0.64], [0.056, 0.7], [0, 0.7]], 20), trim, { p: [x, 0, z] }),
        K.part(K.puck(0.045, 0.05, 0.015, 20), gold, { p: [x, 0, z] }),
      ];
      return K.group([
        K.part(K.rbox(1.92, 0.08, 0.9, 0.04), body, { p: [0, 0.74, 0] }),
        K.part(new THREE.PlaneGeometry(1.0, 0.55), M.printed(`starry-desk:${v}`, tex, 0.7), { p: [-0.35, 0.7805, 0.02], r: [-Math.PI / 2, 0, 0] }),
        // A drawer pedestal on the right with star knobs.
        K.part(K.rbox(0.56, 0.64, 0.78, 0.04), trim, { p: [0.62, 0.38, -0.02] }),
        K.part(K.rbox(0.46, 0.22, 0.045, 0.03), body, { p: [0.62, 0.55, 0.38] }),
        K.part(K.rbox(0.46, 0.26, 0.045, 0.03), body, { p: [0.62, 0.26, 0.38] }),
        puffyStar(0.045, 0.03, starGoldM(), { p: [0.62, 0.55, 0.41] }),
        puffyStar(0.045, 0.03, starGoldM(), { p: [0.62, 0.26, 0.41] }),
        K.part(moon.geo, starGoldM(), { p: [0.47, 0.32, 0.405], r: [0, 0, 0.4] }),
        ...K.corners(0.44, 0.66).map(([x, , z]) => K.part(new THREE.SphereGeometry(0.04, 14, 10), gold, { p: [0.62 + x, 0.04, z - 0.02], s: [1, 0.9, 1] })),
        ...leg(-0.86, -0.34),
        ...leg(-0.86, 0.34),
        K.part(K.rbox(1.2, 0.1, 0.04, 0.02), trim, { p: [-0.25, 0.65, -0.38] }),
      ]);
    },
  },
  {
    id: "telescope", name: "Telescope", series: "starry", category: "decor", kind: "floor", size: [1, 1],
    variants: [
      { name: "Brass", swatch: "#e3b860" },
      { name: "Night Sky", swatch: "#34407a" },
      { name: "Lavender", swatch: "#b9a7e6" },
    ],
    build(v) {
      const t = [
        { tube: M.metal("#e6bd66", 0.28), ring: M.gloss("#34407a", 0.35), leg: M.wood("#a8714a"), stars: false },
        { tube: M.gloss("#34407a", 0.3), ring: goldM(), leg: M.wood("#c99a63"), stars: true },
        { tube: M.gloss("#b9a7e6", 0.3), ring: goldM(), leg: M.gloss("#f5f1f9", 0.4), stars: true },
      ][v] ?? { tube: M.metal("#e6bd66", 0.28), ring: M.gloss("#34407a", 0.35), leg: M.wood("#a8714a"), stars: false };
      const gold = goldM();
      const parts: THREE.Object3D[] = [];
      // Tripod.
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        const cx = Math.cos(a), cz = Math.sin(a);
        parts.push(K.part(K.rod([cx * 0.05, 0.77, cz * 0.05], [cx * 0.36, 0.03, cz * 0.36], 0.024, 12), t.leg));
        parts.push(K.part(K.puck(0.038, 0.035, 0.012, 16), gold, { p: [cx * 0.365, 0, cz * 0.365] }));
      }
      parts.push(K.part(K.puck(0.19, 0.025, 0.012, 32), t.leg, { p: [0, 0.33, 0] }));
      parts.push(K.part(K.puck(0.07, 0.07, 0.02, 24), gold, { p: [0, 0.75, 0] }));
      // The tube and its fork, aimed up at the sky.
      const e = 0.58;
      const tube: THREE.Object3D[] = [
        K.part(K.lathe([[0, -0.34], [0.05, -0.34], [0.06, 0.26], [0, 0.26]], 32), t.tube),
        K.part(K.lathe([[0, 0.24], [0.072, 0.24], [0.082, 0.27], [0.082, 0.4], [0.074, 0.42], [0, 0.42]], 32), t.ring),
        K.part(K.lathe([[0, 0.418], [0.066, 0.418], [0.05, 0.427], [0, 0.431]], 24), M.gloss("#8ec1ee", 0.12)),
        K.part(K.lathe([[0, -0.37], [0.058, -0.37], [0.062, -0.33], [0.058, -0.3], [0, -0.3]], 28), t.ring),
        K.part(K.lathe([[0, -0.48], [0.026, -0.48], [0.03, -0.46], [0.024, -0.36], [0, -0.36]], 16), M.gloss("#3a3560", 0.35)),
        K.part(K.lathe([[0, -0.035], [0.064, -0.035], [0.068, 0], [0.064, 0.035], [0, 0.035]], 28), gold),
        // A finder scope on top.
        K.part(K.rod([-0.085, -0.06, 0], [-0.085, 0.12, 0], 0.02, 12), t.ring),
        K.part(K.rod([-0.05, 0.0, 0], [-0.085, 0.0, 0], 0.01, 8), gold),
        K.part(K.rod([-0.05, 0.08, 0], [-0.085, 0.08, 0], 0.01, 8), gold),
      ];
      if (t.stars) {
        tube.push(puffyStar(0.026, 0.016, starGoldM(), { p: [0, 0.08, 0.058] }));
        tube.push(puffyStar(0.018, 0.014, starGoldM(), { p: [0.01, -0.12, 0.055] }));
      }
      parts.push(K.group([
        K.part(K.rbox(0.03, 0.16, 0.06, 0.012), gold, { p: [0, 0.86, 0.085] }),
        K.part(K.rbox(0.03, 0.16, 0.06, 0.012), gold, { p: [0, 0.86, -0.085] }),
        K.part(K.rod([0, 0.92, -0.11], [0, 0.92, 0.11], 0.016, 10), gold),
        K.group(tube, { p: [0, 0.92, 0], r: [0, 0, -(Math.PI / 2 - e)] }),
      ], { r: [0, 0.29, 0] }));
      return K.group(parts);
    },
  },
  {
    id: "star-lamp", name: "Star Lamp", series: "starry", category: "lamp", kind: "misc", size: [1, 1],
    variants: [
      { name: "Gold Star", swatch: "#ffd36b" },
      { name: "Pink Star", swatch: "#ffb7cc" },
      { name: "Blue Star", swatch: "#b2ccff" },
    ],
    light: { at: [0, 0.44, 0.04], color: "#ffe2a8", intensity: 2.2, distance: 3, halo: 0.9, startsOn: true },
    build(v) {
      const c = [
        { glow: "#ffe08a", star: "#ffeeb0", base: "#34407a" },
        { glow: "#ffc6d4", star: "#ffe3ec", base: "#f6f2fa" },
        { glow: "#c4d8ff", star: "#e6efff", base: "#b9a7e6" },
      ][v] ?? { glow: "#ffe08a", star: "#ffeeb0", base: "#34407a" };
      const baseM = M.gloss(c.base, 0.35);
      const gold = goldM();
      const moon = crescent(0.055, 0.04, 3.6, 0.025, 0.01);
      return K.group([
        K.part(K.puck(0.15, 0.045, 0.02, 40), baseM),
        K.part(K.lathe([[0, 0.04], [0.13, 0.04], [0.11, 0.08], [0.06, 0.1], [0, 0.1]], 32), baseM),
        K.part(K.puck(0.155, 0.012, 0.005, 40), gold, { p: [0, 0.035, 0] }),
        K.part(K.tube([[0, 0.08, 0], [0.025, 0.17, 0], [0, 0.3, 0]], 0.018, 16, 10), gold),
        puffyStar(0.17, 0.11, M.glow(c.glow, c.star, 0.55, 0.55), { p: [0, 0.44, 0], r: [0, 0, 0.12] }),
        K.part(moon.geo, starGoldM(), { p: [-0.09, 0.115, 0.07], r: [-0.5, 0, 0.6] }),
      ]);
    },
  },
  {
    id: "globe", name: "Globe", series: "starry", category: "decor", kind: "misc", size: [1, 1],
    variants: [
      { name: "Earth", swatch: "#8cc8e8" },
      { name: "Star Chart", swatch: "#2f3a72" },
      { name: "Lavender", swatch: "#c9bdf0" },
    ],
    build(v) {
      const c = [
        { draw: worldMap("#8ccbea", "#a5d68e", "#f4f8fb"), base: M.wood("#a8714a") },
        { draw: skyChart, base: M.gloss("#34407a", 0.35) },
        { draw: worldMap("#c6b9ef", "#fff1c9", "#ffffff"), base: M.gloss("#f6f2fa", 0.38) },
      ][v] ?? { draw: skyChart, base: M.gloss("#34407a", 0.35) };
      const tex = drawn(`starry-globe:${v}`, 512, 256, c.draw);
      const brass = goldM();
      const R = 0.19, ringR = 0.218, cy = 0.45, tilt = 0.41;
      const meridian: K.V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = -Math.PI / 2 - 0.15 + ((Math.PI + 0.3) * i) / 24;
        meridian.push([Math.cos(a) * ringR, Math.sin(a) * ringR, 0]);
      }
      return K.group([
        K.part(K.lathe([[0, 0], [0.14, 0], [0.15, 0.02], [0.13, 0.045], [0.06, 0.08], [0.04, 0.17], [0.055, 0.19], [0, 0.2]], 32), c.base),
        K.part(K.puck(0.142, 0.015, 0.006, 32), brass, { p: [0, 0.03, 0] }),
        K.part(K.rod([0, 0.19, 0], [0, cy - ringR + 0.01, 0], 0.02, 10), brass),
        K.group([
          K.part(new THREE.SphereGeometry(R, 40, 28), M.printed(`starry-globe:${v}`, tex, 0.35), { r: [0, -0.4, 0] }),
          K.part(K.tube(meridian, 0.014, 40, 8), brass),
          K.part(new THREE.SphereGeometry(0.02, 12, 8), brass, { p: [0, ringR, 0] }),
          K.part(new THREE.SphereGeometry(0.02, 12, 8), brass, { p: [0, -ringR, 0] }),
        ], { p: [0, cy, 0], r: [0, 0, -tilt] }),
      ]);
    },
  },
  {
    id: "moon-lamp", name: "Moon Wall Lamp", series: "starry", category: "lamp", kind: "wall", size: [1, 1], hang: 2,
    variants: [
      { name: "Moonlight", swatch: "#ffe08a" },
      { name: "Silver Moon", swatch: "#e2ebff" },
      { name: "Pink Moon", swatch: "#ffc6d6" },
    ],
    // The light sits out in the room, below the moon, so it neither burns a
    // spot into the wall nor washes out the moon's own face.
    light: { at: [0, -0.4, 0.8], color: "#ffe2a8", intensity: 1.0, distance: 3, halo: 0, startsOn: true },
    build(v) {
      const c = [
        { glow: "#ffe39a", moon: "#f5d36e", plate: "#34407a" },
        { glow: "#d6e4ff", moon: "#cfdcf5", plate: "#9d89d2" },
        { glow: "#ffd0dc", moon: "#f2b9cb", plate: "#34407a" },
      ][v] ?? { glow: "#ffe39a", moon: "#f5d36e", plate: "#34407a" };
      const gold = goldM();
      const moon = crescent(0.31, 0.24, 3.75, 0.1, 0.035);
      const tilt = -0.2;
      const back = moon.back.clone().rotateAround(new THREE.Vector2(), tilt);
      // The lower horn's tip, for a star to dangle from.
      const horn = new THREE.Vector2(0.06, -0.27);
      return K.group([
        // A small mount hidden behind the moon's back.
        K.part(K.puck(0.1, 0.035, 0.014, 32), M.gloss(c.plate, 0.35), { p: [back.x, back.y + 0.03, 0], r: [Math.PI / 2, 0, 0] }),
        K.part(K.rod([back.x, back.y + 0.03, 0.03], [back.x, back.y + 0.03, 0.11], 0.025, 10), gold),
        K.part(moon.geo, M.glow(c.glow, c.moon, 0.45, 0.5), { p: [0, 0.03, 0.15], r: [0, 0, tilt] }),
        ...sleepyFace(back.x + 0.03, back.y + 0.08, 0.15 + moon.front + 0.003, 0.13, true),
        K.part(K.rod([horn.x, horn.y + 0.02, 0.15], [horn.x, horn.y - 0.1, 0.15], 0.01, 6), gold),
        puffyStar(0.055, 0.035, M.glow(c.glow, c.moon, 0.45, 0.5), { p: [horn.x, horn.y - 0.15, 0.15], r: [0, 0, 0.2] }),
      ]);
    },
  },
  {
    id: "star-string", name: "Star String Lights", series: "starry", category: "wall", kind: "wall", size: [2, 0.5], hang: 2.75,
    variants: [
      { name: "Warm Yellow", swatch: "#ffd76e" },
      { name: "Macaron", swatch: "#f8b9cf" },
      { name: "Ice Blue", swatch: "#bcd2ff" },
    ],
    light: { at: [0, -0.3, 0.8], color: "#ffe2a8", intensity: 0.8, distance: 2.6, halo: 0, startsOn: true },
    build(v) {
      const sets = [
        [["#ffd76e", "#fff1bc"]],
        [["#ffb3c8", "#ffe3ec"], ["#ffd76e", "#fff1bc"], ["#c9b5ff", "#efe8ff"], ["#9fe0c8", "#e6fbf3"]],
        [["#a9c6ff", "#e6efff"], ["#ffffff", "#f6f8ff"]],
      ];
      const colours = sets[v] ?? sets[0]!;
      const mats = colours.map(([glow, base]) => M.glow(glow!, base!, 0.95, 0.5));
      const cordM = v === 0 ? goldM() : M.gloss("#7c74b8", 0.4);
      const sag = (x: number) => 0.18 - 0.15 * (1 - (x / 0.95) ** 2);
      const cord: K.V3[] = [];
      for (let i = 0; i <= 20; i++) {
        const x = -0.95 + (1.9 * i) / 20;
        cord.push([x, sag(x), 0.035]);
      }
      const parts: THREE.Object3D[] = [
        K.part(K.tube(cord, 0.011, 64, 6), cordM),
        K.part(new THREE.SphereGeometry(0.026, 12, 8), goldM(), { p: [-0.95, 0.18, 0.03] }),
        K.part(new THREE.SphereGeometry(0.026, 12, 8), goldM(), { p: [0.95, 0.18, 0.03] }),
      ];
      for (let i = 0; i < 9; i++) {
        const x = -0.8 + i * 0.2;
        const drop = 0.05 + ((i * 3) % 4) * 0.012;
        const y = sag(x) - drop;
        parts.push(K.part(K.rod([x, sag(x), 0.035], [x, y + 0.04, 0.035], 0.008, 6), cordM));
        parts.push(puffyStar(0.062, 0.036, mats[i % mats.length]!, { p: [x, y - 0.012, 0.04], r: [0, 0, ((i % 3) - 1) * 0.22] }));
        if (i < 8) parts.push(K.part(new THREE.SphereGeometry(0.022, 12, 8), mats[(i + 1) % mats.length]!, { p: [x + 0.1, sag(x + 0.1) - 0.012, 0.04] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "planet-mobile", name: "Planet Mobile", series: "starry", category: "ceiling", kind: "ceiling", size: [1, 1],
    variants: [
      { name: "Colorful", swatch: "#f6b8c8" },
      { name: "Night Sky", swatch: "#34407a" },
      { name: "Lilac", swatch: "#d3c3f3" },
    ],
    build(v) {
      const p = [
        { hoop: GOLD, big: "#f6c66b", ring: "#f3a7bf", bands: ["#9fd7c9", "#f7efd8", "#7fc3b4"], a: "#f6a6b8", b: "#a8c8f5", star: "#f8d96e", moon: "#fff1b8" },
        { hoop: GOLD, big: "#7c88cf", ring: "#f0c869", bands: ["#b9a8e6", "#efe8ff", "#9d89d2"], a: "#f7d774", b: "#5b68b0", star: "#f8d96e", moon: "#fff1b8" },
        { hoop: "#f3c4d6", big: "#d3c3f3", ring: "#fff1b8", bands: ["#f6b8cc", "#fff3f6", "#e7a2bb"], a: "#c6b4f0", b: "#f9d2df", star: "#fff1b8", moon: "#ffffff" },
      ][v] ?? { hoop: GOLD, big: "#f6c66b", ring: "#f3a7bf", bands: ["#9fd7c9", "#f7efd8", "#7fc3b4"], a: "#f6a6b8", b: "#a8c8f5", star: "#f8d96e", moon: "#fff1b8" };
      const thread = M.paint("#f2ecdf", 0.8);
      const hoopM = v === 2 ? M.gloss(p.hoop, 0.35) : M.metal(p.hoop, 0.3);
      const bandTex = drawn(`starry-planet:${v}`, 128, 64, (g, w, h) => {
        g.fillStyle = p.bands[0]!;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = p.bands[1 + (i % 2)]!;
          g.fillRect(0, (h * (i + 0.5)) / 7, w, h / 14 + (i % 3) * 2);
        }
      });
      const hang = (x: number, z: number, y: number) => K.part(K.rod([x, -0.3, z], [x, y, z], 0.009, 6), thread);
      const parts: THREE.Object3D[] = [
        K.part(K.puck(0.06, 0.03, 0.012, 24), hoopM, { p: [0, -0.03, 0] }),
        K.part(K.rod([0, -0.02, 0], [0, -0.13, 0], 0.01, 6), thread),
        K.part(new THREE.TorusGeometry(0.34, 0.016, 10, 72), hoopM, { p: [0, -0.3, 0], r: [Math.PI / 2, 0, 0] }),
      ];
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        parts.push(K.part(K.rod([0, -0.13, 0], [Math.cos(a) * 0.34, -0.3, Math.sin(a) * 0.34], 0.008, 6), thread));
      }
      // The ringed planet in the middle.
      parts.push(K.part(K.rod([0, -0.13, 0], [0, -0.56, 0], 0.009, 6), thread));
      parts.push(K.group([
        K.part(new THREE.SphereGeometry(0.11, 32, 20), M.gloss(p.big, 0.35)),
        K.part(K.lathe([[0.15, -0.012], [0.22, -0.008], [0.232, 0], [0.22, 0.008], [0.15, 0.012], [0.145, 0], [0.15, -0.012]], 48), M.gloss(p.ring, 0.35)),
      ], { p: [0, -0.66, 0], r: [0.35, 0, 0.25] }));
      // Around the hoop: planets, stars and a moon on threads of different lengths.
      const moon = crescent(0.075, 0.055, 3.6, 0.03, 0.012);
      const items: Array<[number, number, (x: number, y: number, z: number) => THREE.Object3D]> = [
        [0.2, -0.62, (x, y, z) => K.part(new THREE.SphereGeometry(0.075, 28, 18), M.printed(`starry-planet:${v}`, bandTex, 0.45), { p: [x, y, z], r: [0.3, 0, 0.2] })],
        [1.25, -0.5, (x, y, z) => puffyStar(0.07, 0.04, M.gloss(p.star, 0.3), { p: [x, y, z], r: [0, 0, 0.2] })],
        [2.3, -0.78, (x, y, z) => K.part(new THREE.SphereGeometry(0.065, 24, 16), M.gloss(p.a, 0.35), { p: [x, y, z] })],
        [3.35, -0.55, (x, y, z) => K.part(moon.geo, M.gloss(p.moon, 0.3), { p: [x, y, z], r: [0, 0, 0.3] })],
        [4.35, -0.72, (x, y, z) => K.part(new THREE.SphereGeometry(0.055, 24, 16), M.gloss(p.b, 0.35), { p: [x, y, z] })],
        [5.35, -0.48, (x, y, z) => puffyStar(0.055, 0.035, M.gloss(p.star, 0.3), { p: [x, y, z], r: [0, 0, -0.3] })],
      ];
      for (const [a, y, make] of items) {
        const x = Math.cos(a) * 0.34, z = Math.sin(a) * 0.34;
        parts.push(hang(x, z, y + 0.06));
        parts.push(make(x, y, z));
      }
      return K.group(parts);
    },
  },
  {
    id: "round-window", name: "Round Window", series: "starry", category: "window", kind: "wall", size: [1.5, 1.5], hang: 1.75,
    variants: [
      { name: "Night Sky", swatch: "#34407a" },
      { name: "Lavender", swatch: "#b9a7e6" },
      { name: "Milk White", swatch: "#f5f1f9" },
    ],
    build(v) {
      const c = [
        { frame: "#3a4680", metal: GOLD },
        { frame: "#b6a3e3", metal: GOLD },
        { frame: "#f6f2fa", metal: "#dfe3ec" },
      ][v] ?? { frame: "#3a4680", metal: GOLD };
      const frameM = M.gloss(c.frame, 0.35);
      const metalM = M.metal(c.metal, 0.3);
      const ringShape = new THREE.Shape();
      ringShape.absarc(0, 0, 0.66, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.5, 0, Math.PI * 2, true);
      ringShape.holes.push(hole);
      const parts: THREE.Object3D[] = [
        K.part(new THREE.CircleGeometry(0.51, 64), M.skyPane(), { p: [0, 0, 0.02] }),
        K.part(K.extrude(ringShape, 0.13, 0.03, 72), frameM, { p: [0, 0, 0.065] }),
        K.part(new THREE.TorusGeometry(0.5, 0.032, 12, 72), metalM, { p: [0, 0, 0.12] }),
        K.part(new THREE.CircleGeometry(0.49, 64), M.glass("#eef6ff", 0.16), { p: [0, 0, 0.09] }),
        // A cartoon glint on the glass.
        K.part(K.rbox(0.05, 0.22, 0.01, 0.005), M.glass("#ffffff", 0.45), { p: [-0.22, 0.2, 0.095], r: [0, 0, -0.75] }),
        K.part(K.rbox(0.035, 0.1, 0.01, 0.005), M.glass("#ffffff", 0.45), { p: [-0.12, 0.3, 0.095], r: [0, 0, -0.75] }),
        // Hinge and latch.
        K.part(K.rbox(0.1, 0.2, 0.06, 0.025), metalM, { p: [-0.64, 0, 0.11] }),
        K.part(K.rod([-0.64, -0.12, 0.15], [-0.64, 0.12, 0.15], 0.022, 10), metalM),
        K.part(K.rbox(0.09, 0.12, 0.06, 0.025), metalM, { p: [0.64, 0, 0.11] }),
        K.part(new THREE.SphereGeometry(0.035, 14, 10), metalM, { p: [0.64, 0, 0.15] }),
      ];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        parts.push(K.part(new THREE.SphereGeometry(0.03, 14, 10), metalM, { p: [Math.cos(a) * 0.585, Math.sin(a) * 0.585, 0.13], s: [1, 1, 0.6] }));
      }
      // A little star hanging inside.
      parts.push(K.part(K.rod([0.16, 0.48, 0.06], [0.16, 0.26, 0.06], 0.008, 6), M.paint("#f2ecdf", 0.8)));
      parts.push(puffyStar(0.07, 0.035, starGoldM(), { p: [0.16, 0.2, 0.06], r: [0, 0, 0.2] }));
      return K.group(parts);
    },
  },
  {
    id: "cloud-rug", name: "Cloud Rug", series: "starry", category: "rug", kind: "rug", size: [3, 2],
    variants: [
      { name: "White Cloud", swatch: "#f6f3fb" },
      { name: "Lavender", swatch: "#d3c6f3" },
      { name: "Night Sky", swatch: "#3d4a88" },
      { name: "Pink", swatch: "#f7cfdc" },
    ],
    build(v) {
      const c = [
        { bg: "#f6f3fb", stitch: "#c9bdec", ink: ["#f6d36b", "#b9a8e6"] },
        { bg: "#d3c6f3", stitch: "#fbf8ff", ink: ["#fff3c4", "#ffffff"] },
        { bg: "#3d4a88", stitch: "#b9a8e6", ink: ["#f6d36b", "#fff3cf"] },
        { bg: "#f7cfdc", stitch: "#ffffff", ink: ["#fff3c4", "#ffffff"] },
      ][v] ?? { bg: "#f6f3fb", stitch: "#c9bdec", ink: ["#f6d36b", "#b9a8e6"] };
      const W = 3, D = 2;
      const outline = cloudOutline(CLOUD, 2.84, 1.84);
      const px = 220;
      const tex = drawn(`starry-cloudrug:${v}`, W * px, D * px, (g, w, h) => {
        const to = (p: THREE.Vector2, k = 1) => [(0.5 + (p.x * k) / W) * w, (0.5 - (p.y * k) / D) * h] as const;
        g.fillStyle = c.bg;
        g.fillRect(0, 0, w, h);
        // A stitched line just inside the edge.
        g.strokeStyle = c.stitch;
        g.lineWidth = 7;
        g.setLineDash([18, 12]);
        g.lineCap = "round";
        g.beginPath();
        outline.forEach((p, i) => (i ? g.lineTo(...to(p, 0.88)) : g.moveTo(...to(p, 0.88))));
        g.closePath();
        g.stroke();
        g.setLineDash([]);
        const r = rng(41 + v);
        fillShape(g, MOON, w * 0.3, h * 0.38, h * 0.13, -0.5, c.ink[0]!);
        const spots: Array<[number, number, number]> = [[0.5, 0.3, 0.06], [0.66, 0.42, 0.045], [0.42, 0.58, 0.04], [0.76, 0.62, 0.055], [0.58, 0.66, 0.03], [0.2, 0.62, 0.035], [0.86, 0.45, 0.03], [0.36, 0.22, 0.03]];
        spots.forEach(([x, y, s], i) => fillShape(g, STAR, w * x, h * y, h * s, (r() - 0.5) * 0.8, c.ink[i % 2]!));
        g.fillStyle = c.ink[1]!;
        for (let i = 0; i < 26; i++) {
          const x = 0.15 + r() * 0.7, y = 0.2 + r() * 0.6;
          g.globalAlpha = 0.7;
          g.beginPath();
          g.arc(w * x, h * y, 3 + r() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      });
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: 0.015, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.01, 0);
      geo.computeVertexNormals();
      K.planarUV(geo, W, D, "y");
      const mesh = K.part(geo, M.printedCloth(`starry-cloudrug:${v}`, tex), {});
      mesh.castShadow = false;
      return K.group([mesh]);
    },
  },
];
