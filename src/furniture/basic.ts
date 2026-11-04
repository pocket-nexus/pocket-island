// Odds and ends: plants, lamps, small things, windows, clocks, rugs and ceiling
// lamps that go with every series.

import * as THREE from "three";
import { K, M, book, bulb, dome, framed, pot, rug, shade } from "./common.ts";
import { heart, roundRect, star } from "../scene/textures.ts";
import { drawn } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

const clockFace = (key: string, bg: string, ink: string) => drawn(`clock:${key}`, 256, 256, (g, w) => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, w);
  g.fillStyle = ink;
  g.font = `bold ${w * 0.11}px "Baloo 2", "PingFang SC", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    if (i % 3 === 0) g.fillText(String(i), w / 2 + Math.cos(a) * w * 0.36, w / 2 + Math.sin(a) * w * 0.36);
    else {
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * w * 0.37, w / 2 + Math.sin(a) * w * 0.37, w * 0.018, 0, Math.PI * 2);
      g.fill();
    }
  }
});

export const BASIC: FurnitureDef[] = [
  {
    id: "monstera", name: "Monstera", series: "basic", category: "plant", kind: "misc", size: [1, 1],
    variants: [{ name: "White Pot", swatch: "#f3efe6" }, { name: "Clay Pot", swatch: "#c97a52" }, { name: "Blue Pot", swatch: "#7fa8d8" }],
    build(v) {
      const potMat = M.ceramic(["#f3efe6", "#c97a52", "#7fa8d8"][v] ?? "#f3efe6");
      const { parts, top } = pot(0.26, 0.42, potMat);
      const leaf = M.leaf("#4f9a52");
      const leafDark = M.leaf("#3f8445");
      const stems: THREE.Object3D[] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        const h = 0.55 + (i % 3) * 0.18;
        const tip: K.V3 = [Math.cos(a) * 0.3, top + h, Math.sin(a) * 0.3];
        stems.push(K.part(K.tube([[0, top, 0], [tip[0] * 0.4, top + h * 0.6, tip[2] * 0.4], tip], 0.012, 16, 6), M.paint("#5c9a4a")));
        const l = K.part(K.leafGeometry(0.42, 0.36, 0.18, -0.15, "heart"), i % 2 ? leaf : leafDark, {});
        l.rotation.order = "YXZ";
        l.rotation.set(-0.2, -a + Math.PI / 2, 0);
        l.position.set(...tip);
        stems.push(l);
      }
      return K.group([...parts, ...stems]);
    },
  },
  {
    id: "succulent", name: "Little Succulent", series: "basic", category: "plant", kind: "misc", size: [1, 1],
    variants: [{ name: "Pink Pot", swatch: "#f5b7c5" }, { name: "White Pot", swatch: "#f3efe6" }, { name: "Yellow Pot", swatch: "#f2cf63" }],
    build(v) {
      const potMat = M.ceramic(["#f5b7c5", "#f3efe6", "#f2cf63"][v] ?? "#f3efe6");
      const { parts, top } = pot(0.13, 0.17, potMat);
      const leaf = M.leaf("#8cc79a");
      const rosette: THREE.Object3D[] = [];
      for (let ring = 0; ring < 3; ring++) {
        const n = 6 + ring * 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.4;
          const l = K.part(K.soft(0.06 - ring * 0.012, 0.035, 0.13 - ring * 0.03, 0.7), leaf, {});
          l.rotation.order = "YXZ";
          l.rotation.set(-0.7 - ring * 0.35, -a, 0);
          l.position.set(Math.cos(a) * (0.06 - ring * 0.02), top + 0.03 + ring * 0.025, Math.sin(a) * (0.06 - ring * 0.02));
          rosette.push(l);
        }
      }
      return K.group([...parts, ...rosette]);
    },
  },
  {
    id: "fiddle-leaf", name: "Fiddle-Leaf Fig", series: "basic", category: "plant", kind: "floor", size: [1, 1],
    variants: [{ name: "Rattan Pot", swatch: "#d6b07a" }, { name: "White Pot", swatch: "#f3efe6" }],
    build(v) {
      const potMat = v === 0 ? M.rattan("#d8b07a") : M.ceramic("#f3efe6");
      const { parts, top } = pot(0.3, 0.46, potMat);
      const trunk = K.part(K.tube([[0, top, 0], [0.03, top + 0.5, 0.02], [-0.02, top + 1.0, -0.01], [0.01, top + 1.3, 0]], 0.03, 24, 8), M.wood("#8a6142"));
      const out: THREE.Object3D[] = [trunk];
      const leaf = M.leaf("#3f8a48");
      const leaf2 = M.leaf("#55a35a");
      for (let i = 0; i < 16; i++) {
        const t = i / 16;
        const a = i * 2.4;
        const y = top + 0.45 + t * 0.95;
        const l = K.part(K.leafGeometry(0.34 - t * 0.08, 0.22, 0.2, -0.05, "oval"), i % 2 ? leaf : leaf2, {});
        l.rotation.order = "YXZ";
        l.rotation.set(-0.5 + t * 0.6, a, 0);
        l.position.set(Math.sin(a) * 0.03, y, Math.cos(a) * 0.03);
        out.push(l);
      }
      return K.group([...parts, ...out]);
    },
  },
  {
    id: "flower-vase", name: "Tulip Vase", series: "basic", category: "decor", kind: "misc", size: [1, 1],
    variants: [{ name: "Red", swatch: "#e8564f" }, { name: "Pink", swatch: "#f49ab5" }, { name: "Yellow", swatch: "#f6cb3f" }, { name: "White", swatch: "#f8f4ec" }],
    build(v) {
      const petal = M.plastic(["#e8564f", "#f49ab5", "#f6cb3f", "#f8f4ec"][v] ?? "#e8564f", 0.55);
      const vase = K.part(K.lathe([[0, 0], [0.09, 0], [0.12, 0.08], [0.1, 0.2], [0.06, 0.27], [0.07, 0.3], [0.06, 0.3], [0, 0.29]], 32), M.glass("#d9f1ff", 0.45));
      const water = K.part(K.lathe([[0, 0.01], [0.085, 0.01], [0.11, 0.08], [0.095, 0.17], [0, 0.17]], 24), M.glass("#bfe6ff", 0.25));
      const out: THREE.Object3D[] = [vase, water];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const tip: K.V3 = [Math.cos(a) * 0.1, 0.52 + (i % 2) * 0.06, Math.sin(a) * 0.1];
        out.push(K.part(K.tube([[0, 0.05, 0], [Math.cos(a) * 0.03, 0.3, Math.sin(a) * 0.03], tip], 0.008, 12, 5), M.paint("#5e9e4b")));
        const cup = K.part(K.lathe([[0, 0], [0.03, 0.01], [0.045, 0.05], [0.042, 0.09], [0.03, 0.1], [0, 0.07]], 16), petal, { p: tip });
        out.push(cup);
        const lf = K.part(K.leafGeometry(0.16, 0.05, 0.3, 0.1, "long"), M.leaf("#6aae55"), {});
        lf.rotation.set(-1.0, a + 1, 0);
        lf.position.set(Math.cos(a) * 0.03, 0.27, Math.sin(a) * 0.03);
        out.push(lf);
      }
      return K.group(out);
    },
  },
  {
    id: "table-lamp", name: "Mushroom Lamp", series: "basic", category: "lamp", kind: "misc", size: [1, 1],
    variants: [{ name: "Buttercream", swatch: "#f6e7c8" }, { name: "Red Dots", swatch: "#e86a5a" }, { name: "Mint", swatch: "#a8dcc6" }],
    light: { at: [0, 0.42, 0], color: "#ffcf8a", intensity: 2.2, distance: 3.2, halo: 0.9, startsOn: true },
    build(v) {
      const cap = ["#f6e7c8", "#e86a5a", "#a8dcc6"][v] ?? "#f6e7c8";
      const cap0 = dome([[0, 0.34], [0.26, 0.34], [0.27, 0.37], [0.24, 0.45], [0.16, 0.53], [0, 0.56]], cap, "#ffe2a8", 0.9);
      const parts: THREE.Object3D[] = [
        K.part(K.puck(0.15, 0.05, 0.02), M.ceramic("#fbf6ec")),
        K.part(K.lathe([[0, 0.04], [0.06, 0.04], [0.05, 0.2], [0.07, 0.34], [0, 0.34]], 24), M.ceramic("#fbf6ec")),
        cap0,
        bulb([0, 0.36, 0], 0.07),
      ];
      if (v === 1) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const dot = K.part(new THREE.SphereGeometry(0.035, 12, 8), M.paint("#fff8ec"), { p: [Math.cos(a) * 0.2, 0.46, Math.sin(a) * 0.2], s: [1, 0.5, 1] });
          dot.lookAt(Math.cos(a) * 1, 0.9, Math.sin(a) * 1);
          parts.push(dot);
        }
      }
      return K.group(parts);
    },
  },
  {
    id: "floor-lamp", name: "Floor Lamp", series: "basic", category: "lamp", kind: "floor", size: [1, 1],
    variants: [{ name: "White", swatch: "#f7f1e3" }, { name: "Yellow", swatch: "#f2c75c" }, { name: "Pink", swatch: "#f3b2c1" }],
    light: { at: [0, 1.45, 0], color: "#ffdcaa", intensity: 3.2, distance: 4.5, halo: 1.1, startsOn: true },
    build(v) {
      const c = ["#f7f1e3", "#f2c75c", "#f3b2c1"][v] ?? "#f7f1e3";
      const brass = M.metal("#d8b26a", 0.35);
      const s = shade(0.3, 0.2, 0.36, c, "#ffe2a8", 0.9);
      s.position.set(0, 1.5, 0);
      return K.group([
        K.part(K.puck(0.22, 0.05, 0.02), brass),
        K.part(K.rod([0, 0.04, 0], [0, 1.42, 0], 0.018), brass),
        s,
        bulb([0, 1.44, 0], 0.07),
      ]);
    },
  },
  {
    id: "alarm-clock", name: "Alarm Clock", series: "basic", category: "decor", kind: "misc", size: [1, 1],
    variants: [{ name: "Red", swatch: "#e65a4f" }, { name: "Blue", swatch: "#5f95d6" }, { name: "Yellow", swatch: "#f3c548" }],
    build(v) {
      const c = ["#e65a4f", "#5f95d6", "#f3c548"][v] ?? "#e65a4f";
      const body = M.gloss(c, 0.3);
      const face = M.printed(`clockface:${v}`, clockFace("alarm", "#fffaf0", "#5a4636"));
      const faceGeo = K.planarUV(new THREE.CircleGeometry(0.1, 40), 0.2, 0.2);
      const bell = (x: number) => K.part(K.lathe([[0, 0], [0.06, 0], [0.055, 0.03], [0.03, 0.055], [0, 0.06]], 20), M.metal("#e5c46e"), { p: [x, 0.24, 0], r: [0, 0, x > 0 ? -0.5 : 0.5] });
      return K.group([
        K.part(K.puck(0.12, 0.1, 0.035, 40), body, { p: [0, 0.135, -0.05], r: [Math.PI / 2, 0, 0] }),
        K.part(faceGeo, face, { p: [0, 0.135, 0.052] }),
        bell(-0.08),
        bell(0.08),
        K.part(K.rod([-0.06, 0.03, 0], [-0.08, 0, 0.01], 0.012), M.metal("#e5c46e")),
        K.part(K.rod([0.06, 0.03, 0], [0.08, 0, 0.01], 0.012), M.metal("#e5c46e")),
        K.part(K.rbox(0.012, 0.06, 0.006, 0.003), M.paint("#3b2e26"), { p: [0, 0.155, 0.056], r: [0, 0, 0.3] }),
        K.part(K.rbox(0.01, 0.08, 0.006, 0.003), M.paint("#3b2e26"), { p: [0.015, 0.135, 0.058], r: [0, 0, -1.3] }),
      ]);
    },
  },
  {
    id: "book-stack", name: "Stack of Books", series: "basic", category: "decor", kind: "misc", size: [1, 1],
    variants: [{ name: "Colorful", swatch: "#e0745f" }, { name: "Retro", swatch: "#8b6a4e" }],
    build(v) {
      const covers = v === 0 ? ["#e0745f", "#5f8fcf", "#f2c14e", "#7cb87a"] : ["#8b6a4e", "#5d7b6a", "#a2553f", "#3f5a7a"];
      const out = covers.map((c, i) => K.group([book([0, 0, 0], 0.06, 0.42 - i * 0.03, 0.32 - i * 0.02, c, Math.PI / 2)], { p: [0, 0.03 + i * 0.061, 0], r: [0, i * 0.35 - 0.4, 0] }));
      return K.group(out);
    },
  },
  {
    id: "teddy-bear", name: "Teddy Bear", series: "basic", category: "toy", kind: "misc", size: [1, 1],
    variants: [{ name: "Brown", swatch: "#b8865a" }, { name: "Pink", swatch: "#f2b6c4" }, { name: "White", swatch: "#f4efe6" }],
    build(v) {
      const fur = M.plush(["#b8865a", "#f2b6c4", "#f4efe6"][v] ?? "#b8865a");
      const muzzle = M.plush("#f4e3c8");
      const eye = M.gloss("#2b211b", 0.2);
      const ball = (r: number, p: K.V3, s: K.V3 = [1, 1, 1], m: THREE.Material = fur) => K.part(new THREE.SphereGeometry(r, 28, 20), m, { p, s });
      return K.group([
        ball(0.17, [0, 0.17, 0], [1, 0.95, 0.9]),
        ball(0.14, [0, 0.42, 0.01]),
        ball(0.05, [-0.1, 0.54, 0]),
        ball(0.05, [0.1, 0.54, 0]),
        ball(0.06, [0, 0.39, 0.12], [1.1, 0.8, 0.8], muzzle),
        ball(0.018, [-0.05, 0.45, 0.125], [1, 1, 1], eye),
        ball(0.018, [0.05, 0.45, 0.125], [1, 1, 1], eye),
        ball(0.016, [0, 0.41, 0.17], [1.3, 1, 1], eye),
        ball(0.065, [-0.17, 0.24, 0.05], [0.9, 1.2, 0.9]),
        ball(0.065, [0.17, 0.24, 0.05], [0.9, 1.2, 0.9]),
        ball(0.07, [-0.09, 0.06, 0.12], [1, 0.8, 1.2]),
        ball(0.07, [0.09, 0.06, 0.12], [1, 0.8, 1.2]),
        K.part(K.soft(0.12, 0.05, 0.04, 0.5), M.fabric("#e0574f"), { p: [0, 0.31, 0.1], r: [0.4, 0, 0] }),
      ]);
    },
  },

  // ---------- Rugs ----------
  {
    id: "round-rug", name: "Round Rug", series: "basic", category: "rug", kind: "rug", size: [3, 3],
    variants: [{ name: "Rainbow", swatch: "#f2a3b5" }, { name: "Mint", swatch: "#a6dbc5" }, { name: "Sunflower", swatch: "#f6cf5a" }],
    build(v) {
      const rings = [["#f6a6b8", "#fdf2e4", "#f8cf6a", "#fdf2e4", "#9fd6c4"], ["#7fc7ae", "#f4fbf6", "#a6dbc5", "#f4fbf6", "#7fc7ae"], ["#f2b53f", "#fde7a6", "#f6cf5a", "#fff4d2", "#e89a3a"]][v] ?? [];
      return rug(`round:${v}`, 2.9, 2.9, 1, (g, w, h) => {
        rings.forEach((c, i) => {
          g.fillStyle = c;
          g.beginPath();
          g.ellipse(w / 2, h / 2, (w / 2) * (1 - i * 0.17), (h / 2) * (1 - i * 0.17), 0, 0, Math.PI * 2);
          g.fill();
        });
      });
    },
  },
  {
    id: "stripe-rug", name: "Striped Rug", series: "basic", category: "rug", kind: "rug", size: [3, 2],
    variants: [{ name: "Blue & White", swatch: "#7fa9d8" }, { name: "Red & White", swatch: "#e2766a" }, { name: "Green & White", swatch: "#86c08a" }],
    build(v) {
      const c = ["#7fa9d8", "#e2766a", "#86c08a"][v] ?? "#7fa9d8";
      return rug(`stripe:${v}`, 2.9, 1.9, 0.12, (g, w, h) => {
        g.fillStyle = "#fbf5e8";
        g.fillRect(0, 0, w, h);
        g.fillStyle = c;
        for (let i = 0; i < 7; i++) if (i % 2 === 0) g.fillRect(0, (i / 7) * h + h * 0.03, w, h / 7 - h * 0.02);
        g.strokeStyle = c;
        g.lineWidth = 10;
        g.strokeRect(14, 14, w - 28, h - 28);
      });
    },
  },
  {
    id: "heart-rug", name: "Heart Rug", series: "cute", category: "rug", kind: "rug", size: [2, 2],
    variants: [{ name: "Pink", swatch: "#f4a5bc" }, { name: "Red", swatch: "#e25d6a" }],
    build(v) {
      const c = ["#f4a5bc", "#e25d6a"][v] ?? "#f4a5bc";
      return rug(`heart:${v}`, 1.9, 1.9, 0.5, (g, w, h) => {
        g.fillStyle = "#fff1f4";
        g.fillRect(0, 0, w, h);
        g.fillStyle = c;
        heart(g, w / 2, h / 2 + h * 0.12, w * 0.5);
        g.fill();
        g.fillStyle = "#ffffffaa";
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          heart(g, w / 2 + Math.cos(a) * w * 0.4, h / 2 + Math.sin(a) * h * 0.4, w * 0.04);
          g.fill();
        }
      });
    },
  },

  // ---------- Wall ----------
  {
    id: "simple-window", name: "Wooden Window", series: "basic", category: "window", kind: "wall", size: [2, 1.5], hang: 1.75,
    variants: [{ name: "White Frame", swatch: "#fbf8f0" }, { name: "Wood Frame", swatch: "#c9935d" }, { name: "Green Frame", swatch: "#7fb58f" }],
    build(v) {
      const frameMat = [M.paint("#fbf8f0", 0.5), M.wood("#c9935d"), M.paint("#7fb58f", 0.5)][v] ?? M.paint("#fbf8f0");
      const outer = K.roundedRectShape(1.5, 1.3, 0.04);
      outer.holes.push(K.roundedRectShape(1.3, 1.1, 0.02) as unknown as THREE.Path);
      const curtain = M.fabric(["#f3a6a6", "#f2d78a", "#f4f0e6"][v] ?? "#f3a6a6", 0.8);
      const fold = (x: number, flip: number) => {
        const geo = new THREE.CylinderGeometry(0.11, 0.17, 1.42, 24, 6, false);
        const p = geo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const a = Math.atan2(p.getZ(i), p.getX(i));
          const r = 1 + 0.12 * Math.sin(a * 6);
          p.setXYZ(i, p.getX(i) * r, p.getY(i), p.getZ(i) * r * 0.6);
        }
        geo.computeVertexNormals();
        K.boxUV(geo, 0.5, "y");
        return K.part(geo, curtain, { p: [x, -0.02, 0.12], r: [0, 0, flip * 0.04] });
      };
      return K.group([
        K.part(K.rbox(1.34, 1.14, 0.02, 0.01), M.skyPane(), { p: [0, 0, 0.02] }),
        K.part(K.extrude(outer, 0.1, 0.02), frameMat, { p: [0, 0, 0.06] }),
        K.part(K.rbox(0.05, 1.12, 0.05, 0.015), frameMat, { p: [0, 0, 0.05] }),
        K.part(K.rbox(1.32, 0.05, 0.05, 0.015), frameMat, { p: [0, 0.05, 0.05] }),
        K.part(K.rbox(1.66, 0.07, 0.2, 0.025), frameMat, { p: [0, -0.68, 0.1] }),
        K.part(K.rod([-0.92, 0.7, 0.13], [0.92, 0.7, 0.13], 0.018), M.metal("#d6b16a")),
        fold(-0.78, 1),
        fold(0.78, -1),
      ]);
    },
  },
  {
    id: "wall-clock", name: "Wall Clock", series: "basic", category: "wall", kind: "wall", size: [1, 1], hang: 2.5,
    variants: [{ name: "Natural Wood", swatch: "#c9935d" }, { name: "White", swatch: "#f7f3ea" }, { name: "Yellow", swatch: "#f2c64f" }],
    build(v) {
      const rim = [M.wood("#c9935d"), M.gloss("#f7f3ea"), M.gloss("#f2c64f")][v] ?? M.wood("#c9935d");
      const face = M.printed("wallclock", clockFace("wall", "#fffaf0", "#5a4636"));
      const hand = M.paint("#3b2e26");
      return K.group([
        K.part(K.puck(0.38, 0.08, 0.03, 48), rim, { p: [0, 0, 0.0], r: [Math.PI / 2, 0, 0] }),
        K.part(K.planarUV(new THREE.CircleGeometry(0.32, 48), 0.64, 0.64), face, { p: [0, 0, 0.082] }),
        K.part(K.rbox(0.03, 0.2, 0.01, 0.005), hand, { p: [0.03, 0.08, 0.09], r: [0, 0, -0.4] }),
        K.part(K.rbox(0.025, 0.27, 0.01, 0.005), hand, { p: [-0.1, -0.06, 0.094], r: [0, 0, 1.0] }),
        K.part(new THREE.SphereGeometry(0.025, 12, 8), M.metal("#d6b16a"), { p: [0, 0, 0.1] }),
      ]);
    },
  },
  {
    id: "poster-island", name: "Island Poster", series: "basic", category: "wall", kind: "wall", size: [1, 1.5], hang: 1.75,
    variants: [{ name: "Island", swatch: "#7ccaf6" }, { name: "Starry Night", swatch: "#2f3a73" }, { name: "Sakura", swatch: "#f6c1d0" }],
    build(v) {
      const draws = [
        (g: CanvasRenderingContext2D, w: number, h: number) => {
          const sky = g.createLinearGradient(0, 0, 0, h);
          sky.addColorStop(0, "#7ccaf6"); sky.addColorStop(0.6, "#d7f1ff"); sky.addColorStop(0.6, "#4fb3d9"); sky.addColorStop(1, "#2f8fc0");
          g.fillStyle = sky; g.fillRect(0, 0, w, h);
          g.fillStyle = "#f6e3a8"; g.beginPath(); g.ellipse(w / 2, h * 0.66, w * 0.36, h * 0.07, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#6cbf5a"; g.beginPath(); g.ellipse(w / 2, h * 0.6, w * 0.26, h * 0.08, 0, Math.PI, 0); g.fill();
          g.fillStyle = "#fff3b0"; g.beginPath(); g.arc(w * 0.75, h * 0.18, w * 0.1, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#ffffff"; g.font = `bold ${w * 0.13}px "Baloo 2", sans-serif`; g.textAlign = "center"; g.fillText("ISLAND", w / 2, h * 0.9);
        },
        (g: CanvasRenderingContext2D, w: number, h: number) => {
          g.fillStyle = "#26306a"; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 30; i++) { g.fillStyle = "#fff6cf"; star(g, (i * 71) % w, (i * 113) % (h * 0.7), 3 + (i % 3) * 2); g.fill(); }
          g.fillStyle = "#ffe48a"; g.beginPath(); g.arc(w * 0.5, h * 0.4, w * 0.22, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#26306a"; g.beginPath(); g.arc(w * 0.6, h * 0.35, w * 0.2, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#3e4a8c"; g.fillRect(0, h * 0.8, w, h * 0.2);
        },
        (g: CanvasRenderingContext2D, w: number, h: number) => {
          g.fillStyle = "#fde7ee"; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 9; i++) {
            const x = (i * 97) % w, y = (i * 61) % h;
            g.fillStyle = "#f4a3bb";
            for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 11, 8, a, 0, Math.PI * 2); g.fill(); }
            g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
          }
          roundRect(g, w * 0.15, h * 0.78, w * 0.7, h * 0.12, 12); g.fillStyle = "#ffffffcc"; g.fill();
          g.fillStyle = "#d9728f"; g.font = `bold ${w * 0.1}px "Baloo 2", sans-serif`; g.textAlign = "center"; g.fillText("SAKURA", w / 2, h * 0.865);
        },
      ];
      return framed(`poster:${v}`, 0.9, 1.3, M.wood("#a8774c"), draws[v] ?? draws[0]!, 0.05, 0.04);
    },
  },

  // ---------- Ceiling ----------
  {
    id: "pendant-lamp", name: "Pendant Lamp", series: "basic", category: "ceiling", kind: "ceiling", size: [1, 1],
    variants: [{ name: "Milk White", swatch: "#f7efe0" }, { name: "Rattan", swatch: "#d6ae78" }, { name: "Green", swatch: "#86c09a" }],
    light: { at: [0, -0.62, 0], color: "#ffd8a0", intensity: 5, distance: 5.5, halo: 1.3, startsOn: true },
    build(v) {
      const cord = K.part(K.rod([0, 0, 0], [0, -0.40, 0], 0.012, 8), M.paint("#3d3029"));
      const parts: THREE.Object3D[] = [cord, K.part(K.puck(0.1, 0.04, 0.015), M.paint("#f2ece2"), { p: [0, -0.04, 0] })];
      const profile: Array<[number, number]> = [[0.34, -0.69], [0.34, -0.65], [0.3, -0.55], [0.18, -0.45], [0.05, -0.41], [0, -0.40]];
      if (v === 1) parts.push(dome(profile, "#d6ae78", "#ffe2a8", 0.9, M.rattan("#d6ae78")));
      else parts.push(dome(profile, v === 0 ? "#f7efe0" : "#86c09a", "#ffe2a8", 0.9));
      parts.push(bulb([0, -0.59, 0], 0.08));
      return K.group(parts);
    },
  },
];

export { book };
