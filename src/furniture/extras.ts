// Odds and ends (more of them): televisions, music, little lights and odds and ends
// that sit happily in a room of any series.

import * as THREE from "three";
import { K, M, bulb, knob, rug } from "./common.ts";
import type { V3 } from "./common.ts";
import { ring, splayLegs, taper } from "./nordic.ts";
import { drawn, heart, roundRect, star } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

const CREAM = "#fbf6ec";
const INK = "#3d383c";

/** A flame: a teardrop that glows. */
function flame(p: V3, h: number, strength = 2.4): THREE.Mesh {
  const r = h * 0.32;
  const m = K.part(K.lathe([[0, 0], [r * 0.7, h * 0.08], [r, h * 0.3], [r * 0.75, h * 0.6], [r * 0.3, h * 0.88], [0, h]], 20), M.glow("#ffb24a", "#fff2c4", strength, 0.4), { p });
  m.castShadow = false;
  return m;
}

/** A flat picture facing +Z, for screens and labels. */
function plate(w: number, h: number, mat: THREE.Material, p: V3, r: V3 = [0, 0, 0]): THREE.Mesh {
  const m = K.part(new THREE.PlaneGeometry(w, h), mat, { p, r });
  m.castShadow = false;
  return m;
}

// ---------- Screens ----------

const islandScreen = () => drawn("extras:tv-island", 512, 288, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, "#7fcdf5");
  sky.addColorStop(1, "#d9f3ff");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff6c2";
  g.beginPath(); g.arc(w * 0.8, h * 0.22, h * 0.13, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#fffbe4";
  g.beginPath(); g.arc(w * 0.8, h * 0.22, h * 0.09, 0, Math.PI * 2); g.fill();
  const cloud = (x: number, y: number, s: number) => {
    g.fillStyle = "#ffffff";
    for (const [dx, dy, r] of [[0, 0, 1], [1.1, 0.15, 0.8], [-1, 0.2, 0.75], [0.4, -0.5, 0.7]] as const) {
      g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill();
    }
  };
  cloud(w * 0.2, h * 0.2, 16);
  cloud(w * 0.55, h * 0.12, 11);
  const sea = g.createLinearGradient(0, h * 0.6, 0, h);
  sea.addColorStop(0, "#56bfe0");
  sea.addColorStop(1, "#2f92c4");
  g.fillStyle = sea;
  g.fillRect(0, h * 0.6, w, h * 0.4);
  g.strokeStyle = "#ffffffaa";
  g.lineWidth = 3;
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const x = (i * 97) % w, y = h * (0.72 + ((i * 37) % 25) / 100);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 5, x + 16, y); g.stroke();
  }
  // The island: sand, grass, a palm, a little house.
  g.fillStyle = "#f6e3a8";
  g.beginPath(); g.ellipse(w * 0.4, h * 0.66, w * 0.26, h * 0.075, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#7cc66a";
  g.beginPath(); g.ellipse(w * 0.38, h * 0.63, w * 0.19, h * 0.09, 0, Math.PI, 0); g.fill();
  g.strokeStyle = "#a8774c";
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(w * 0.3, h * 0.62); g.quadraticCurveTo(w * 0.29, h * 0.45, w * 0.33, h * 0.33); g.stroke();
  g.fillStyle = "#4ea85a";
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI + (i / 4) * Math.PI;
    g.save(); g.translate(w * 0.33, h * 0.33); g.rotate(a);
    g.beginPath(); g.ellipse(26, 0, 28, 8, 0.2, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = "#fbf3e2";
  g.fillRect(w * 0.42, h * 0.5, w * 0.07, h * 0.1);
  g.fillStyle = "#e66a5c";
  g.beginPath(); g.moveTo(w * 0.41, h * 0.51); g.lineTo(w * 0.455, h * 0.42); g.lineTo(w * 0.5, h * 0.51); g.fill();
  g.fillStyle = "#8a5a3c";
  g.fillRect(w * 0.447, h * 0.55, w * 0.016, h * 0.05);
  // A sailboat and two gulls.
  g.fillStyle = "#ffffff";
  g.beginPath(); g.moveTo(w * 0.76, h * 0.7); g.lineTo(w * 0.76, h * 0.52); g.lineTo(w * 0.83, h * 0.7); g.fill();
  g.fillStyle = "#f2c14e";
  g.beginPath(); g.moveTo(w * 0.72, h * 0.71); g.lineTo(w * 0.86, h * 0.71); g.lineTo(w * 0.83, h * 0.76); g.lineTo(w * 0.745, h * 0.76); g.fill();
  g.strokeStyle = "#5a6b7a";
  g.lineWidth = 2.5;
  for (const [x, y] of [[0.62, 0.3], [0.67, 0.36]]) {
    g.beginPath(); g.moveTo(w * x! - 8, h * y!); g.quadraticCurveTo(w * x! - 4, h * y! - 6, w * x!, h * y!); g.quadraticCurveTo(w * x! + 4, h * y! - 6, w * x! + 8, h * y!); g.stroke();
  }
});

const pixelScreen = () => drawn("extras:tv-pixel", 256, 192, (g, w, h) => {
  g.fillStyle = "#9ad7f5";
  g.fillRect(0, 0, w, h);
  const px = 8;
  const block = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  // Clouds, hills, ground.
  for (const [cx, cy] of [[4, 3], [20, 5]]) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if (!(j === 0 && (i === 0 || i === 3))) block(cx! + i, cy! + j, "#ffffff");
  for (let i = 0; i < 9; i++) for (let j = 0; j <= Math.min(i, 8 - i); j++) block(10 + i, 17 - j, "#86cf73");
  for (let x = 0; x < w / px; x++) {
    block(x, 18, "#6cc24a");
    for (let y = 19; y < h / px; y++) block(x, y, (x + y) % 3 ? "#c98a52" : "#b87a46");
  }
  // A pipe and floating blocks with coins.
  for (let y = 14; y < 18; y++) { block(26, y, "#4fb34f"); block(27, y, "#6fd16a"); }
  block(25, 13, "#4fb34f"); block(26, 13, "#6fd16a"); block(27, 13, "#6fd16a"); block(28, 13, "#4fb34f");
  for (let i = 0; i < 3; i++) block(14 + i, 10, i === 1 ? "#f6c443" : "#d98a4a");
  g.fillStyle = "#ffd84a";
  for (const x of [6, 9, 12]) { g.beginPath(); g.ellipse(x * px + 4, 12 * px + 4, 3, 4, 0, 0, Math.PI * 2); g.fill(); }
  // The hero.
  block(7, 15, "#e5534b"); block(8, 15, "#e5534b"); block(9, 15, "#e5534b");
  block(7, 16, "#f6d2a8"); block(8, 16, "#f6d2a8"); block(9, 16, "#3d383c");
  block(7, 17, "#4c7fd1"); block(8, 17, "#4c7fd1"); block(9, 17, "#4c7fd1");
  g.fillStyle = "#ffffff";
  g.font = "bold 12px monospace";
  g.fillText("SCORE 0420", 8, 14);
  g.fillText("x3", w - 30, 14);
  // Scanlines and a soft vignette.
  g.fillStyle = "rgba(20,30,40,0.12)";
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(20,30,50,0.45)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
});

const desktopScreen = () => drawn("extras:laptop-desktop", 512, 320, (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#ffd9e6");
  bg.addColorStop(1, "#c6e6ff");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ffffffaa";
  g.beginPath(); g.arc(w * 0.8, h * 0.25, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8fd18a";
  g.beginPath(); g.ellipse(w * 0.8, h * 0.25, 18, 30, 0.5, 0, Math.PI * 2); g.fill();
  // A notes window.
  g.fillStyle = "#3d383c33";
  roundRect(g, w * 0.1 + 4, h * 0.14 + 6, w * 0.5, h * 0.56, 12); g.fill();
  g.fillStyle = "#fffdf8";
  roundRect(g, w * 0.1, h * 0.14, w * 0.5, h * 0.56, 12); g.fill();
  g.fillStyle = "#f6cf5a";
  roundRect(g, w * 0.1, h * 0.14, w * 0.5, 26, 12); g.fill();
  g.fillRect(w * 0.1, h * 0.14 + 14, w * 0.5, 12);
  for (const [i, c] of ["#e8705f", "#f2b33d", "#6cc070"].entries()) { g.fillStyle = c; g.beginPath(); g.arc(w * 0.1 + 16 + i * 16, h * 0.14 + 13, 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#c9c2b8";
  for (let i = 0; i < 6; i++) { roundRect(g, w * 0.14, h * 0.28 + i * 22, w * (0.42 - (i % 3) * 0.08), 8, 4); g.fill(); }
  g.fillStyle = "#f29fb3";
  heart(g, w * 0.53, h * 0.62, 16); g.fill();
  // The dock.
  g.fillStyle = "#ffffff99";
  roundRect(g, w * 0.25, h * 0.82, w * 0.5, 44, 14); g.fill();
  ["#7fb6e8", "#f2b33d", "#8fd18a", "#e8705f", "#c49be0"].forEach((c, i) => {
    g.fillStyle = c;
    roundRect(g, w * 0.27 + i * w * 0.095, h * 0.82 + 7, 30, 30, 9); g.fill();
  });
});

const handheldScreen = () => drawn("extras:console-game", 320, 180, (g, w, h) => {
  g.fillStyle = "#8fd17a";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#7cc46a";
  for (let i = 0; i < 40; i++) { g.fillRect((i * 53) % w, (i * 31) % h, 6, 3); }
  // A pond, two round trees and a path.
  g.fillStyle = "#e9d49a";
  g.beginPath(); g.moveTo(0, h * 0.75); g.quadraticCurveTo(w * 0.4, h * 0.55, w, h * 0.7); g.lineTo(w, h * 0.82); g.quadraticCurveTo(w * 0.4, h * 0.68, 0, h * 0.88); g.fill();
  g.fillStyle = "#5fb8e6";
  g.beginPath(); g.ellipse(w * 0.75, h * 0.32, 46, 24, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#a6dcf5";
  g.beginPath(); g.ellipse(w * 0.73, h * 0.29, 22, 8, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y] of [[0.15, 0.3], [0.32, 0.22]]) {
    g.fillStyle = "#8a5a3c"; g.fillRect(w * x! - 4, h * y!, 8, 20);
    g.fillStyle = "#3f9a52"; g.beginPath(); g.arc(w * x!, h * y! - 4, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e8564f"; g.beginPath(); g.arc(w * x! + 8, h * y! - 8, 4, 0, Math.PI * 2); g.fill();
  }
  // The villager.
  const cx = w * 0.5, cy = h * 0.58;
  g.fillStyle = "#5a9fe0"; roundRect(g, cx - 10, cy + 6, 20, 18, 6); g.fill();
  g.fillStyle = "#f6d7b0"; g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#7a4a2e"; g.beginPath(); g.arc(cx, cy - 4, 14, Math.PI, 0); g.fill();
  g.fillStyle = "#3d383c"; g.fillRect(cx - 6, cy, 3, 4); g.fillRect(cx + 3, cy, 3, 4);
  g.fillStyle = "#f29fb3"; g.beginPath(); g.arc(cx - 8, cy + 6, 2.5, 0, Math.PI * 2); g.arc(cx + 8, cy + 6, 2.5, 0, Math.PI * 2); g.fill();
  // HUD.
  g.fillStyle = "#ffffffcc"; roundRect(g, 8, 8, 86, 24, 10); g.fill();
  g.fillStyle = "#e8564f";
  for (let i = 0; i < 3; i++) { heart(g, 24 + i * 24, 22, 9); g.fill(); }
  g.fillStyle = "#ffd84a"; star(g, w - 22, 20, 10); g.fill();
});

// ---------- Palettes ----------

const STAND = [
  { name: "Pine", swatch: "#d9a86c", wood: "#d9a46a", trim: "#b98552", knob: "#8a5a36" },
  { name: "White", swatch: "#f1ebe0", wood: "#f2ebdf", trim: "#ddd0bc", knob: "#b48a5c" },
  { name: "Walnut", swatch: "#8a5a3c", wood: "#94603f", trim: "#75482c", knob: "#e2b77a" },
  { name: "Peppermint", swatch: "#a9d6c2", wood: "#a9d5c1", trim: "#86bba3", knob: "#f5efe2" },
];
const POP = [
  { name: "Mint", swatch: "#9fd4c0", c: "#9fd4c0" },
  { name: "Cream", swatch: "#f3e4c4", c: "#f3e4c4" },
  { name: "Cherry Red", swatch: "#e2706a", c: "#e2706a" },
  { name: "Sky Blue", swatch: "#8fb8e2", c: "#8fb8e2" },
];
const popVariants = POP.map(({ name, swatch }) => ({ name, swatch }));
const pop = (v: number) => (POP[v] ?? POP[0]!).c;

export const EXTRAS: FurnitureDef[] = [
  {
    id: "tv-stand", name: "TV Stand", series: "basic", category: "storage", kind: "floor", size: [2, 1],
    variants: STAND.map(({ name, swatch }) => ({ name, swatch })),
    surface: { rect: [-1, -0.5, 1, 0.5], y: 0.5 },
    build(v) {
      const c = STAND[v] ?? STAND[0]!;
      const wood = M.wood(c.wood);
      const trim = M.wood(c.trim);
      const k = M.wood(c.knob);
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.94, 0.05, 0.86, 0.025), wood, { p: [0, 0.475, -0.01] }),
        ...splayLegs(1.66, 0.6, 0.13, trim, 0.034, 0.05, -0.02),
        // Two closed cabinets with a nook between them.
        K.part(K.rbox(0.66, 0.33, 0.78, 0.04), wood, { p: [-0.6, 0.29, -0.03] }),
        K.part(K.rbox(0.66, 0.33, 0.78, 0.04), wood, { p: [0.6, 0.29, -0.03] }),
        K.part(K.rbox(0.56, 0.05, 0.76, 0.02), trim, { p: [0, 0.15, -0.03] }),
        K.part(K.rbox(0.56, 0.3, 0.03, 0.012), trim, { p: [0, 0.3, -0.4] }),
      ];
      // Fluted doors.
      for (const s of [-1, 1]) {
        parts.push(K.part(K.rbox(0.6, 0.28, 0.03, 0.012), trim, { p: [s * 0.6, 0.29, 0.365] }));
        for (let i = 0; i < 8; i++) parts.push(K.part(K.rbox(0.068, 0.26, 0.035, 0.017, 2, "y"), wood, { p: [s * 0.6 - 0.245 + i * 0.07, 0.29, 0.385] }));
        parts.push(knob([s * 0.33, 0.29, 0.4], k, 0.03));
      }
      // In the nook: a little console and two records.
      parts.push(
        K.part(K.rbox(0.3, 0.07, 0.24, 0.025), M.plastic("#f4f1ea", 0.4), { p: [-0.06, 0.21, 0.02] }),
        K.part(new THREE.SphereGeometry(0.012, 10, 8), M.paint("#7cd88f", 0.3), { p: [0.06, 0.21, 0.142] }),
        K.part(K.rbox(0.18, 0.04, 0.02, 0.01), M.plastic("#d9d4cb", 0.4), { p: [-0.1, 0.21, 0.142] }),
        K.group([K.part(K.rbox(0.03, 0.26, 0.26, 0.012), M.paint("#e8705f", 0.6)), K.part(K.rbox(0.032, 0.1, 0.1, 0.01), M.paint("#fbf3df"))], { p: [0.2, 0.31, -0.08], r: [0, 0, -0.08] }),
        K.group([K.part(K.rbox(0.03, 0.26, 0.26, 0.012), M.paint("#7fb6e8", 0.6))], { p: [0.24, 0.31, -0.08], r: [0, 0, -0.12] }),
      );
      return K.group(parts);
    },
  },
  {
    id: "flat-tv", name: "Flat-Screen TV", series: "basic", category: "appliance", kind: "misc", size: [2, 0.5], switchable: true,
    variants: [{ name: "Charcoal", swatch: "#4a464c" }, { name: "Milk White", swatch: "#f2efe8" }, { name: "Mint", swatch: "#a9d6c2" }],
    build(v) {
      const shell = [M.plastic("#4a464c", 0.4), M.plastic("#f2efe8", 0.4), M.plastic("#a9d6c2", 0.4)][v] ?? M.plastic("#4a464c", 0.4);
      const bezel = M.plastic(v === 0 ? "#3a363b" : "#4a464c", 0.35);
      return K.group([
        // A rounded foot and neck.
        K.part(K.rbox(0.62, 0.035, 0.3, 0.017), shell, { p: [0, 0.018, 0] }),
        K.part(K.rbox(0.14, 0.2, 0.06, 0.025), shell, { p: [0, 0.13, -0.03] }),
        K.part(K.rbox(0.9, 0.56, 0.08, 0.04), shell, { p: [0, 0.66, -0.07] }),
        // The panel: a soft shell with a dark bezel and the picture.
        K.part(K.rbox(1.86, 1.08, 0.07, 0.045), shell, { p: [0, 0.75, 0] }),
        K.part(K.rbox(1.78, 1.0, 0.03, 0.03), bezel, { p: [0, 0.76, 0.024] }),
        plate(1.7, 0.94, M.screen(islandScreen(), 1.1), [0, 0.765, 0.041]),
        K.part(K.rbox(0.16, 0.03, 0.02, 0.01), M.paint("#d9d4cb", 0.5), { p: [0, 0.235, 0.034] }),
        K.part(new THREE.SphereGeometry(0.014, 10, 8), M.glow("#8ff0a8", "#6b9c7a", 2), { p: [0.8, 0.235, 0.035] }),
      ]);
    },
  },
  {
    id: "retro-tv", name: "Retro TV", series: "basic", category: "appliance", kind: "misc", size: [1, 1], switchable: true,
    variants: [{ name: "Cream", swatch: "#f3e4c4" }, { name: "Mint", swatch: "#9fd4c0" }, { name: "Cherry Red", swatch: "#e2706a" }, { name: "Sky Blue", swatch: "#8fb8e2" }],
    build(v) {
      const c = ["#f3e4c4", "#9fd4c0", "#e2706a", "#8fb8e2"][v] ?? "#f3e4c4";
      const body = M.gloss(c, 0.35);
      const dark = M.plastic("#5a5052", 0.5);
      const cream = M.plastic(CREAM, 0.4);
      const wood = M.wood("#c9935d");
      const scr = K.planarUV(K.soft(0.42, 0.33, 0.05, 0.22), 0.42, 0.33);
      const bez = K.roundedRectShape(0.5, 0.41, 0.09);
      bez.holes.push(K.roundedRectShape(0.42, 0.33, 0.07) as unknown as THREE.Path);
      const parts: THREE.Object3D[] = [
        ...splayLegs(0.5, 0.3, 0.1, wood, 0.022, 0.03),
        K.part(K.rbox(0.74, 0.52, 0.48, 0.12), body, { p: [0, 0.36, 0] }),
        K.part(K.rbox(0.7, 0.44, 0.06, 0.08), cream, { p: [0, 0.36, 0.22] }),
        K.part(K.extrude(bez, 0.04, 0.012), dark, { p: [-0.09, 0.36, 0.255] }),
        K.part(scr, M.screen(pixelScreen(), 1.15), { p: [-0.09, 0.36, 0.25] }),
        // Two big dials and a speaker grille.
        ...[0.47, 0.35].flatMap((y) => [
          K.part(K.puck(0.045, 0.03, 0.012, 24), dark, { p: [0.24, y, 0.25], r: [Math.PI / 2, 0, 0] }),
          K.part(K.rbox(0.012, 0.06, 0.02, 0.005), cream, { p: [0.24, y, 0.285], r: [0, 0, y > 0.4 ? 0.6 : -0.4] }),
        ]),
        ...[0, 1, 2, 3].map((i) => K.part(K.rbox(0.09, 0.016, 0.02, 0.008), dark, { p: [0.24, 0.27 - i * 0.03, 0.252] })),
        // Rabbit ears.
        K.part(K.puck(0.06, 0.04, 0.015, 24), dark, { p: [0.04, 0.615, -0.06] }),
        K.part(K.rod([0.02, 0.64, -0.06], [-0.2, 0.96, -0.12], 0.01), M.metal("#d8d8d8", 0.3)),
        K.part(K.rod([0.06, 0.64, -0.06], [0.3, 0.92, -0.1], 0.01), M.metal("#d8d8d8", 0.3)),
        K.part(new THREE.SphereGeometry(0.022, 14, 10), dark, { p: [-0.2, 0.96, -0.12] }),
        K.part(new THREE.SphereGeometry(0.022, 14, 10), dark, { p: [0.3, 0.92, -0.1] }),
      ];
      return K.group(parts);
    },
  },
  {
    id: "record-player", name: "Record Player", series: "basic", category: "appliance", kind: "misc", size: [1, 1], switchable: true,
    variants: popVariants,
    build(v) {
      const c = pop(v);
      const shell = M.paint(c, 0.5);
      const lining = M.fabric(v === 1 ? "#e2706a" : CREAM, 0.6);
      const plateMat = M.plastic("#f6efe0", 0.45);
      const chrome = M.metal("#dcdcdc", 0.25);
      const rec = drawn("extras:record", 256, 256, (g, w) => {
        g.fillStyle = "#3a3438";
        g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#4a444a";
        g.lineWidth = 1.5;
        for (let r = w * 0.2; r < w * 0.49; r += 5) { g.beginPath(); g.arc(w / 2, w / 2, r, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = "#f2b33d";
        g.beginPath(); g.arc(w / 2, w / 2, w * 0.17, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#e8705f";
        g.beginPath(); g.arc(w / 2, w / 2, w * 0.17, Math.PI, Math.PI * 2); g.fill();
        g.fillStyle = "#fbf3df";
        g.beginPath(); g.arc(w / 2, w / 2, w * 0.03, 0, Math.PI * 2); g.fill();
      });
      const recTop = K.planarUV(new THREE.CircleGeometry(0.155, 48), 0.31, 0.31);
      const lid = K.group([
        K.part(K.rbox(0.64, 0.44, 0.07, 0.04), shell, { p: [0, 0.22, -0.035] }),
        K.part(K.rbox(0.56, 0.36, 0.02, 0.01), lining, { p: [0, 0.22, 0.005] }),
        K.part(K.puck(0.075, 0.02, 0.008, 32), M.fabric("#5a5052", 0.4), { p: [-0.14, 0.22, 0.01], r: [Math.PI / 2, 0, 0] }),
        K.part(K.puck(0.075, 0.02, 0.008, 32), M.fabric("#5a5052", 0.4), { p: [0.14, 0.22, 0.01], r: [Math.PI / 2, 0, 0] }),
      ], { p: [0, 0.14, -0.2], r: [-0.2, 0, 0] });
      return K.group([
        K.part(K.rbox(0.64, 0.15, 0.46, 0.05), shell, { p: [0, 0.075, 0.02] }),
        K.part(K.rbox(0.58, 0.025, 0.4, 0.012), plateMat, { p: [0, 0.152, 0.02] }),
        // Platter, record and spindle.
        K.part(K.puck(0.17, 0.022, 0.008, 48), chrome, { p: [-0.06, 0.16, 0.02] }),
        K.part(K.puck(0.158, 0.012, 0.004, 48), M.gloss("#3a3438", 0.3), { p: [-0.06, 0.18, 0.02] }),
        plate(0.31, 0.31, M.printed("extras:record", rec, 0.35), [-0.06, 0.1925, 0.02], [-Math.PI / 2, 0, 0]),
        K.part(K.rod([-0.06, 0.18, 0.02], [-0.06, 0.215, 0.02], 0.01, 10), chrome),
        // Tonearm with its counterweight and headshell.
        K.part(K.puck(0.035, 0.03, 0.01, 24), chrome, { p: [0.2, 0.16, -0.1] }),
        K.part(K.tube([[0.2, 0.21, -0.1], [0.2, 0.215, -0.02], [0.15, 0.215, 0.07], [0.08, 0.21, 0.11]], 0.01, 24, 8), chrome),
        K.part(K.puck(0.025, 0.04, 0.01, 16), M.plastic("#5a5052"), { p: [0.2, 0.21, -0.17], r: [Math.PI / 2, 0, 0] }),
        K.part(K.rbox(0.04, 0.02, 0.06, 0.008), M.plastic("#5a5052"), { p: [0.07, 0.205, 0.12], r: [0, 0.6, 0] }),
        // Knobs and the power light.
        K.part(K.puck(0.025, 0.03, 0.01, 20), M.plastic("#5a5052"), { p: [0.21, 0.16, 0.12] }),
        K.part(new THREE.SphereGeometry(0.012, 10, 8), M.glow("#ff8a6a", "#c86a5a", 2.5), { p: [0.21, 0.168, 0.2] }),
        // The case: handle and latches on the front.
        K.part(K.tube([[-0.1, 0.07, 0.25], [-0.09, 0.07, 0.29], [0.09, 0.07, 0.29], [0.1, 0.07, 0.25]], 0.016, 24, 8), M.plastic("#8a5a3c", 0.5)),
        K.part(K.rbox(0.05, 0.045, 0.02, 0.01), chrome, { p: [-0.22, 0.12, 0.255] }),
        K.part(K.rbox(0.05, 0.045, 0.02, 0.01), chrome, { p: [0.22, 0.12, 0.255] }),
        lid,
      ]);
    },
  },
  {
    id: "laptop", name: "Laptop", series: "basic", category: "appliance", kind: "misc", size: [1, 1], switchable: true,
    variants: [{ name: "Silver White", swatch: "#e3e5e8" }, { name: "Sakura Pink", swatch: "#f3c1cc" }, { name: "Mint", swatch: "#acdcc9" }, { name: "Charcoal", swatch: "#74767d" }],
    build(v) {
      const c = ["#e3e5e8", "#f3c1cc", "#acdcc9", "#74767d"][v] ?? "#e3e5e8";
      const shell = M.plastic(c, 0.35);
      const keyCap = v === 3 ? "#5a5c62" : "#fbfaf7";
      const deck = drawn(`extras:laptop-deck:${v}`, 280, 190, (g, w, h) => {
        g.fillStyle = c;
        g.fillRect(0, 0, w, h);
        g.fillStyle = new THREE.Color(c).multiplyScalar(0.85).getStyle();
        roundRect(g, w * 0.06, h * 0.06, w * 0.88, h * 0.5, 6); g.fill();
        g.fillStyle = keyCap;
        const kw = (w * 0.86) / 12;
        for (let r = 0; r < 4; r++) {
          for (let i = 0; i < 12; i++) {
            if (r === 3 && i > 2 && i < 9) continue;
            roundRect(g, w * 0.07 + i * kw + 1.5, h * 0.075 + r * h * 0.118, kw - 3, h * 0.1, 3); g.fill();
          }
        }
        roundRect(g, w * 0.07 + 3 * kw + 1.5, h * 0.075 + 3 * h * 0.118, kw * 6 - 3, h * 0.1, 3); g.fill();
        g.fillStyle = new THREE.Color(c).multiplyScalar(0.93).getStyle();
        roundRect(g, w * 0.34, h * 0.63, w * 0.32, h * 0.3, 8); g.fill();
      });
      const lid = K.group([
        K.part(K.rbox(0.6, 0.4, 0.024, 0.012), shell, { p: [0, 0.2, -0.012] }),
        K.part(K.rbox(0.58, 0.38, 0.02, 0.01), M.plastic("#3f3c42", 0.4), { p: [0, 0.2, 0.002] }),
        plate(0.54, 0.335, M.screen(desktopScreen(), 1.1), [0, 0.205, 0.0125]),
        K.part(K.puck(0.045, 0.02, 0.008, 24), M.plastic(v === 1 ? "#ffffff" : "#f29fb3", 0.4), { p: [0, 0.2, -0.024], r: [-Math.PI / 2, 0, 0] }),
      ], { p: [0, 0.03, -0.16], r: [-0.3, 0, 0] });
      return K.group([
        K.part(K.rbox(0.6, 0.032, 0.42, 0.014), shell, { p: [0, 0.016, 0.05] }),
        plate(0.56, 0.38, M.printed(`extras:laptop-deck:${v}`, deck, 0.5), [0, 0.0325, 0.05], [-Math.PI / 2, 0, 0]),
        lid,
        // A little round mouse.
        K.part(K.soft(0.08, 0.045, 0.12, 0.6), shell, { p: [0.4, 0.022, 0.12] }),
      ]);
    },
  },
  {
    id: "desk-fan", name: "Desk Fan", series: "basic", category: "appliance", kind: "misc", size: [1, 1],
    variants: popVariants,
    build(v) {
      const c = pop(v);
      const body = M.gloss(c, 0.35);
      const blade = M.plastic(new THREE.Color(c).lerp(new THREE.Color("#ffffff"), 0.35).getStyle(), 0.35);
      const wire = M.metal("#e4e4e2", 0.3);
      const head: THREE.Object3D[] = [
        // Motor housing behind the cage.
        K.part(K.lathe([[0, -0.2], [0.05, -0.2], [0.075, -0.17], [0.085, -0.11], [0.07, -0.06], [0, -0.05]], 28), body, { r: [Math.PI / 2, 0, 0] }),
        ring(0.21, 0.012, wire, [0, 0, 0]),
        ring(0.15, 0.01, wire, [0, 0, 0.05]),
        ring(0.08, 0.01, wire, [0, 0, 0.075]),
        ring(0.15, 0.01, wire, [0, 0, -0.04]),
        K.part(K.puck(0.045, 0.02, 0.008, 24), body, { p: [0, 0, 0.07], r: [Math.PI / 2, 0, 0] }),
        K.part(K.puck(0.04, 0.05, 0.015, 20), body, { p: [0, 0, -0.03], r: [Math.PI / 2, 0, 0] }),
      ];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        head.push(K.part(K.tube([[cs * 0.21, sn * 0.21, 0], [cs * 0.15, sn * 0.15, 0.05], [cs * 0.08, sn * 0.08, 0.075], [cs * 0.04, sn * 0.04, 0.08]], 0.008, 12, 5), wire));
        head.push(K.part(K.tube([[cs * 0.21, sn * 0.21, 0], [cs * 0.15, sn * 0.15, -0.04], [cs * 0.07, sn * 0.07, -0.05]], 0.008, 10, 5), wire));
      }
      for (let i = 0; i < 4; i++) {
        const b = K.part(K.soft(0.12, 0.15, 0.022, 0.5), blade, { p: [0, 0.1, 0], r: [0, 0.5, 0] });
        head.push(K.group([b], { p: [0, 0, 0.015], r: [0, 0, (i / 4) * Math.PI * 2 + 0.3] }));
      }
      return K.group([
        K.part(K.puck(0.16, 0.06, 0.03, 40), body),
        K.part(K.puck(0.13, 0.012, 0.005, 32), M.plastic(CREAM), { p: [0, 0.058, 0] }),
        ...[-0.05, 0, 0.05].map((x) => K.part(K.puck(0.018, 0.025, 0.008, 14), M.plastic(CREAM), { p: [x, 0.04, 0.11], r: [Math.PI / 2 - 0.4, 0, 0] })),
        K.part(K.rod([0, 0.06, -0.02], [0, 0.3, -0.04], 0.022), wire),
        K.part(new THREE.SphereGeometry(0.035, 16, 12), body, { p: [0, 0.32, -0.05] }),
        K.group(head, { p: [0, 0.42, 0.04], r: [-0.12, 0, 0] }),
      ]);
    },
  },
  {
    id: "game-console", name: "Handheld Console", series: "basic", category: "toy", kind: "misc", size: [1, 0.5], switchable: true,
    variants: [{ name: "Red & Blue", swatch: "#6fb3ea" }, { name: "Pink & Green", swatch: "#f4a7bc" }, { name: "All White", swatch: "#f4f2ec" }, { name: "Lavender", swatch: "#c3b0e6" }],
    build(v) {
      const pairs = [["#6fb3ea", "#ee6f63"], ["#f4a7bc", "#9fdcc0"], ["#f4f2ec", "#f4f2ec"], ["#c3b0e6", "#c3b0e6"]];
      const [l, r] = pairs[v] ?? pairs[0]!;
      const mid = M.plastic(v === 2 ? "#e6e3dc" : "#4a464c", 0.4);
      const pad = (x: number, c: string) => M.plastic(c, 0.35);
      const btn = M.plastic(v === 2 ? "#8b8790" : "#3f3c42", 0.3);
      const top = 0.06;
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(0.42, 0.05, 0.25, 0.025), mid, { p: [0, 0.035, 0] }),
        K.part(K.rbox(0.15, 0.06, 0.25, 0.06), pad(-1, l!), { p: [-0.27, 0.035, 0] }),
        K.part(K.rbox(0.15, 0.06, 0.25, 0.06), pad(1, r!), { p: [0.27, 0.035, 0] }),
        K.part(K.rbox(0.38, 0.012, 0.215, 0.006), M.plastic("#3a363b", 0.3), { p: [0, top, 0] }),
        plate(0.35, 0.197, M.screen(handheldScreen(), 1.1), [0, top + 0.0065, 0], [-Math.PI / 2, 0, 0]),
        // Sticks and buttons.
        K.part(K.puck(0.03, 0.025, 0.01, 20), btn, { p: [-0.27, top, -0.05] }),
        K.part(new THREE.SphereGeometry(0.026, 16, 10), btn, { p: [-0.27, top + 0.025, -0.05], s: [1, 0.45, 1] }),
        K.part(K.puck(0.03, 0.025, 0.01, 20), btn, { p: [0.27, top, 0.06] }),
        K.part(new THREE.SphereGeometry(0.026, 16, 10), btn, { p: [0.27, top + 0.025, 0.06], s: [1, 0.45, 1] }),
      ];
      for (const [dx, dz] of [[0, -0.03], [0, 0.03], [-0.03, 0], [0.03, 0]] as const) {
        parts.push(K.part(K.puck(0.013, 0.02, 0.006, 14), btn, { p: [0.27 + dx, top - 0.005, -0.04 + dz] }));
        parts.push(K.part(K.puck(0.013, 0.02, 0.006, 14), btn, { p: [-0.27 + dx, top - 0.005, 0.06 + dz] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "aquarium", name: "Aquarium", series: "basic", category: "decor", kind: "misc", size: [1, 1],
    variants: [{ name: "White", swatch: "#f6f2ea" }, { name: "Natural Wood", swatch: "#d9a86c" }, { name: "Mint", swatch: "#9fd4c0" }, { name: "Pink", swatch: "#f4b6c4" }],
    light: { at: [0, 0.3, 0], color: "#9cd8ff", intensity: 1.6, distance: 2.6, halo: 0.8, startsOn: true },
    build(v) {
      const trimMat = [M.plastic("#f6f2ea", 0.4), M.wood("#d9a46a"), M.plastic("#9fd4c0", 0.4), M.plastic("#f4b6c4", 0.4)][v] ?? M.plastic("#f6f2ea");
      const water = M.glow("#5cc0ff", "#86cdf2", 0.35, 0.1);
      water.transparent = true;
      water.opacity = 0.55;
      water.depthWrite = false;
      const lamp = M.glow("#d8f2ff", "#eef8ff", 1.6, 0.4);
      const rim = K.roundedRectShape(0.66, 0.42, 0.06);
      rim.holes.push(K.roundedRectShape(0.56, 0.32, 0.03) as unknown as THREE.Path);
      const rimGeo = K.extrude(rim, 0.035, 0.012);
      rimGeo.rotateX(-Math.PI / 2);
      const fish = (p: V3, c: string, dir: number, s = 1) => {
        const m = M.plastic(c, 0.35);
        return K.group([
          K.part(K.soft(0.075, 0.05, 0.03, 0.75), m),
          K.part(K.soft(0.035, 0.045, 0.012, 0.6), m, { p: [-0.045, 0, 0], r: [0, 0, 0] }),
          K.part(K.soft(0.03, 0.022, 0.01, 0.6), m, { p: [0.0, 0.028, 0], r: [0, 0, -0.3] }),
          K.part(new THREE.SphereGeometry(0.01, 10, 8), M.gloss("#2e2a2c", 0.2), { p: [0.022, 0.006, 0.013] }),
          K.part(new THREE.SphereGeometry(0.01, 10, 8), M.gloss("#2e2a2c", 0.2), { p: [0.022, 0.006, -0.013] }),
        ], { p, r: [0, dir > 0 ? 0 : Math.PI, 0], s });
      };
      const weeds: THREE.Object3D[] = [];
      for (let i = 0; i < 7; i++) {
        const x = -0.22 + (i % 4) * 0.035 + (i > 3 ? 0.36 : 0);
        const l = K.part(K.leafGeometry(0.16 + (i % 3) * 0.06, 0.05, 0.25, 0.08, "long"), M.leaf(i % 2 ? "#5fae5f" : "#7fc46e"), {});
        l.rotation.order = "YXZ";
        l.rotation.set(-1.35 + (i % 3) * 0.1, i * 1.7, 0);
        l.position.set(x, 0.11, -0.08 + (i % 3) * 0.04);
        weeds.push(l);
      }
      const glassMesh = K.part(K.rbox(0.62, 0.42, 0.38, 0.05), M.glass("#d6efff", 0.28), { p: [0, 0.27, 0] });
      glassMesh.castShadow = false;
      const waterMesh = K.part(K.rbox(0.58, 0.33, 0.34, 0.04), water, { p: [0, 0.235, 0] });
      waterMesh.castShadow = false;
      return K.group([
        K.part(K.rbox(0.68, 0.07, 0.44, 0.03), trimMat, { p: [0, 0.035, 0] }),
        glassMesh,
        waterMesh,
        K.part(K.soft(0.56, 0.06, 0.32, 0.35), M.paint("#ecd9a8", 0.9), { p: [0, 0.095, 0] }),
        ...[[-0.15, 0.08, "#f29fb3"], [0.05, 0.1, "#ffffff"], [0.18, -0.06, "#a8c8e8"], [-0.02, -0.1, "#f6d27a"]].map(([x, z, col]) =>
          K.part(new THREE.SphereGeometry(0.022, 12, 8), M.paint(col as string, 0.6), { p: [x as number, 0.122, z as number], s: [1, 0.6, 1] })),
        K.part(K.soft(0.12, 0.09, 0.08, 0.55), M.paint("#a9a6a0", 0.8), { p: [0.14, 0.14, -0.04] }),
        K.part(K.lathe([[0, 0], [0.035, 0], [0.04, 0.02], [0.02, 0.06], [0, 0.07]], 18), M.paint("#f6c0a8", 0.5), { p: [0.04, 0.11, -0.1] }),
        ...weeds,
        fish([-0.05, 0.28, 0.05], "#ff8a3d", 1, 1.4),
        fish([0.13, 0.34, 0.03], "#ffd24a", -1, 1.2),
        fish([-0.17, 0.2, -0.04], "#f27aa0", -1, 1.1),
        ...[[0.0, 0.34, 0.05, 0.014], [0.015, 0.38, 0.05, 0.011], [0.005, 0.24, 0.05, 0.016]].map(([x, y, z, r]) =>
          K.part(new THREE.SphereGeometry(r!, 12, 8), M.glass("#ffffff", 0.55), { p: [x!, y!, z!] })),
        // An open rim and a slim lamp clipped across the back.
        K.part(rimGeo, trimMat, { p: [0, 0.49, 0] }),
        K.part(K.rbox(0.5, 0.045, 0.1, 0.022), trimMat, { p: [0, 0.535, -0.12] }),
        K.part(K.rbox(0.44, 0.02, 0.06, 0.01), lamp, { p: [0, 0.512, -0.115] }),
        ...[-0.2, 0.2].map((x) => K.part(K.rbox(0.04, 0.06, 0.06, 0.015), trimMat, { p: [x, 0.5, -0.15] })),
      ]);
    },
  },
  {
    id: "candle", name: "Scented Candle", series: "basic", category: "decor", kind: "misc", size: [1, 1],
    variants: [{ name: "White Porcelain", swatch: "#f7f3ea" }, { name: "Amber", swatch: "#d9954a" }, { name: "Pink", swatch: "#f3bccb" }, { name: "Sage", swatch: "#b4c6a6" }],
    light: { at: [0, 0.22, 0], color: "#ffdc98", intensity: 1.2, distance: 2.2, halo: 0.45, startsOn: true },
    build(v) {
      const jar = [M.ceramic("#f7f3ea"), M.gloss("#d9954a", 0.15), M.ceramic("#f3bccb"), M.ceramic("#b4c6a6")][v] ?? M.ceramic("#f7f3ea");
      const label = drawn("extras:candle-label", 128, 48, (g, w, h) => {
        g.fillStyle = "#efe2c8"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#8a6a52"; g.font = `bold ${h * 0.42}px "Baloo 2", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("calm", w / 2, h * 0.55);
      });
      return K.group([
        K.part(K.lathe([[0, 0], [0.1, 0], [0.112, 0.012], [0.116, 0.15], [0.11, 0.165], [0.1, 0.165], [0.098, 0.15], [0.096, 0.12], [0, 0.12]], 36), jar),
        K.part(K.puck(0.098, 0.022, 0.006, 32), M.paint("#fbf3e0", 0.7), { p: [0, 0.115, 0] }),
        K.part(K.lathe([[0.1185, 0.045], [0.12, 0.05], [0.12, 0.105], [0.1185, 0.11]], 36), M.paint("#efe2c8", 0.8)),
        plate(0.09, 0.034, M.printed("extras:candle-label", label), [0, 0.078, 0.121]),
        K.part(K.rod([0, 0.13, 0], [0, 0.16, 0], 0.01, 8), M.paint("#4a3a30")),
        flame([0, 0.158, 0], 0.075),
        bulb([0, 0.18, 0], 0.012, "#ffe2a8", 3),
        // Its wooden lid, and a box of matches.
        K.part(K.puck(0.11, 0.028, 0.01, 36), M.wood("#c9935d"), { p: [0.22, 0, 0.08] }),
        K.part(K.puck(0.03, 0.02, 0.008, 20), M.wood("#b98552"), { p: [0.22, 0.026, 0.08] }),
        K.group([
          K.part(K.rbox(0.11, 0.035, 0.07, 0.01), M.paint("#e8705f", 0.6)),
          K.part(K.rbox(0.07, 0.036, 0.04, 0.008), M.paint("#fbf3df", 0.6), { p: [0, 0.001, 0] }),
          K.part(K.rbox(0.112, 0.025, 0.012, 0.005), M.paint("#7a5a46", 0.9), { p: [0, 0, 0.032] }),
        ], { p: [-0.2, 0.018, 0.1], r: [0, 0.4, 0] }),
      ]);
    },
  },
  {
    id: "mug", name: "Mug", series: "basic", category: "decor", kind: "misc", size: [1, 0.5],
    variants: [{ name: "White", swatch: "#f8f5ee" }, { name: "Yellow", swatch: "#f3cd5a" }, { name: "Pink", swatch: "#f4b6c4" }, { name: "Sky Blue", swatch: "#9cc3e6" }],
    build(v) {
      const c = ["#f8f5ee", "#f3cd5a", "#f4b6c4", "#9cc3e6"][v] ?? "#f8f5ee";
      const glaze = M.ceramic(c);
      const latte = drawn("extras:latte", 128, 128, (g, w) => {
        g.fillStyle = "#a9714a"; g.fillRect(0, 0, w, w);
        g.fillStyle = "#f6e6cf"; heart(g, w / 2, w * 0.56, w * 0.36); g.fill();
        g.fillStyle = "#a9714a"; heart(g, w / 2, w * 0.58, w * 0.18); g.fill();
      });
      const steamMat = M.glass("#ffffff", 0.45);
      const mug = K.group([
        K.part(K.lathe([[0, 0], [0.082, 0], [0.093, 0.012], [0.096, 0.15], [0.092, 0.168], [0.084, 0.168], [0.081, 0.15], [0.079, 0.03], [0, 0.03]], 36), glaze),
        K.part(K.planarUV(new THREE.CircleGeometry(0.081, 36), 0.162, 0.162), M.printed("extras:latte", latte, 0.3), { p: [0, 0.135, 0], r: [-Math.PI / 2, 0, 0] }),
        K.part(K.tube([[0.088, 0.135, 0], [0.145, 0.14, 0], [0.165, 0.09, 0], [0.145, 0.04, 0], [0.09, 0.045, 0]], 0.017, 32, 10), glaze),
        ...(v === 0 ? [K.part(K.lathe([[0.0965, 0.06], [0.098, 0.065], [0.098, 0.085], [0.0965, 0.09]], 36), M.ceramic("#9cc3e6"))] : []),
        K.part(K.tube([[-0.02, 0.17, 0], [0.01, 0.21, 0.01], [-0.02, 0.25, 0], [0.005, 0.29, 0.01]], 0.012, 20, 6), steamMat),
        K.part(K.tube([[0.03, 0.17, -0.01], [0.05, 0.2, -0.01], [0.03, 0.23, -0.01]], 0.01, 14, 6), steamMat),
      ], { p: [0.03, 0.016, 0], r: [0, -0.7, 0] });
      return K.group([
        K.part(K.puck(0.13, 0.016, 0.006, 36), M.paint("#d2a878", 0.95), { p: [0.03, 0, 0] }),
        mug,
        // A cookie on the side.
        K.part(K.puck(0.055, 0.022, 0.01, 24), M.paint("#d9a35f", 0.8), { p: [-0.2, 0, 0.06] }),
        ...[[-0.215, 0.07], [-0.185, 0.05], [-0.2, 0.08], [-0.21, 0.045]].map(([x, z]) =>
          K.part(new THREE.SphereGeometry(0.01, 8, 6), M.paint("#6b4a33", 0.7), { p: [x!, 0.021, z!], s: [1, 0.6, 1] })),
      ]);
    },
  },
  {
    id: "guitar", name: "Guitar", series: "basic", category: "decor", kind: "floor", size: [1, 1],
    variants: [{ name: "Natural Wood", swatch: "#e9c98f" }, { name: "Cherry Red", swatch: "#d9605a" }, { name: "Sky Blue", swatch: "#86b6e0" }, { name: "Mint", swatch: "#9fd4c0" }],
    build(v) {
      const tops = ["#ecca8e", "#d9605a", "#86b6e0", "#9fd4c0"];
      const topMat = v === 0 ? M.wood(tops[0]!, "fine", 0.4) : M.gloss(tops[v] ?? tops[0]!, 0.3);
      const sides = M.wood("#a8683c", "fine", 0.4);
      const dark = M.wood("#5a3a28", "fine", 0.5);
      const bodyShape = (s: number) => {
        const half: Array<[number, number]> = [[0.1, 0.008], [0.17, 0.04], [0.2, 0.09], [0.205, 0.14], [0.185, 0.2], [0.14, 0.255], [0.128, 0.29], [0.142, 0.33], [0.155, 0.38], [0.14, 0.43], [0.09, 0.465]];
        const sh = new THREE.Shape();
        const P = (x: number, y: number) => new THREE.Vector2(x * s, 0.24 + (y - 0.24) * s);
        const start = P(0, 0);
        sh.moveTo(start.x, start.y);
        sh.splineThru([...half.map(([x, y]) => P(x, y)), P(0, 0.48)]);
        sh.splineThru([...[...half].reverse().map(([x, y]) => P(-x, y)), P(0, 0)]);
        return sh;
      };
      const strings = drawn("extras:guitar-strings", 32, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "#f4efe6";
        for (let i = 0; i < 6; i++) g.fillRect(3 + i * 5, 0, 1.6, h);
      });
      const frets = drawn("extras:guitar-frets", 32, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "#e8e2d6";
        for (let i = 1; i < 12; i++) g.fillRect(0, h - h * (1 - Math.pow(0.9, i)) * 1.5, w, 3);
        g.fillStyle = "#f4efe6";
        for (let i = 0; i < 6; i++) g.fillRect(3 + i * 5, 0, 1.6, h);
      });
      const stringMat = M.printed("extras:guitar-strings", strings, 0.4);
      stringMat.alphaTest = 0.5;
      const fretMat = M.printed("extras:guitar-frets", frets, 0.4);
      fretMat.alphaTest = 0.5;
      const pegs: THREE.Object3D[] = [];
      for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) {
          const y = 0.94 + i * 0.045;
          pegs.push(K.part(K.rod([s * 0.04, y, 0], [s * 0.07, y, 0], 0.01, 8), M.metal("#d8d8d8", 0.3)));
          pegs.push(K.part(K.soft(0.02, 0.03, 0.012, 0.6), M.plastic(CREAM), { p: [s * 0.078, y, 0] }));
        }
      }
      const guitar = K.group([
        K.part(K.extrude(bodyShape(1), 0.1, 0.02), sides),
        K.part(K.extrude(bodyShape(0.96), 0.02, 0.006), topMat, { p: [0, 0, 0.045] }),
        K.part(new THREE.CircleGeometry(0.048, 32), M.paint("#3e2c22", 0.9), { p: [0, 0.32, 0.0565] }),
        ring(0.06, 0.01, dark, [0, 0.32, 0.056]),
        K.part(K.rbox(0.13, 0.035, 0.022, 0.01), dark, { p: [0, 0.11, 0.062] }),
        K.part(K.rbox(0.08, 0.01, 0.02, 0.004), M.plastic(CREAM), { p: [0, 0.12, 0.072] }),
        plate(0.034, 0.36, stringMat, [0, 0.3, 0.075]),
        K.part(K.rbox(0.07, 0.42, 0.05, 0.022), sides, { p: [0, 0.67, 0.0] }),
        K.part(K.rbox(0.062, 0.42, 0.016, 0.006), dark, { p: [0, 0.67, 0.03] }),
        plate(0.056, 0.41, fretMat, [0, 0.67, 0.0385]),
        K.part(K.rbox(0.064, 0.014, 0.02, 0.005), M.plastic(CREAM), { p: [0, 0.882, 0.035] }),
        K.group([K.part(K.rbox(0.1, 0.17, 0.035, 0.022), dark, { p: [0, 0.085, 0] }), ...pegs.map((p) => K.place(p, { p: [p.position.x, p.position.y - 0.9, p.position.z] }))], { p: [0, 0.89, 0], r: [-0.12, 0, 0] }),
      ], { p: [0, 0.1, 0.1], r: [-0.2, 0, 0] });
      const stand = M.wood("#b98552");
      const rubber = M.plastic("#5a5052", 0.6);
      return K.group([
        guitar,
        // An A-frame stand: a back post to the neck rest, two front feet, a cradle.
        taper([0, 0.86, -0.09], [0, 0, -0.34], 0.018, 0.022, stand),
        taper([0, 0.32, -0.25], [-0.27, 0, 0.26], 0.018, 0.02, stand),
        taper([0, 0.32, -0.25], [0.27, 0, 0.26], 0.018, 0.02, stand),
        K.part(K.tube([[-0.06, 0.92, -0.06], [-0.045, 0.86, -0.1], [0.045, 0.86, -0.1], [0.06, 0.92, -0.06]], 0.014, 16, 8), rubber),
        K.part(K.tube([[-0.2, 0.15, 0.2], [-0.18, 0.08, 0.17], [-0.06, 0.07, 0.11], [0.06, 0.07, 0.11], [0.18, 0.08, 0.17], [0.2, 0.15, 0.2]], 0.017, 32, 8), rubber),
        K.part(K.rod([-0.17, 0.08, 0.16], [-0.18, 0.1, 0.07], 0.014), stand),
        K.part(K.rod([0.17, 0.08, 0.16], [0.18, 0.1, 0.07], 0.014), stand),
      ]);
    },
  },
  {
    id: "piano", name: "Upright Piano", series: "basic", category: "decor", kind: "floor", size: [2, 1],
    variants: [{ name: "White", swatch: "#f7f3ec" }, { name: "Walnut", swatch: "#8a5a3c" }, { name: "Ebony", swatch: "#3d3438" }, { name: "Mint", swatch: "#a9d5c1" }],
    surface: { rect: [-1, -0.5, 1, 0.5], y: 1.23 },
    build(v) {
      const body = [M.gloss("#f7f3ec", 0.25), M.wood("#8a5a3c", "fine", 0.4), M.gloss("#3d3438", 0.22), M.gloss("#a9d5c1", 0.25)][v] ?? M.gloss("#f7f3ec");
      const trim = [M.gloss("#ece4d6", 0.3), M.wood("#74482c", "fine", 0.45), M.gloss("#4a4044", 0.25), M.gloss("#8fc0aa", 0.3)][v] ?? M.gloss("#ece4d6");
      const brass = M.metal("#d8b26a", 0.3);
      const ivory = M.ceramic("#fffcf3");
      const ebony = M.gloss("#3a3336", 0.3);
      const sheet = drawn("extras:sheet-music", 256, 160, (g, w, h) => {
        g.fillStyle = "#fffaf0"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#e8dcc6"; g.fillRect(w / 2 - 1, 0, 2, h);
        g.strokeStyle = "#8a7a6a"; g.lineWidth = 1;
        for (let s = 0; s < 3; s++) for (let l = 0; l < 5; l++) {
          const y = 22 + s * 44 + l * 5;
          g.beginPath(); g.moveTo(10, y); g.lineTo(w / 2 - 8, y); g.moveTo(w / 2 + 8, y); g.lineTo(w - 10, y); g.stroke();
        }
        g.fillStyle = "#5a4a40";
        for (let i = 0; i < 24; i++) {
          const x = 18 + (i % 12) * 19 + (i % 12 >= 6 ? 20 : 0);
          const y = 22 + Math.floor(i / 12) * 44 + ((i * 7) % 5) * 4;
          g.beginPath(); g.ellipse(x, y, 3.5, 2.6, -0.4, 0, Math.PI * 2); g.fill();
          g.fillRect(x + 2.6, y - 14, 1.2, 14);
        }
      });
      const parts: THREE.Object3D[] = [
        K.part(K.rbox(1.86, 0.06, 0.58, 0.025), trim, { p: [0, 1.2, -0.17] }),
        K.part(K.rbox(1.72, 0.58, 0.5, 0.04), body, { p: [0, 0.9, -0.2] }),
        K.part(K.rbox(1.72, 0.52, 0.42, 0.04), body, { p: [0, 0.3, -0.24] }),
        K.part(K.rbox(0.1, 1.15, 0.58, 0.035, 3, "y"), body, { p: [-0.87, 0.595, -0.17] }),
        K.part(K.rbox(0.1, 1.15, 0.58, 0.035, 3, "y"), body, { p: [0.87, 0.595, -0.17] }),
        // Key bed, key slip and the end blocks.
        K.part(K.rbox(1.66, 0.07, 0.36, 0.02), body, { p: [0, 0.615, 0.12] }),
        K.part(K.rbox(1.68, 0.06, 0.045, 0.02), trim, { p: [0, 0.64, 0.3] }),
        K.part(K.rbox(0.08, 0.13, 0.36, 0.03), body, { p: [-0.79, 0.69, 0.12] }),
        K.part(K.rbox(0.08, 0.13, 0.36, 0.03), body, { p: [0.79, 0.69, 0.12] }),
        // Fallboard with a little brass name plate, music desk with a score.
        K.part(K.rbox(1.58, 0.13, 0.04, 0.018), trim, { p: [0, 0.73, 0.03] }),
        K.part(K.rbox(0.14, 0.025, 0.012, 0.006), brass, { p: [0, 0.74, 0.054] }),
        K.part(K.rbox(0.92, 0.3, 0.035, 0.015), trim, { p: [0, 0.94, 0.09], r: [-0.22, 0, 0] }),
        K.part(K.rbox(0.92, 0.035, 0.07, 0.015), trim, { p: [0, 0.8, 0.13] }),
        plate(0.46, 0.27, M.printed("extras:sheet-music", sheet, 0.7), [0, 0.95, 0.11], [-0.22, 0, 0]),
        // Front legs, toes and the lower panel with pedals.
        K.part(K.rbox(0.08, 0.58, 0.08, 0.03, 3, "y"), body, { p: [-0.79, 0.29, 0.26] }),
        K.part(K.rbox(0.08, 0.58, 0.08, 0.03, 3, "y"), body, { p: [0.79, 0.29, 0.26] }),
        K.part(K.rbox(0.1, 0.06, 0.5, 0.025), trim, { p: [-0.79, 0.03, 0.08] }),
        K.part(K.rbox(0.1, 0.06, 0.5, 0.025), trim, { p: [0.79, 0.03, 0.08] }),
        K.part(K.rbox(1.3, 0.36, 0.03, 0.015), trim, { p: [0, 0.32, -0.02] }),
        K.part(K.rbox(0.4, 0.07, 0.08, 0.025), trim, { p: [0, 0.06, -0.01] }),
        ...[-0.09, 0, 0.09].map((x) => K.part(K.rbox(0.05, 0.022, 0.12, 0.01), brass, { p: [x, 0.07, 0.07] })),
      ];
      // 22 white keys and the black ones in their twos and threes.
      const n = 22, kw = 1.48 / n;
      for (let i = 0; i < n; i++) parts.push(K.part(K.rbox(kw - 0.005, 0.035, 0.24, 0.008), ivory, { p: [-0.74 + kw * (i + 0.5), 0.665, 0.17] }));
      for (let i = 0; i < n - 1; i++) {
        if ([0, 1, 3, 4, 5].includes(i % 7)) parts.push(K.part(K.rbox(kw * 0.55, 0.04, 0.14, 0.01), ebony, { p: [-0.74 + kw * (i + 1), 0.69, 0.11] }));
      }
      // A brass candle sconce on each side of the desk.
      for (const s of [-1, 1]) {
        parts.push(K.part(K.puck(0.04, 0.02, 0.008, 16), brass, { p: [s * 0.62, 0.88, 0.07] }));
        parts.push(K.part(K.puck(0.018, 0.08, 0.008, 12), M.paint(CREAM), { p: [s * 0.62, 0.9, 0.07] }));
      }
      return K.group(parts);
    },
  },

  // ---------- Wall ----------
  {
    id: "arched-window", name: "Arched Window", series: "basic", category: "window", kind: "wall", size: [2, 2], hang: 1.5,
    variants: [{ name: "White Frame", swatch: "#fbf8f0" }, { name: "Wood Frame", swatch: "#c9935d" }, { name: "Mint Frame", swatch: "#9fd4c0" }],
    build(v) {
      const frameMat = [M.paint("#fbf8f0", 0.5), M.wood("#c9935d"), M.paint("#9fd4c0", 0.5)][v] ?? M.paint("#fbf8f0");
      const curtain = M.fabric(["#efe6d6", "#b9c9ac", "#f3c0c8"][v] ?? "#efe6d6", 0.8);
      const tie = M.fabric(["#c9b28e", "#e9d8b8", "#fbf3e6"][v] ?? "#c9b28e", 0.6);
      const W = 1.46, H = 1.84, b = 0.09, cy = -H / 2 - 0.02;
      const outer = K.archShape(W, H, cy);
      outer.holes.push(K.archShape(W - b * 2, H - b * 2, cy + b) as unknown as THREE.Path);
      const glassGeo = K.planarUV(new THREE.ShapeGeometry(K.archShape(W - b * 2 + 0.02, H - b * 2 + 0.02, cy + b - 0.01), 32), W, H);
      const spring = cy + H - W / 2;
      const r = W / 2 - b;
      const parts: THREE.Object3D[] = [
        K.part(glassGeo, M.skyPane(), { p: [0, 0, 0.02] }),
        K.part(K.extrude(outer, 0.1, 0.02), frameMat, { p: [0, 0, 0.06] }),
        // Mullions: a cross below, a sunburst in the arch.
        K.part(K.rbox(0.05, spring - cy - b + 0.02, 0.05, 0.018), frameMat, { p: [0, (spring + cy + b) / 2, 0.05] }),
        K.part(K.rbox(W - b * 2, 0.05, 0.05, 0.018), frameMat, { p: [0, spring, 0.05] }),
        K.part(K.rbox(W - b * 2, 0.05, 0.05, 0.018), frameMat, { p: [0, cy + b + (spring - cy - b) * 0.45, 0.05] }),
        ...[Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4].map((a) => K.part(K.rod([0, spring, 0.05], [Math.cos(a) * r, spring + Math.sin(a) * r, 0.05], 0.022), frameMat)),
        K.part(K.puck(0.1, 0.05, 0.02, 32), frameMat, { p: [0, spring, 0.03], r: [Math.PI / 2, 0, 0] }),
        K.part(K.rbox(1.66, 0.07, 0.22, 0.03), frameMat, { p: [0, cy + 0.03, 0.11] }),
        // A rod with round finials.
        K.part(K.rod([-0.94, 0.93, 0.15], [0.94, 0.93, 0.15], 0.016), M.metal("#d6b16a", 0.35)),
        K.part(new THREE.SphereGeometry(0.035, 16, 12), M.metal("#d6b16a", 0.35), { p: [-0.95, 0.93, 0.15] }),
        K.part(new THREE.SphereGeometry(0.035, 16, 12), M.metal("#d6b16a", 0.35), { p: [0.95, 0.93, 0.15] }),
      ];
      // Tied-back drapes: gathered at the tie, full above and flared below.
      const drapeH = 1.82;
      const tieT = 0.36;
      for (const side of [-1, 1]) {
        const geo = new THREE.CylinderGeometry(0.12, 0.12, drapeH, 28, 28, false);
        const p = geo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const t = (y + drapeH / 2) / drapeH;
          const fold = 1 + 0.13 * Math.sin(Math.atan2(z, x) * 7);
          const w = t > tieT ? 0.42 + 0.63 * Math.min(1, (t - tieT) / 0.4) : 0.42 + 0.78 * Math.min(1, Math.pow((tieT - t) / tieT, 0.7));
          const sweep = side * 0.085 * Math.exp(-((t - tieT) ** 2) / 0.05);
          p.setXYZ(i, x * w * fold + sweep, y, z * w * fold * 0.55);
        }
        geo.computeVertexNormals();
        K.boxUV(geo, 0.5, "y");
        const y0 = 0.9 - drapeH / 2;
        parts.push(K.part(geo, curtain, { p: [side * 0.8, y0, 0.16] }));
        parts.push(K.part(new THREE.TorusGeometry(0.06, 0.018, 8, 32), tie, { p: [side * 0.885, y0 - drapeH / 2 + tieT * drapeH, 0.16], r: [Math.PI / 2, 0, 0], s: [1, 0.6, 1] }));
      }
      return K.group(parts);
    },
  },
  {
    id: "air-conditioner", name: "Air Conditioner", series: "basic", category: "appliance", kind: "wall", size: [2, 0.5], hang: 2.25,
    variants: [{ name: "White", swatch: "#f7f6f2" }, { name: "Cream", swatch: "#f4ead6" }, { name: "Mint", swatch: "#bfe3d4" }, { name: "Pink", swatch: "#f6cdd6" }],
    build(v) {
      const c = ["#f7f6f2", "#f4ead6", "#bfe3d4", "#f6cdd6"][v] ?? "#f7f6f2";
      const shell = M.plastic(c, 0.35);
      const face = M.gloss(new THREE.Color(c).lerp(new THREE.Color("#ffffff"), 0.4).getStyle(), 0.3);
      const vent = M.plastic("#9aa1a6", 0.6);
      const display = drawn("extras:ac-display", 128, 48, (g, w, h) => {
        g.fillStyle = "#e9eef0"; roundRect(g, 0, 0, w, h, 12); g.fill();
        g.fillStyle = "#4fa8c8"; g.font = `bold ${h * 0.62}px "Baloo 2", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("26°", w * 0.44, h * 0.56);
        g.fillStyle = "#7cd88f"; g.beginPath(); g.arc(w * 0.84, h * 0.5, 5, 0, Math.PI * 2); g.fill();
      });
      const badge = drawn("extras:ac-badge", 64, 64, (g, w) => {
        g.clearRect(0, 0, w, w);
        g.fillStyle = "#8fc08a";
        g.beginPath(); g.ellipse(w / 2, w / 2, w * 0.2, w * 0.36, 0.6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#ffffff"; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.36, w * 0.68); g.lineTo(w * 0.64, w * 0.32); g.stroke();
      });
      const badgeMat = M.printed("extras:ac-badge", badge);
      badgeMat.alphaTest = 0.5;
      return K.group([
        K.part(K.rbox(1.6, 0.42, 0.22, 0.09), shell, { p: [0, 0.02, 0.11] }),
        K.part(K.rbox(1.52, 0.29, 0.04, 0.03), face, { p: [0, 0.07, 0.22] }),
        K.part(K.rbox(1.34, 0.05, 0.04, 0.02), vent, { p: [0, -0.135, 0.2] }),
        K.part(K.rbox(1.36, 0.028, 0.09, 0.012), shell, { p: [0, -0.165, 0.215], r: [0.45, 0, 0] }),
        plate(0.16, 0.06, M.printed("extras:ac-display", display, 0.4), [0.56, 0.02, 0.2415]),
        plate(0.06, 0.06, badgeMat, [-0.64, 0.17, 0.2415]),
        ...[0, 1, 2, 3, 4, 5, 6].map((i) => K.part(K.rbox(0.16, 0.02, 0.03, 0.009), vent, { p: [-0.48 + i * 0.16, 0.233, 0.12] })),
      ]);
    },
  },

  // ---------- Ceiling ----------
  {
    id: "chandelier", name: "Chandelier", series: "basic", category: "ceiling", kind: "ceiling", size: [2, 2],
    variants: [{ name: "Gold", swatch: "#d9b46a" }, { name: "Silver", swatch: "#d8dde2" }, { name: "White", swatch: "#f6f1e8" }, { name: "Rose Gold", swatch: "#e3a99a" }],
    light: { at: [0, -0.55, 0], color: "#ffe2a8", intensity: 5.5, distance: 6, halo: 1.8, startsOn: true },
    build(v) {
      const arm = [M.metal("#d9b46a", 0.3), M.metal("#d8dde2", 0.25), M.gloss("#f6f1e8", 0.3), M.metal("#f2c4b4", 0.28)][v] ?? M.metal("#d9b46a", 0.3);
      const crystal = M.glass("#f2fbff", 0.7);
      const wax = M.ceramic("#fffaf0");
      const drop = (p: V3, s: number) => {
        const m = K.part(new THREE.OctahedronGeometry(s, 0), crystal, { p, s: [0.7, 1.6, 0.7] });
        m.castShadow = false;
        return m;
      };
      const bead = (p: V3, r = 0.016) => {
        const m = K.part(new THREE.SphereGeometry(r, 10, 8), crystal, { p });
        m.castShadow = false;
        return m;
      };
      const parts: THREE.Object3D[] = [
        K.part(K.puck(0.13, 0.05, 0.02, 32), arm, { p: [0, -0.05, 0] }),
        K.part(K.rod([0, -0.04, 0], [0, -0.42, 0], 0.016), arm),
        K.part(new THREE.SphereGeometry(0.04, 18, 14), arm, { p: [0, -0.2, 0] }),
        K.part(K.lathe([[0, -0.8], [0.04, -0.79], [0.09, -0.74], [0.11, -0.67], [0.08, -0.6], [0.045, -0.52], [0.05, -0.45], [0.03, -0.42], [0, -0.42]], 32), arm),
        ring(0.2, 0.014, arm, [0, -0.44, 0], [Math.PI / 2, 0, 0]),
        drop([0, -0.89, 0], 0.05),
        bead([0, -0.82, 0], 0.022),
      ];
      const N = 6, R = 0.6;
      const tips: V3[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + Math.PI / 6;
        const cs = Math.cos(a), sn = Math.sin(a);
        const tip: V3 = [cs * R, -0.6, sn * R];
        tips.push(tip);
        parts.push(
          K.part(K.tube([[cs * 0.08, -0.66, sn * 0.08], [cs * 0.25, -0.77, sn * 0.25], [cs * 0.46, -0.75, sn * 0.46], [cs * 0.57, -0.67, sn * 0.57], tip], 0.018, 36, 8), arm),
          K.part(K.lathe([[0, 0], [0.025, 0], [0.065, 0.025], [0.07, 0.035], [0.03, 0.03], [0, 0.03]], 24), arm, { p: tip }),
          K.part(K.puck(0.026, 0.12, 0.01, 16), wax, { p: [tip[0], tip[1] + 0.02, tip[2]] }),
          flame([tip[0], tip[1] + 0.14, tip[2]], 0.07, 2.2),
          drop([tip[0], tip[1] - 0.07, tip[2]], 0.026),
          drop([cs * 0.2, -0.5, sn * 0.2], 0.022),
        );
      }
      // Swags of crystal beads from cup to cup.
      for (let i = 0; i < N; i++) {
        const a = tips[i]!, b = tips[(i + 1) % N]!;
        for (let k = 1; k < 8; k++) {
          const t = k / 8;
          const sag = Math.sin(t * Math.PI) * 0.12;
          parts.push(bead([a[0] + (b[0] - a[0]) * t, a[1] - 0.02 - sag, a[2] + (b[2] - a[2]) * t], 0.014));
        }
      }
      return K.group(parts);
    },
  },

  // ---------- Rugs ----------
  {
    id: "shaggy-rug", name: "Shaggy Rug", series: "basic", category: "rug", kind: "rug", size: [2, 2],
    variants: [{ name: "Milk White", swatch: "#f6f0e4" }, { name: "Pink", swatch: "#f5c2cf" }, { name: "Mint", swatch: "#bfe5d5" }, { name: "Grey", swatch: "#cfcdc8" }],
    build(v) {
      const c = ["#f6f0e4", "#f5c2cf", "#bfe5d5", "#cfcdc8"][v] ?? "#f6f0e4";
      const base = new THREE.Color(c);
      const light = base.clone().lerp(new THREE.Color("#ffffff"), 0.45).getStyle();
      const shade = base.clone().multiplyScalar(0.86).getStyle();
      const body = rug(`extras:shaggy:${v}`, 1.9, 1.9, 1, (g, w, h) => {
        g.fillStyle = c;
        g.fillRect(0, 0, w, h);
        // Tufts: short strokes every which way.
        let s = 7 + v;
        const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
        g.lineCap = "round";
        for (let i = 0; i < 2600; i++) {
          const x = r() * w, y = r() * h, a = r() * Math.PI * 2, l = 5 + r() * 9;
          g.strokeStyle = r() > 0.5 ? light : shade;
          g.lineWidth = 2 + r() * 2.5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
      }, 0.05);
      const fluff = K.part(new THREE.TorusGeometry(0.9, 0.05, 12, 72), M.plush(c), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.6] });
      fluff.castShadow = false;
      return K.group([body, fluff]);
    },
  },
];

