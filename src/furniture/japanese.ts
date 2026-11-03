// Japanese series: pale hinoki wood, washi paper that glows, indigo and vermilion
// cloth, tatami green. Low pieces for a room where you sit on the floor.

import * as THREE from "three";
import { K, M, cushion, rug } from "./common.ts";
import { drawn, flower, rng } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const WASHI = "#fbf3e1";
const INDIGO = "#3f5a8c";
const VERMILION = "#d4574a";
const INK = "#3a332f";
const BRASS = "#d8b46c";

// The three finishes of the wooden pieces.
const FINISHES = [
  { name: "Hinoki", swatch: "#ebd1a2", wood: "#efd6a8", trim: "#d6b07c", dark: "#a07a55", lacquer: false, metal: "#5d5550" },
  { name: "Chestnut", swatch: "#a06a45", wood: "#ad774f", trim: "#8c5c3d", dark: "#5e3e2c", lacquer: false, metal: "#4f4844" },
  { name: "Vermilion Lacquer", swatch: "#c94e42", wood: "#cf5547", trim: "#ad4539", dark: "#523a33", lacquer: true, metal: BRASS },
];
const finishVariants = FINISHES.map(({ name, swatch }) => ({ name, swatch }));
function finish(v: number) {
  const f = FINISHES[v] ?? FINISHES[0]!;
  const mat = (c: string) => (f.lacquer ? M.gloss(c, 0.3) : M.wood(c));
  return {
    ...f,
    woodM: mat(f.wood),
    trimM: mat(f.trim),
    darkM: f.lacquer ? M.gloss(f.dark, 0.35) : M.wood(f.dark),
    metalM: M.metal(f.metal, f.lacquer ? 0.32 : 0.5),
  };
}

/** A flat picture facing +Z. */
const sheet = (w: number, h: number, mat: THREE.Material, at: K.At = {}) => K.part(new THREE.PlaneGeometry(w, h), mat, at);

function disc(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

function ring(outer: number, inner: number): THREE.Shape {
  const s = disc(outer);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/** A rotation that turns +Y toward `dir`. */
function aim(o: THREE.Object3D, dir: K.V3): THREE.Object3D {
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  return o;
}

// ---------- Cloth patterns ----------

function seigaiha(g: CanvasRenderingContext2D, w: number, h: number, R: number, bg: string, ink: string): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (let j = -1; j * R * 0.5 < h + R; j++) {
    const y = j * R * 0.5;
    for (let x = (j & 1 ? R : 0) - 2 * R; x < w + R; x += 2 * R) {
      [1, 0.88, 0.7, 0.58, 0.4, 0.28, 0.12].forEach((k, i) => {
        g.fillStyle = i % 2 ? bg : ink;
        g.beginPath();
        g.arc(x, y, R * k, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
}

function sakura(g: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, centre: string, turn = 0): void {
  g.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = turn + (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    g.rotate(a + Math.PI / 2);
    // A petal with a notch at its tip.
    g.beginPath();
    g.moveTo(0, r * 0.45);
    g.bezierCurveTo(-r * 0.55, r * 0.2, -r * 0.42, -r * 0.5, -r * 0.1, -r * 0.5);
    g.lineTo(0, -r * 0.36);
    g.lineTo(r * 0.1, -r * 0.5);
    g.bezierCurveTo(r * 0.42, -r * 0.5, r * 0.55, r * 0.2, 0, r * 0.45);
    g.fill();
    g.restore();
  }
  g.fillStyle = centre;
  g.beginPath();
  g.arc(x, y, r * 0.18, 0, Math.PI * 2);
  g.fill();
}

function kikko(g: CanvasRenderingContext2D, w: number, h: number, a: number, bg: string, ink: string): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = ink;
  g.lineWidth = a * 0.16;
  g.lineJoin = "round";
  const dy = Math.sqrt(3) * a;
  for (let i = -1; i * 1.5 * a < w + a; i++) {
    for (let j = -1; j * dy < h + dy; j++) {
      const cx = i * 1.5 * a, cy = j * dy + (i & 1 ? dy / 2 : 0);
      g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(cx + Math.cos((k * Math.PI) / 3) * a * 0.86, cy + Math.sin((k * Math.PI) / 3) * a * 0.86);
      g.closePath();
      g.stroke();
      if ((i + j) % 3 === 0) {
        g.fillStyle = ink;
        g.beginPath();
        g.arc(cx, cy, a * 0.16, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

const FUTONS = [
  { name: "Indigo Dye", swatch: "#3f5a8c", bg: "#43609a", ink: "#e3ebf7", border: "#f3ead6", lining: "#f6efe1", tuft: VERMILION, pattern: "wave" },
  { name: "Vermilion", swatch: "#d4574a", bg: "#d65b4d", ink: "#fdf0e2", border: "#f6e9d3", lining: "#f6efe1", tuft: INDIGO, pattern: "plum" },
  { name: "Sakura", swatch: "#f3bcc6", bg: "#f5c3cc", ink: "#fff8f5", border: "#fdf5ee", lining: "#fdf7f0", tuft: "#e0738c", pattern: "sakura" },
  { name: "Matcha", swatch: "#a3bb7e", bg: "#a5bc80", ink: "#f4f2de", border: "#f4eedb", lining: "#f6efe1", tuft: "#8a5f3d", pattern: "kikko" },
];

function clothPattern(kind: string, bg: string, ink: string): Draw {
  return (g, w, h) => {
    const r = rng(kind.length * 31 + 7);
    if (kind === "wave") seigaiha(g, w, h, w / 10, bg, ink);
    else if (kind === "kikko") kikko(g, w, h, w / 12, bg, ink);
    else {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const cell = w / 6;
      for (let j = 0; j * cell < h + cell; j++) {
        for (let i = -1; i < 7; i++) {
          const x = (i + 0.5 + (j % 2) * 0.5) * cell + (r() - 0.5) * cell * 0.3;
          const y = (j + 0.5) * cell + (r() - 0.5) * cell * 0.3;
          const s = cell * (0.26 + r() * 0.1);
          if (kind === "plum") flower(g, x, y, s, ink, "#f2c45a", 5);
          else sakura(g, x, y, s, ink, "#e88aa0", r() * 1.2);
          // A scattered petal between the flowers.
          g.fillStyle = ink;
          g.beginPath();
          g.ellipse(x + cell * 0.5, y + cell * 0.45, s * 0.18, s * 0.11, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  };
}

// ---------- Paintings ----------

function seal(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = "#c8463b";
  g.fillRect(x, y, s, s);
  g.strokeStyle = "#f6e6d6";
  g.lineWidth = s * 0.08;
  g.strokeRect(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64);
  g.beginPath();
  g.moveTo(x + s * 0.5, y + s * 0.2);
  g.lineTo(x + s * 0.5, y + s * 0.8);
  g.stroke();
}

function mountain(g: CanvasRenderingContext2D, pts: Array<[number, number]>, base: number, fill: string | CanvasGradient): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(pts[0]![0], base);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!;
    g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  const last = pts[pts.length - 1]!;
  g.lineTo(last[0], last[1]);
  g.lineTo(last[0], base);
  g.closePath();
  g.fill();
}

/** A long cloud band with round ends (suyari-gasumi). */
function mistBand(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x + h / 2, y);
  g.lineTo(x + w - h / 2, y);
  g.arc(x + w - h / 2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + h / 2, y + h);
  g.arc(x + h / 2, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5);
  g.fill();
}

const inkLandscape: Draw = (g, w, h) => {
  g.fillStyle = "#f6efdc";
  g.fillRect(0, 0, w, h);
  const far = g.createLinearGradient(0, h * 0.15, 0, h * 0.5);
  far.addColorStop(0, "#b9b5ad");
  far.addColorStop(1, "#ece6d6");
  mountain(g, [[-20, h * 0.42], [w * 0.2, h * 0.2], [w * 0.38, h * 0.32], [w * 0.62, h * 0.1], [w * 0.85, h * 0.3], [w + 20, h * 0.25]], h * 0.55, far);
  mistBand(g, w * 0.05, h * 0.4, w * 0.7, h * 0.05, "#f6efdcdd");
  const mid = g.createLinearGradient(0, h * 0.4, 0, h * 0.75);
  mid.addColorStop(0, "#7d7972");
  mid.addColorStop(1, "#e2dccb");
  mountain(g, [[-20, h * 0.62], [w * 0.15, h * 0.45], [w * 0.32, h * 0.56], [w * 0.5, h * 0.66]], h * 0.8, mid);
  mountain(g, [[w * 0.45, h * 0.7], [w * 0.75, h * 0.5], [w + 20, h * 0.6]], h * 0.85, mid);
  // A near rock with a pine on it.
  g.fillStyle = "#5a5651";
  mountain(g, [[-10, h * 0.8], [w * 0.12, h * 0.68], [w * 0.3, h * 0.78], [w * 0.36, h * 0.86]], h + 10, "#56524d");
  g.strokeStyle = "#4a4743";
  g.lineWidth = w * 0.022;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(w * 0.14, h * 0.72);
  g.quadraticCurveTo(w * 0.1, h * 0.62, w * 0.2, h * 0.56);
  g.stroke();
  g.fillStyle = "#4f6a52";
  for (const [x, y, rx] of [[0.2, 0.55, 0.1], [0.11, 0.6, 0.07], [0.27, 0.6, 0.07]] as const) {
    g.beginPath();
    g.ellipse(w * x, h * y, w * rx, w * rx * 0.38, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Water lines and a little boat.
  g.strokeStyle = "#9b978f";
  g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(w * (0.45 + i * 0.05), h * (0.86 + i * 0.03));
    g.lineTo(w * (0.75 + i * 0.04), h * (0.86 + i * 0.03));
    g.stroke();
  }
  g.fillStyle = "#4d4945";
  g.beginPath();
  g.moveTo(w * 0.55, h * 0.84);
  g.quadraticCurveTo(w * 0.62, h * 0.875, w * 0.7, h * 0.84);
  g.lineTo(w * 0.55, h * 0.84);
  g.fill();
  g.fillRect(w * 0.62, h * 0.8, w * 0.01, h * 0.04);
  seal(g, w * 0.8, h * 0.06, w * 0.08);
  g.fillStyle = INK;
  for (let i = 0; i < 5; i++) g.fillRect(w * 0.83, h * (0.16 + i * 0.035), w * 0.025, h * 0.022);
};

const moonRabbit: Draw = (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#d9dbe6");
  sky.addColorStop(1, "#f5efdd");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#f8dc86";
  g.beginPath();
  g.arc(w * 0.6, h * 0.3, w * 0.24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fbe9a8";
  g.beginPath();
  g.arc(w * 0.57, h * 0.28, w * 0.2, 0, Math.PI * 2);
  g.fill();
  mistBand(g, w * 0.1, h * 0.43, w * 0.75, h * 0.035, "#ffffffb0");
  // Pampas grass.
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const x = w * (0.05 + i * 0.11);
    const top = h * (0.5 + (i % 3) * 0.06);
    g.strokeStyle = "#a99560";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, h);
    g.quadraticCurveTo(x + w * 0.02, (top + h) / 2, x + w * (i % 2 ? 0.06 : -0.04), top);
    g.stroke();
    g.fillStyle = "#e7d8a8";
    g.beginPath();
    g.ellipse(x + w * (i % 2 ? 0.06 : -0.04), top, w * 0.025, h * 0.05, i % 2 ? 0.4 : -0.3, 0, Math.PI * 2);
    g.fill();
  }
  // The rabbit, sitting and looking up at the moon.
  const rx = w * 0.36, ry = h * 0.8, s = w * 0.15;
  g.fillStyle = "#fffdf8";
  g.strokeStyle = "#8d8780";
  g.lineWidth = 2.5;
  const blob = (x: number, y: number, a: number, b: number, rot = 0) => {
    g.beginPath();
    g.ellipse(x, y, a, b, rot, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  blob(rx + s * 0.38, ry - s * 1.38, s * 0.16, s * 0.48, 0.45);
  blob(rx + s * 0.12, ry - s * 1.32, s * 0.16, s * 0.5, 0.15);
  blob(rx, ry, s * 0.75, s * 0.6);
  blob(rx + s * 0.35, ry - s * 0.7, s * 0.42, s * 0.36, -0.3);
  g.fillStyle = "#fffdf8";
  g.beginPath();
  g.ellipse(rx, ry, s * 0.72, s * 0.57, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f2b4c0";
  g.beginPath();
  g.ellipse(rx + s * 0.38, ry - s * 1.38, s * 0.07, s * 0.32, 0.45, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#d4574a";
  g.beginPath();
  g.arc(rx + s * 0.52, ry - s * 0.78, s * 0.06, 0, Math.PI * 2);
  g.fill();
  seal(g, w * 0.08, h * 0.08, w * 0.08);
};

const calligraphy: Draw = (g, w, h) => {
  g.fillStyle = "#f7f0de";
  g.fillRect(0, 0, w, h);
  // An ensō: one brush circle, heavy where the brush lands and dry where it lifts.
  const cx = w * 0.5, cy = h * 0.42, r = w * 0.29;
  const start = -Math.PI * 0.4, sweep = Math.PI * 1.8, steps = 72;
  g.strokeStyle = INK;
  g.lineCap = "round";
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    g.lineWidth = w * (0.09 * Math.pow(1 - t, 0.55) + 0.014);
    g.globalAlpha = 1 - t * 0.5;
    g.beginPath();
    g.arc(cx, cy, r * (1 + 0.035 * Math.sin(t * 9)), start + sweep * t, start + sweep * (t + 1 / steps) + 0.01);
    g.stroke();
  }
  g.globalAlpha = 1;
  // A signature: three short strokes down the side, and two seals.
  g.lineWidth = w * 0.014;
  for (let i = 0; i < 3; i++) {
    const y = h * (0.7 + i * 0.065);
    g.beginPath();
    g.moveTo(w * 0.765, y);
    g.quadraticCurveTo(w * 0.81, y + h * 0.012, w * 0.78, y + h * 0.04);
    g.stroke();
  }
  seal(g, w * 0.74, h * 0.9, w * 0.08);
  g.fillStyle = "#c8463b";
  g.beginPath();
  g.ellipse(w * 0.16, h * 0.1, w * 0.035, w * 0.06, 0, 0, Math.PI * 2);
  g.fill();
};

const goldScreen: Draw = (g, w, h) => {
  // Gold leaf, laid in squares.
  const s = w / 16;
  const golds = ["#efd27c", "#e9c96c", "#f3db8c", "#e6c463", "#edd078"];
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    g.fillStyle = golds[Math.floor((x / s) * 7 + (y / s) * 3) % golds.length]!;
    g.fillRect(x, y, s + 1, s + 1);
  }
  // Water across the bottom with curling waves.
  g.fillStyle = "#5b84c2";
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.78 + Math.sin(x / w * Math.PI * 5) * h * 0.025);
  g.lineTo(w, h);
  g.fill();
  g.strokeStyle = "#e9f1fb";
  g.lineWidth = 4;
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const x = w * (0.05 + i * 0.11), y = h * (0.86 + (i % 2) * 0.06);
    g.beginPath();
    g.arc(x, y, h * 0.03, Math.PI, Math.PI * 2.4);
    g.stroke();
  }
  // Cloud bands.
  mistBand(g, w * 0.3, h * 0.12, w * 0.45, h * 0.06, "#fbf3dc");
  mistBand(g, w * 0.55, h * 0.48, w * 0.4, h * 0.05, "#fbf3dc");
  mistBand(g, -w * 0.05, h * 0.62, w * 0.35, h * 0.05, "#fbf3dc");
  // An old pine reaching across the left half.
  g.strokeStyle = "#7a5a44";
  g.lineWidth = w * 0.03;
  g.beginPath();
  g.moveTo(w * 0.1, h * 0.8);
  g.bezierCurveTo(w * 0.05, h * 0.55, w * 0.25, h * 0.45, w * 0.18, h * 0.3);
  g.stroke();
  g.lineWidth = w * 0.015;
  g.beginPath();
  g.moveTo(w * 0.15, h * 0.5);
  g.quadraticCurveTo(w * 0.3, h * 0.42, w * 0.42, h * 0.36);
  g.stroke();
  g.fillStyle = "#4f8a5a";
  for (const [x, y, r] of [[0.18, 0.28, 0.09], [0.1, 0.36, 0.06], [0.28, 0.4, 0.07], [0.42, 0.34, 0.07], [0.06, 0.5, 0.05]] as const) {
    g.beginPath();
    g.ellipse(w * x, h * y, w * r, w * r * 0.32 * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#6aa36e";
  for (const [x, y, r] of [[0.19, 0.265, 0.06], [0.29, 0.385, 0.045], [0.43, 0.325, 0.045]] as const) {
    g.beginPath();
    g.ellipse(w * x, h * y, w * r, w * r * 0.25 * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Two cranes flying on the right.
  for (const [x, y] of [[0.72, 0.28], [0.82, 0.36]] as const) {
    g.fillStyle = "#fffdf6";
    g.beginPath();
    g.ellipse(w * x, h * y, w * 0.025, h * 0.012, -0.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(w * (x - 0.01), h * y);
    g.quadraticCurveTo(w * (x - 0.02), h * (y - 0.05), w * (x + 0.03), h * (y - 0.06));
    g.quadraticCurveTo(w * x, h * (y - 0.02), w * (x + 0.01), h * y);
    g.fill();
    g.fillStyle = "#d4574a";
    g.beginPath();
    g.arc(w * (x - 0.026), h * (y - 0.004), 3, 0, Math.PI * 2);
    g.fill();
  }
};

const sakuraScreen: Draw = (g, w, h) => {
  g.fillStyle = "#f8efdf";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#d6e4b6";
  g.beginPath();
  g.moveTo(0, h);
  g.quadraticCurveTo(w * 0.3, h * 0.78, w * 0.6, h * 0.88);
  g.quadraticCurveTo(w * 0.85, h * 0.95, w, h * 0.84);
  g.lineTo(w, h);
  g.fill();
  mistBand(g, w * 0.5, h * 0.18, w * 0.42, h * 0.05, "#efe1c8");
  mistBand(g, w * 0.05, h * 0.66, w * 0.38, h * 0.05, "#efe1c8");
  // The branch and its twigs.
  g.strokeStyle = "#6e4b3a";
  g.lineCap = "round";
  const twigs: Array<[number, number, number, number, number, number, number]> = [
    [0, 0.2, 0.25, 0.3, 0.55, 0.26, 0.022],
    [0.55, 0.26, 0.72, 0.24, 0.98, 0.4, 0.014],
    [0.25, 0.28, 0.3, 0.42, 0.38, 0.52, 0.011],
    [0.6, 0.26, 0.62, 0.36, 0.7, 0.46, 0.01],
    [0.42, 0.28, 0.5, 0.16, 0.6, 0.1, 0.009],
  ];
  for (const [x0, y0, cx, cy, x1, y1, lw] of twigs) {
    g.lineWidth = w * lw;
    g.beginPath();
    g.moveTo(w * x0, h * y0);
    g.quadraticCurveTo(w * cx, h * cy, w * x1, h * y1);
    g.stroke();
  }
  const r = rng(11);
  for (const [x0, y0, cx, cy, x1, y1] of twigs) {
    for (let i = 0; i < 9; i++) {
      const t = 0.2 + r() * 0.8;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      sakura(g, w * x + (r() - 0.5) * 30, h * y + (r() - 0.5) * 24, w * (0.022 + r() * 0.012), r() > 0.35 ? "#f4b2c2" : "#fde3ea", "#d9667f", r() * 2);
    }
  }
  g.fillStyle = "#f4b2c2";
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.ellipse(r() * w, h * (0.35 + r() * 0.55), 5, 3, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
};

const fujiScreen: Draw = (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#bcd8ef");
  sky.addColorStop(0.7, "#f6efe0");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#e0604f";
  g.beginPath();
  g.arc(w * 0.76, h * 0.2, w * 0.06, 0, Math.PI * 2);
  g.fill();
  // Fuji with its snow cap.
  const peak = w * 0.42;
  g.fillStyle = "#5a76b3";
  g.beginPath();
  g.moveTo(w * 0.08, h * 0.74);
  g.quadraticCurveTo(w * 0.3, h * 0.5, peak - w * 0.05, h * 0.27);
  g.lineTo(peak + w * 0.05, h * 0.27);
  g.quadraticCurveTo(w * 0.55, h * 0.5, w * 0.78, h * 0.74);
  g.fill();
  g.fillStyle = "#fbfbf6";
  g.beginPath();
  g.moveTo(peak - w * 0.05, h * 0.27);
  g.lineTo(peak + w * 0.05, h * 0.27);
  g.quadraticCurveTo(w * 0.47, h * 0.33, w * 0.5, h * 0.38);
  for (let i = 0; i <= 6; i++) g.lineTo(w * (0.5 - i * 0.027), h * (0.38 + (i % 2 ? -0.03 : 0.01)));
  g.quadraticCurveTo(w * 0.36, h * 0.33, peak - w * 0.05, h * 0.27);
  g.fill();
  mistBand(g, w * 0.02, h * 0.56, w * 0.3, h * 0.045, "#ffffffd8");
  mistBand(g, w * 0.55, h * 0.6, w * 0.36, h * 0.045, "#ffffffd8");
  // The sea, with white crests.
  g.fillStyle = "#3f5a8c";
  g.fillRect(0, h * 0.74, w, h * 0.26);
  g.strokeStyle = "#f2f5fb";
  g.lineWidth = 3.5;
  for (let row = 0; row < 3; row++) {
    for (let x = (row % 2) * 24; x < w + 30; x += 48) {
      const y = h * (0.8 + row * 0.07);
      g.beginPath();
      g.arc(x, y, 18, Math.PI, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(x, y, 9, Math.PI, Math.PI * 2);
      g.stroke();
    }
  }
};

// ---------- Lantern papers (wrapped around a lathe: u around, v up) ----------

function lanternPaper(bg: string, band: string, mark: (g: CanvasRenderingContext2D, x: number, y: number, s: number) => void): Draw {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = band;
    g.fillRect(0, h * 0.06, w, h * 0.07);
    g.fillRect(0, h * 0.87, w, h * 0.07);
    // One mark at the front (u = 0.5) and one at the back (u = 0 and 1).
    for (const x of [0, w / 2, w]) mark(g, x, h * 0.5, h * 0.27);
  };
}

const LANTERNS = [
  {
    name: "White Paper", swatch: "#fbf1dc", glow: "#ffe2a8",
    draw: lanternPaper("#fbf1dc", VERMILION, (g, x, y, s) => {
      g.fillStyle = VERMILION;
      g.beginPath();
      g.ellipse(x, y, s * 0.9, s, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(x, y);
      g.scale(0.9, 1);
      sakura(g, 0, 0, s * 0.85, "#fbf1dc", VERMILION);
      g.restore();
    }),
  },
  {
    name: "Red Lantern", swatch: "#e0604f", glow: "#ffd2a0",
    draw: lanternPaper("#e45f4c", "#4a332e", (g, x, y, s) => {
      // A mitsudomoe, the festival crest: three commas, each a round head
      // whose tail sweeps out to the rim, drawn as a run of shrinking dots.
      g.fillStyle = "#3d2b27";
      g.save();
      g.translate(x, y);
      g.scale(0.85, 1);
      const R = s * 0.82, steps = 48;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        for (let k = 0; k <= steps; k++) {
          const f = k / steps;
          const rho = R * (0.4 + 0.52 * Math.sqrt(f));
          const ang = a - 1.9 * f;
          g.beginPath();
          g.arc(Math.cos(ang) * rho, Math.sin(ang) * rho, Math.max(R * 0.3 * Math.pow(1 - f, 1.15), 0.4), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }),
  },
  {
    name: "Cherry Blossom", swatch: "#f5c3cc", glow: "#ffe2b8",
    draw: ((g, w, h) => {
      g.fillStyle = "#f7cad2";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fdf3ee";
      g.fillRect(0, h * 0.06, w, h * 0.07);
      g.fillRect(0, h * 0.87, w, h * 0.07);
      const r = rng(5);
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * w + r() * 20, y = h * (0.25 + r() * 0.5);
        g.save();
        g.translate(x, y);
        g.scale(0.9, 1);
        sakura(g, 0, 0, h * (0.08 + r() * 0.06), "#fffaf6", "#e88aa0", r() * 2);
        g.restore();
      }
    }) as Draw,
  },
];

// ---------- Tatami ----------

function tatamiMat(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, line: string, across: boolean, heri: string | null): void {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  // Rush strands run across the mat's short side.
  g.fillStyle = line;
  const step = 5;
  if (across) for (let yy = y + 2; yy < y + h; yy += step) g.fillRect(x, yy, w, 1.6);
  else for (let xx = x + 2; xx < x + w; xx += step) g.fillRect(xx, y, 1.6, h);
  if (heri) {
    // Cloth borders along the long sides, with a small woven pattern.
    const b = Math.min(w, h) * 0.075;
    const sides: Array<[number, number, number, number]> = across ? [[x, y, b, h], [x + w - b, y, b, h]] : [[x, y, w, b], [x, y + h - b, w, b]];
    for (const [sx, sy, sw, sh] of sides) {
      g.fillStyle = heri;
      g.fillRect(sx, sy, sw, sh);
      g.fillStyle = "#ffffff40";
      const n = Math.max(sw, sh) / 14;
      for (let i = 0; i < n; i++) {
        const cx = across ? sx + sw / 2 : sx + i * 14 + 7;
        const cy = across ? sy + i * 14 + 7 : sy + sh / 2;
        g.beginPath();
        g.arc(cx, cy, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.strokeStyle = "#00000022";
  g.lineWidth = 3;
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

export const JAPANESE: FurnitureDef[] = [
  {
    id: "futon", name: "Futon", series: "japanese", category: "bed", kind: "floor", size: [2, 2],
    variants: FUTONS.map(({ name, swatch }) => ({ name, swatch })),
    build(v) {
      const f = FUTONS[v] ?? FUTONS[0]!;
      const quiltTex = drawn(`jp-futon:${v}`, 440, 380, (g, w, h) => {
        clothPattern(f.pattern, f.bg, f.ink)(g, w, h);
        const b = w * 0.075;
        g.strokeStyle = f.border;
        g.lineWidth = b * 2;
        g.strokeRect(0, 0, w, h);
        g.setLineDash([9, 7]);
        g.lineWidth = 2.5;
        g.strokeStyle = f.pattern === "sakura" ? "#e9a3b2" : "#ffffffaa";
        g.strokeRect(b * 0.5, b * 0.5, w - b, h - b);
        g.setLineDash([]);
      });
      const pillowTex = drawn(`jp-futon-pillow:${v}`, 256, 140, (g, w, h) => {
        g.fillStyle = "#f7f0e0";
        g.fillRect(0, 0, w, h);
        g.fillStyle = f.pattern === "wave" ? INDIGO : f.bg;
        for (let x = 10; x < w; x += 36) g.fillRect(x, 0, 12, h);
        g.fillStyle = "#ffffff55";
        for (let x = 25; x < w; x += 36) g.fillRect(x, 0, 4, h);
      });
      const quiltGeo = K.planarUV(K.soft(1.58, 0.13, 1.36, 0.22, 0.06), 1.58, 1.36, "y");
      const pillowGeo = K.planarUV(K.soft(0.64, 0.16, 0.34, 0.45, 0.25), 0.64, 0.34, "y");
      const tuft = M.fabric(f.tuft, 0.5);
      const parts: THREE.Object3D[] = [
        // The mattress, with a piped seam round its middle.
        cushion([0, 0.09, 0], 1.5, 0.18, 1.86, M.fabric("#fbf6ea", 0.5), [0, 0, 0], 0.2, 0.08),
        cushion([0, 0.085, 0], 1.53, 0.035, 1.89, M.fabric("#ecdcbf", 0.5), [0, 0, 0], 0.5, 0),
        K.part(quiltGeo, M.printedCloth(`jp-futon:${v}`, quiltTex, false), { p: [0, 0.235, 0.27] }),
        // The quilt's top edge turned back over itself.
        cushion([0, 0.3, -0.36], 1.6, 0.075, 0.2, M.fabric(f.lining, 0.6), [0.12, 0, 0], 0.45, 0),
        K.part(pillowGeo, M.printedCloth(`jp-futon-pillow:${v}`, pillowTex, false), { p: [0, 0.25, -0.68], r: [-0.12, 0, 0] }),
      ];
      // Thread ties across the quilt.
      for (const x of [-0.42, 0, 0.42]) {
        for (const z of [0.08, 0.44, 0.78]) parts.push(K.part(K.soft(0.05, 0.03, 0.05, 0.7, 0, 12), tuft, { p: [x, 0.3, z] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "chabudai", name: "Round Low Table", series: "japanese", category: "table", kind: "floor", size: [1.5, 1.5], variants: finishVariants,
    surface: { rect: [-0.75, -0.75, 0.75, 0.75], y: 0.35 },
    build(v) {
      const f = finish(v);
      const legM = f.lacquer ? f.darkM : f.trimM;
      const parts: THREE.Object3D[] = [
        K.part(K.puck(0.7, 0.06, 0.028, 64), f.woodM, { p: [0, 0.29, 0] }),
        // A rounded edge band round the top.
        K.part(new THREE.TorusGeometry(0.695, 0.024, 10, 72), legM, { p: [0, 0.318, 0], r: [Math.PI / 2, 0, 0] }),
        // A darker band under the rim, then the apron.
        K.part(K.puck(0.66, 0.03, 0.012, 64), legM, { p: [0, 0.27, 0] }),
        K.part(K.puck(0.5, 0.06, 0.02, 48), f.trimM, { p: [0, 0.22, 0] }),
      ];
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        parts.push(K.part(K.lathe([[0, 0], [0.04, 0], [0.052, 0.025], [0.044, 0.1], [0.05, 0.19], [0.06, 0.23], [0, 0.23]], 20), legM, { p: [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "zabuton", name: "Floor Cushion", series: "japanese", category: "seat", kind: "floor", size: [1, 1],
    variants: [
      { name: "Indigo", swatch: "#4a66a0" },
      { name: "Cinnabar", swatch: "#d65d4e" },
      { name: "Matcha", swatch: "#9dba7a" },
      { name: "Cherry Blossom", swatch: "#f2b8c4" },
    ],
    build(v) {
      const c = [
        { base: "#4a66a0", dot: "#c9d6ef", tassel: "#e9c46a" },
        { base: "#d65d4e", dot: "#f9dccd", tassel: "#f3e2b4" },
        { base: "#9dba7a", dot: "#f0f4de", tassel: VERMILION },
        { base: "#f2b8c4", dot: "#fff4f2", tassel: "#e0738c" },
      ][v] ?? { base: "#4a66a0", dot: "#c9d6ef", tassel: "#e9c46a" };
      const tex = drawn(`jp-zabuton:${v}`, 256, 256, (g, w, h) => {
        g.fillStyle = c.base;
        g.fillRect(0, 0, w, h);
        // Kasuri crosses, a little blurred like a resist dye.
        g.strokeStyle = c.dot;
        g.lineCap = "round";
        g.lineWidth = 5;
        const s = w / 7;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const x = (i + (j % 2) * 0.5) * s, y = j * s;
          g.globalAlpha = 0.75;
          g.beginPath();
          g.moveTo(x - 7, y); g.lineTo(x + 7, y);
          g.moveTo(x, y - 7); g.lineTo(x, y + 7);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.strokeStyle = c.dot;
        g.lineWidth = 6;
        g.strokeRect(10, 10, w - 20, h - 20);
      });
      const geo = K.planarUV(K.soft(0.72, 0.15, 0.72, 0.3, 0.38), 0.72, 0.72, "y");
      const tasselM = M.fabric(c.tassel, 0.7);
      const parts: THREE.Object3D[] = [K.part(geo, M.printedCloth(`jp-zabuton:${v}`, tex, false), { p: [0, 0.08, 0] })];
      // Tassels at the corners.
      for (const [x, , z] of K.corners(0.66, 0.66)) {
        const knot = K.part(new THREE.SphereGeometry(0.026, 14, 10), tasselM, { p: [x, 0.08, z] });
        const tail = aim(K.part(K.lathe([[0, 0], [0.012, 0.0], [0.03, 0.04], [0.032, 0.07], [0.02, 0.085], [0, 0.085]], 14), tasselM, { p: [x, 0.08, z] }), [Math.sign(x), -0.9, Math.sign(z)]);
        parts.push(knot, tail);
      }
      // The three-way tie in the middle.
      for (let i = 0; i < 3; i++) parts.push(K.part(K.rbox(0.11, 0.024, 0.03, 0.012), tasselM, { p: [0, 0.158, 0], r: [0, (i * Math.PI) / 3, 0] }));
      parts.push(K.part(new THREE.SphereGeometry(0.024, 12, 8), tasselM, { p: [0, 0.165, 0] }));
      return K.group(parts);
    },
  },
  {
    id: "andon", name: "Andon Lamp", series: "japanese", category: "lamp", kind: "floor", size: [1, 1], variants: finishVariants,
    light: { at: [0, 0.98, 0], color: "#ffe2a8", intensity: 1.5, distance: 3.6, halo: 0.9, startsOn: true },
    build(v) {
      const f = finish(v);
      const frame = f.woodM;
      // Washi lit from inside: faint on the outside, bright within.
      const paper = M.glow("#ffe2a8", WASHI, 0.32, 0.85);
      const inner = M.glow("#ffe2a8", "#fff6e0", 2.6, 0.9);
      inner.side = THREE.BackSide;
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(0.58, 0.07, 0.58, 0.03), f.trimM, { p: [0, 0.075, 0] }),
        ...K.corners(0.48, 0.48).map(([x, , z]) => K.part(K.rbox(0.09, 0.05, 0.09, 0.02), f.darkM, { p: [x, 0.025, z] })),
        K.part(K.rbox(0.4, 0.6, 0.4, 0.03), paper, { p: [0, 0.6, 0] }),
        K.part(K.rbox(0.39, 0.59, 0.39, 0.03, 2), inner, { p: [0, 0.6, 0] }),
        ...K.corners(0.44, 0.44).map(([x, , z]) => K.part(K.rbox(0.06, 0.92, 0.06, 0.025, 2, "y"), frame, { p: [x, 0.57, z] })),
      ];
      for (const y of [0.29, 0.92]) {
        for (const s of [-1, 1]) {
          parts.push(K.part(K.rbox(0.5, 0.05, 0.05, 0.02, 2), frame, { p: [0, y, s * 0.22] }));
          parts.push(K.part(K.rbox(0.05, 0.05, 0.5, 0.02, 2), frame, { p: [s * 0.22, y, 0] }));
        }
      }
      // A lattice over the paper on every side.
      for (let side = 0; side < 4; side++) {
        parts.push(K.group([
          K.part(K.rbox(0.4, 0.026, 0.026, 0.012, 2), frame, { p: [0, 0.5, 0.205] }),
          K.part(K.rbox(0.4, 0.026, 0.026, 0.012, 2), frame, { p: [0, 0.7, 0.205] }),
          K.part(K.rbox(0.026, 0.6, 0.026, 0.012, 2), frame, { p: [0, 0.6, 0.205] }),
        ], { r: [0, (side * Math.PI) / 2, 0] }));
      }
      // The carrying handle on top.
      parts.push(K.part(K.tube([[-0.2, 0.93, 0], [-0.17, 1.05, 0], [0, 1.1, 0], [0.17, 1.05, 0], [0.2, 0.93, 0]], 0.022, 32, 10), frame));
      return K.group(parts);
    },
  },
  {
    id: "tansu", name: "Tansu Chest", series: "japanese", category: "storage", kind: "floor", size: [2, 1], variants: finishVariants,
    surface: { rect: [-1, -0.5, 1, 0.5], y: 1.04 },
    build(v) {
      const f = finish(v);
      const body = f.lacquer ? f.woodM : f.trimM;
      const front = f.lacquer ? f.trimM : f.woodM;
      const iron = f.metalM;
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.9, 0.08, 0.82, 0.03), f.darkM, { p: [0, 0.04, 0.01] }),
        K.part(K.rbox(1.88, 0.48, 0.8, 0.04), body, { p: [0, 0.32, 0.01] }),
        K.part(K.rbox(1.92, 0.05, 0.86, 0.022), f.darkM, { p: [0, 0.58, 0.01] }),
        K.part(K.rbox(1.8, 0.4, 0.78, 0.04), body, { p: [0, 0.8, 0] }),
        K.part(K.rbox(1.92, 0.055, 0.84, 0.025), f.lacquer ? f.darkM : f.woodM, { p: [0, 1.0125, -0.01] }),
      ];
      // An arched iron pull on a plate.
      const pull = (x: number, y: number, z: number, w: number) => K.group([
        K.part(K.rbox(w + 0.1, 0.08, 0.02, 0.01, 2), iron, { p: [0, 0, 0.01] }),
        K.part(K.tube([[-w / 2, 0.012, 0.025], [-w * 0.4, -0.035, 0.04], [0, -0.052, 0.045], [w * 0.4, -0.035, 0.04], [w / 2, 0.012, 0.025]], 0.013, 16, 6), iron),
        K.part(new THREE.SphereGeometry(0.02, 10, 6), iron, { p: [-w / 2, 0.012, 0.024] }),
        K.part(new THREE.SphereGeometry(0.02, 10, 6), iron, { p: [w / 2, 0.012, 0.024] }),
      ], { p: [x, y, z] });
      // L-shaped plates on the front corners of a box.
      const cornersOf = (cx: number, cy: number, w: number, h: number, z: number) => {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const x = cx + (sx * w) / 2, y = cy + (sy * h) / 2;
          parts.push(K.part(K.rbox(0.14, 0.045, 0.02, 0.01, 2), iron, { p: [x - sx * 0.07, y - sy * 0.0225, z] }));
          parts.push(K.part(K.rbox(0.045, 0.14, 0.02, 0.01, 2), iron, { p: [x - sx * 0.0225, y - sy * 0.07, z] }));
        }
      };
      // Two long drawers below.
      for (const y of [0.205, 0.435]) {
        parts.push(K.part(K.rbox(1.76, 0.2, 0.04, 0.02, 3), front, { p: [0, y, 0.42] }));
        parts.push(pull(-0.45, y + 0.02, 0.44, 0.16), pull(0.45, y + 0.02, 0.44, 0.16));
      }
      cornersOf(0, 0.32, 1.88, 0.48, 0.415);
      // Above: a small door with a lock plate, and two small drawers.
      parts.push(K.part(K.rbox(0.84, 0.32, 0.04, 0.02), front, { p: [-0.44, 0.795, 0.4] }));
      parts.push(K.part(K.puck(0.085, 0.02, 0.008, 32), iron, { p: [-0.3, 0.795, 0.42], r: [Math.PI / 2, 0, 0] }));
      parts.push(K.part(K.puck(0.055, 0.02, 0.008, 32), front, { p: [-0.3, 0.795, 0.43], r: [Math.PI / 2, 0, 0] }));
      parts.push(K.part(K.rbox(0.022, 0.05, 0.02, 0.008), f.darkM, { p: [-0.3, 0.79, 0.445] }));
      for (const y of [0.7, 0.89]) parts.push(K.part(K.rbox(0.06, 0.07, 0.02, 0.01), iron, { p: [-0.83, y, 0.425] }));
      for (const y of [0.705, 0.885]) {
        parts.push(K.part(K.rbox(0.86, 0.16, 0.04, 0.02), front, { p: [0.44, y, 0.4] }));
        parts.push(pull(0.44, y + 0.015, 0.42, 0.14));
      }
      cornersOf(0, 0.8, 1.8, 0.38, 0.395);
      // Pulled back a little so the iron pulls stay inside the footprint.
      for (const o of parts) o.position.z -= 0.035;
      // Carry handles on the sides.
      for (const s of [-1, 1]) {
        parts.push(K.part(K.rbox(0.02, 0.08, 0.3, 0.01), iron, { p: [s * 0.9, 0.86, -0.03] }));
        parts.push(K.part(K.tube([[s * 0.905, 0.87, -0.12], [s * 0.94, 0.82, -0.08], [s * 0.945, 0.8, -0.03], [s * 0.94, 0.82, 0.02], [s * 0.905, 0.87, 0.06]], 0.013, 24, 8), iron));
      }
      return K.group(parts);
    },
  },
  {
    id: "byobu", name: "Folding Screen", series: "japanese", category: "decor", kind: "floor", size: [2, 0.5],
    variants: [
      { name: "Gold Leaf", swatch: "#e9c96c" },
      { name: "Sakura", swatch: "#f4b2c2" },
      { name: "Mount Fuji", swatch: "#5a76b3" },
    ],
    build(v) {
      const s = [
        { paint: goldScreen, frame: "#7e3a32", lacquer: true },
        { paint: sakuraScreen, frame: "#e6c595", lacquer: false },
        { paint: fujiScreen, frame: "#3f4f78", lacquer: true },
      ][v] ?? { paint: goldScreen, frame: "#7e3a32", lacquer: true };
      const frameM = s.lacquer ? M.gloss(s.frame, 0.3) : M.wood(s.frame);
      const backM = M.paint("#f2e7d0", 0.85);
      const hinge = M.metal(BRASS, 0.35);
      const n = 4, p = 0.49, H = 1.32, b = 0.045, t = 0.05, th = 0.32;
      const span = p * Math.cos(th), dz = p * Math.sin(th);
      const x0 = (-n * span) / 2;
      const parts: THREE.Object3D[] = [];
      for (let i = 0; i < n; i++) {
        const tex = drawn(`jp-byobu:${v}:${i}`, 150, 440, (g, w, h) => {
          g.save();
          g.translate(-i * w, 0);
          s.paint(g, w * n, h);
          g.restore();
        });
        const outer = K.roundedRectShape(p, H, 0.03);
        outer.holes.push(K.roundedRectShape(p - 2 * b, H - 2 * b, 0.012) as unknown as THREE.Path);
        const panel = K.group([
          K.part(K.extrude(outer, t, 0.012, 6), frameM, {}),
          sheet(p - 2 * b + 0.01, H - 2 * b + 0.01, M.printed(`jp-byobu:${v}:${i}`, tex, 0.7), { p: [0, 0, 0.004] }),
          sheet(p - 2 * b + 0.01, H - 2 * b + 0.01, backM, { p: [0, 0, -0.004], r: [0, Math.PI, 0] }),
          // Low feet on the bottom rail.
          K.part(K.rbox(0.1, 0.04, t + 0.01, 0.015), frameM, { p: [-p * 0.3, -H / 2 - 0.015, 0] }),
          K.part(K.rbox(0.1, 0.04, t + 0.01, 0.015), frameM, { p: [p * 0.3, -H / 2 - 0.015, 0] }),
        ]);
        const zStart = ((i % 2 === 0 ? -1 : 1) * dz) / 2;
        panel.position.set(x0 + span * (i + 0.5), H / 2 + 0.035, 0);
        panel.rotation.set(0, -Math.atan2(-2 * zStart, span), 0);
        parts.push(panel);
      }
      for (let i = 1; i < n; i++) {
        const x = x0 + span * i, z = ((i % 2 === 0 ? -1 : 1) * dz) / 2;
        for (const y of [0.32, H - 0.25]) parts.push(K.part(K.rbox(0.05, 0.1, 0.05, 0.02), hinge, { p: [x, y, z] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "bonsai", name: "Bonsai", series: "japanese", category: "plant", kind: "misc", size: [1, 1],
    variants: [
      { name: "Black Pine", swatch: "#4f8a52" },
      { name: "Red Maple", swatch: "#e0714f" },
      { name: "Sakura", swatch: "#f4b8c8" },
    ],
    build(v) {
      const b = [
        { leaf: ["#4a8550", "#5c9a5a", "#6cab63"], pot: INDIGO },
        { leaf: ["#d9634a", "#e8814f", "#f2a25e"], pot: "#efe5d0" },
        { leaf: ["#f0a9bf", "#f6c3d2", "#fbd9e3"], pot: "#9b6a4c" },
      ][v] ?? { leaf: ["#4a8550", "#5c9a5a", "#6cab63"], pot: INDIGO };
      const potM = M.ceramic(b.pot);
      const bark = M.wood("#7a5a42", "bold");
      const parts: THREE.Object3D[] = [
        ...K.corners(0.36, 0.2).map(([x, , z]) => K.part(K.rbox(0.07, 0.045, 0.05, 0.018), potM, { p: [x, 0.0225, z] })),
        K.part(K.rbox(0.46, 0.1, 0.3, 0.035), potM, { p: [0, 0.09, 0] }),
        K.part(K.rbox(0.5, 0.035, 0.34, 0.017), potM, { p: [0, 0.135, 0] }),
        K.part(K.soft(0.44, 0.06, 0.28, 0.35), M.plush("#86b35c"), { p: [0, 0.15, 0] }),
        K.part(K.soft(0.09, 0.07, 0.08, 0.55), M.paint("#a9a59c", 0.7), { p: [0.15, 0.18, 0.06], r: [0, 0.5, 0.2] }),
        // A gnarled trunk and two branches.
        K.part(K.tube([[0.06, 0.13, 0], [0.09, 0.22, 0.01], [0.0, 0.3, 0.02], [-0.07, 0.36, 0], [-0.03, 0.46, -0.01]], 0.034, 32, 10), bark),
        K.part(K.tube([[0.01, 0.3, 0.02], [0.1, 0.34, 0.03], [0.18, 0.34, 0.02]], 0.02, 16, 8), bark),
        K.part(K.tube([[-0.06, 0.37, 0], [-0.14, 0.41, 0.02], [-0.21, 0.43, 0.01]], 0.018, 16, 8), bark),
      ];
      // Cloud-pruned pads, each a few soft puffs.
      const leafM = b.leaf.map((c) => M.plush(c));
      const pad = (x: number, y: number, z: number, s: number) => {
        parts.push(K.part(K.soft(0.22 * s, 0.1 * s, 0.18 * s, 0.65, 0, 24), leafM[0]!, { p: [x, y, z] }));
        parts.push(K.part(K.soft(0.15 * s, 0.09 * s, 0.13 * s, 0.7, 0, 20), leafM[1]!, { p: [x - 0.07 * s, y + 0.03 * s, z + 0.03] }));
        parts.push(K.part(K.soft(0.14 * s, 0.08 * s, 0.12 * s, 0.7, 0, 20), leafM[2]!, { p: [x + 0.06 * s, y + 0.04 * s, z + 0.01] }));
      };
      pad(-0.03, 0.5, -0.01, 1.25);
      pad(0.19, 0.37, 0.03, 0.9);
      pad(-0.21, 0.44, 0.02, 0.85);
      return K.group(parts);
    },
  },
  {
    id: "tea-set", name: "Tea Set", series: "japanese", category: "decor", kind: "misc", size: [1, 1],
    variants: [
      { name: "Celadon", swatch: "#a9d0bf" },
      { name: "Blue & White", swatch: "#f4efe4" },
      { name: "Red Clay", swatch: "#b85a3e" },
    ],
    build(v) {
      const c = [
        { pot: "#a9d0bf", band: null, tray: "#e2c08e" },
        { pot: "#f6f1e6", band: INDIGO, tray: "#e2c08e" },
        { pot: "#b85a3e", band: null, tray: "#8c5c3d" },
      ][v] ?? { pot: "#a9d0bf", band: null, tray: "#e2c08e" };
      const glaze = M.ceramic(c.pot);
      const trayM = M.wood(c.tray);
      const bandM = c.band ? M.ceramic(c.band) : null;
      const rim = K.roundedRectShape(0.64, 0.44, 0.07);
      rim.holes.push(K.roundedRectShape(0.56, 0.36, 0.04) as unknown as THREE.Path);
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(0.62, 0.03, 0.42, 0.012), trayM, { p: [0, 0.015, 0] }),
        K.part(K.extrude(rim, 0.05, 0.012), trayM, { p: [0, 0.025, 0], r: [-Math.PI / 2, 0, 0] }),
      ];
      // A side-handled teapot.
      const pot: THREE.Object3D[] = [
        K.part(K.lathe([[0, 0], [0.06, 0], [0.076, 0.008], [0.1, 0.04], [0.108, 0.075], [0.1, 0.105], [0.08, 0.125], [0.06, 0.13], [0, 0.13]], 32), glaze),
        K.part(K.lathe([[0, 0.124], [0.066, 0.124], [0.068, 0.132], [0.05, 0.147], [0.02, 0.155], [0, 0.156]], 28), glaze),
        K.part(new THREE.SphereGeometry(0.02, 14, 10), glaze, { p: [0, 0.165, 0], s: [1, 0.8, 1] }),
        K.part(K.tube([[0.085, 0.045, 0], [0.13, 0.07, 0], [0.155, 0.11, 0], [0.165, 0.125, 0]], 0.019, 16, 10), glaze),
        K.part(K.rod([0, 0.075, 0.09], [0, 0.098, 0.19], 0.022, 12), glaze),
      ];
      if (bandM) pot.push(K.part(K.lathe([[0.106, 0.05], [0.112, 0.058], [0.112, 0.082], [0.107, 0.09]], 32), bandM));
      parts.push(K.group(pot, { p: [-0.13, 0.03, -0.03], r: [0, -0.5, 0] }));
      // Two cups with tea in them.
      for (const [x, z] of [[0.14, 0.05], [0.21, -0.1]] as const) {
        const cup: THREE.Object3D[] = [
          K.part(K.lathe([[0, 0], [0.036, 0], [0.042, 0.008], [0.048, 0.085], [0.045, 0.092], [0.04, 0.086], [0.035, 0.016], [0, 0.016]], 28), glaze),
          K.part(new THREE.CircleGeometry(0.038, 24), M.gloss("#a3c160", 0.2), { p: [0, 0.07, 0], r: [-Math.PI / 2, 0, 0] }),
        ];
        if (bandM) cup.push(K.part(K.lathe([[0.0475, 0.05], [0.05, 0.055], [0.05, 0.068], [0.048, 0.073]], 28), bandM));
        parts.push(K.group(cup, { p: [x, 0.03, z] }));
      }
      // A plate of dango.
      parts.push(K.part(K.puck(0.075, 0.014, 0.006, 28), M.ceramic("#fbf6ec"), { p: [0, 0.03, 0.1] }));
      parts.push(K.part(K.rod([-0.065, 0.07, 0.1], [0.07, 0.07, 0.1], 0.007, 8), M.wood("#d9b98a")));
      ["#f5b2c2", "#fbf6ee", "#a9cf8a"].forEach((col, i) => {
        parts.push(K.part(new THREE.SphereGeometry(0.025, 16, 12), M.plastic(col, 0.6), { p: [-0.035 + i * 0.045, 0.07, 0.1] }));
      });
      return K.group(parts);
    },
  },
  {
    id: "kakejiku", name: "Hanging Scroll", series: "japanese", category: "wall", kind: "wall", size: [1, 1.5], hang: 1.75,
    variants: [
      { name: "Landscape", swatch: "#8f8b84" },
      { name: "Moon Rabbit", swatch: "#f8dc86" },
      { name: "Calligraphy", swatch: "#3a332f" },
    ],
    build(v) {
      const k = [
        { draw: inkLandscape, mount: "#6f7f97", band: "#4f5f78", cap: "#3d3430" },
        { draw: moonRabbit, mount: "#b9a27a", band: "#8d7656", cap: "#f3ecdc" },
        { draw: calligraphy, mount: "#86a07a", band: "#5f7a58", cap: "#3d3430" },
      ][v] ?? { draw: inkLandscape, mount: "#6f7f97", band: "#4f5f78", cap: "#3d3430" };
      const tex = drawn(`jp-scroll:${v}`, 300, 430, k.draw);
      const mountM = M.fabric(k.mount, 0.5);
      const bandM = M.fabric(k.band, 0.5);
      const gold = M.fabric("#e2c171", 0.9);
      const rodM = M.wood("#6e4a36");
      const capM = M.gloss(k.cap, 0.3);
      const cap = (s: number) => K.part(K.lathe([[0, 0], [0.032, 0], [0.04, 0.014], [0.038, 0.04], [0.026, 0.052], [0, 0.053]], 20), capM, { p: [s * 0.3, -0.6, 0.042], r: [0, 0, -s * Math.PI / 2] });
      return K.group([
        // Cord and hook.
        K.part(K.tube([[-0.24, 0.585, 0.035], [0, 0.7, 0.012], [0.24, 0.585, 0.035]], 0.01, 24, 6, false), M.fabric("#c9a463", 0.6)),
        K.part(new THREE.SphereGeometry(0.022, 12, 8), M.metal(BRASS, 0.35), { p: [0, 0.7, 0.024] }),
        K.part(K.rbox(0.64, 0.04, 0.04, 0.018), rodM, { p: [0, 0.58, 0.032] }),
        // The mounting: cloth, a darker heaven and earth, gold strips.
        K.part(K.rbox(0.6, 1.17, 0.02, 0.008), mountM, { p: [0, -0.015, 0.02] }),
        K.part(K.rbox(0.6, 0.22, 0.024, 0.008), bandM, { p: [0, 0.455, 0.021] }),
        K.part(K.rbox(0.6, 0.14, 0.024, 0.008), bandM, { p: [0, -0.5, 0.021] }),
        K.part(K.rbox(0.045, 0.24, 0.028, 0.01), M.fabric("#efe4c8", 0.6), { p: [-0.1, 0.45, 0.024] }),
        K.part(K.rbox(0.045, 0.24, 0.028, 0.01), M.fabric("#efe4c8", 0.6), { p: [0.1, 0.45, 0.024] }),
        K.part(K.rbox(0.5, 0.035, 0.024, 0.008), gold, { p: [0, 0.32, 0.022] }),
        K.part(K.rbox(0.5, 0.035, 0.024, 0.008), gold, { p: [0, -0.395, 0.022] }),
        sheet(0.46, 0.66, M.printed(`jp-scroll:${v}`, tex, 0.75), { p: [0, -0.035, 0.0325] }),
        // The roller with its end knobs.
        K.part(K.rod([-0.3, -0.6, 0.042], [0.3, -0.6, 0.042], 0.028, 16), rodM),
        cap(-1),
        cap(1),
      ]);
    },
  },
  {
    id: "shoji-window", name: "Round Shoji Window", series: "japanese", category: "window", kind: "wall", size: [1.5, 1.5], hang: 1.75, variants: finishVariants,
    build(v) {
      const f = finish(v);
      const R = 0.69, r = 0.55, rc = 0.54;
      const bar = f.lacquer ? f.darkM : f.trimM;
      const parts: THREE.Object3D[] = [
        K.part(new THREE.CircleGeometry(r + 0.01, 64), M.skyPane(), { p: [0, 0, 0.02] }),
        K.part(K.extrude(ring(R, r), 0.12, 0.025, 72), f.woodM, { p: [0, 0, 0.06] }),
        K.part(K.extrude(ring(r + 0.05, r - 0.01), 0.04, 0.012, 72), bar, { p: [0, 0, 0.115] }),
      ];
      const vbar = (x: number, y0: number, y1: number) => parts.push(K.part(K.rbox(0.028, y1 - y0, 0.03, 0.014, 2), bar, { p: [x, (y0 + y1) / 2, 0.055] }));
      const hbar = (y: number, x0: number, x1: number) => parts.push(K.part(K.rbox(x1 - x0, 0.028, 0.03, 0.014, 2), bar, { p: [(x0 + x1) / 2, y, 0.058] }));
      const half = (c: number) => Math.sqrt(Math.max(0, rc * rc - c * c));
      if (v === 1) {
        // Yukimi: paper across the lower part, the moon-viewing glass above.
        const yTop = -0.12;
        const paper = new THREE.Shape();
        const a0 = Math.atan2(yTop, half(yTop));
        paper.absarc(0, 0, r + 0.005, a0, Math.PI - a0, true);
        paper.closePath();
        parts.push(K.part(new THREE.ShapeGeometry(paper, 48), M.paint(WASHI, 0.85), { p: [0, 0, 0.04] }));
        for (let x = -0.45; x <= 0.46; x += 0.15) vbar(x, -half(x), Math.min(yTop, half(x)));
        for (let y = yTop - 0.13; y > -rc; y -= 0.13) hbar(y, -half(y), half(y));
        hbar(yTop, -half(yTop), half(yTop));
        hbar(yTop + 0.02, -half(yTop + 0.02), half(yTop + 0.02));
      } else if (v === 2) {
        for (let x = -0.48; x <= 0.49; x += 0.12) vbar(x, -half(x), half(x));
        for (const y of [-0.28, 0.28]) hbar(y, -half(y), half(y));
      } else {
        for (let x = -0.48; x <= 0.49; x += 0.16) vbar(x, -half(x), half(x));
        for (let y = -0.48; y <= 0.49; y += 0.16) hbar(y, -half(y), half(y));
      }
      return K.group(parts);
    },
  },
  {
    id: "chochin", name: "Paper Lantern", series: "japanese", category: "ceiling", kind: "ceiling", size: [1, 1],
    variants: LANTERNS.map(({ name, swatch }) => ({ name, swatch })),
    light: { at: [0, -0.6, 0], color: "#ffe2a8", intensity: 5, distance: 5.5, halo: 1.3, startsOn: true },
    build(v) {
      const c = LANTERNS[v] ?? LANTERNS[0]!;
      const tex = drawn(`jp-chochin:${v}`, 512, 192, c.draw);
      const pts: THREE.Vector2[] = [];
      const y0 = -0.88, y1 = -0.34, N = 96;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const base = 0.115 + 0.15 * Math.pow(Math.sin(Math.PI * t), 0.7);
        // Bamboo hoops stand out a little; the paper sags between them.
        const rib = 0.985 + 0.022 * Math.pow(Math.abs(Math.cos(Math.PI * 12 * t)), 6);
        pts.push(new THREE.Vector2(base * rib, y0 + (y1 - y0) * t));
      }
      const geo = K.weld(new THREE.LatheGeometry(pts, 32, Math.PI));
      // Painted paper that lets the light through faintly, lit bright inside.
      const paper = M.glow(c.glow, "#ffffff", 0.4, 0.85);
      paper.map = tex;
      paper.emissiveMap = tex;
      const inside = M.glow(c.glow, "#fff6e0", 2.6, 0.9);
      inside.side = THREE.BackSide;
      const lit = K.part(geo, inside);
      lit.castShadow = false;
      const capM = M.gloss("#4a3833", 0.35);
      return K.group([
        K.part(K.puck(0.07, 0.03, 0.012, 24), capM, { p: [0, -0.03, 0] }),
        K.part(K.rod([0, -0.02, 0], [0, -0.3, 0], 0.012, 8), M.paint("#5a4038")),
        K.part(new THREE.TorusGeometry(0.035, 0.01, 8, 20), M.metal(BRASS, 0.35), { p: [0, -0.3, 0] }),
        K.part(K.lathe([[0, -0.36], [0.12, -0.36], [0.135, -0.345], [0.13, -0.32], [0.09, -0.31], [0, -0.31]], 32), capM),
        K.part(geo, paper),
        lit,
        K.part(K.lathe([[0, -0.905], [0.09, -0.905], [0.13, -0.895], [0.135, -0.875], [0.12, -0.86], [0, -0.86]], 32), capM),
        K.part(K.lathe([[0, -0.94], [0.02, -0.94], [0.03, -0.925], [0.02, -0.905], [0, -0.905]], 12), capM),
      ]);
    },
  },
  {
    id: "tatami-rug", name: "Tatami Mat", series: "japanese", category: "rug", kind: "rug", size: [2, 2],
    variants: [
      { name: "Fresh Tatami", swatch: "#b9c47e" },
      { name: "Ryukyu", swatch: "#c7cf8c" },
      { name: "Golden Brown", swatch: "#d9c482" },
    ],
    build(v) {
      return rug(`jp-tatami:${v}`, 1.94, 1.94, 0.05, (g, w, h) => {
        if (v === 1) {
          // Four borderless half mats, their grain crossing.
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
            const across = (i + j) % 2 === 0;
            tatamiMat(g, (i * w) / 2, (j * h) / 2, w / 2, h / 2, across ? "#c9d18f" : "#b9c47e", across ? "#a9b46c" : "#9fab62", across, null);
          }
        } else {
          const base = v === 2 ? "#dcc888" : "#b9c47e";
          const line = v === 2 ? "#c4ad6c" : "#a1ad66";
          const heri = v === 2 ? "#7a5a3e" : "#3c4f78";
          tatamiMat(g, 0, 0, w / 2, h, base, line, true, heri);
          tatamiMat(g, w / 2, 0, w / 2, h, base, line, true, heri);
        }
      }, 0.05);
    },
  },
];
