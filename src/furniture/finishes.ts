// Wallpapers and floorings. Each is drawn on a canvas: a wallpaper's canvas
// is one tile wide and the wall's height tall (its top is the wall's top);
// a flooring's covers `span` tiles. Patterns wrap at the canvas edge.

import { WALL_HEIGHT } from "../core/rules.ts";
import { fbm, flower, heart, rng, roundRect, star } from "../scene/textures.ts";
import type { FinishDef } from "./types.ts";

type G = CanvasRenderingContext2D;

/** Draw `f` at x and at its wrapped copies, so a pattern tiles across. */
function wrap(w: number, x: number, f: (x: number) => void): void {
  f(x);
  f(x - w);
  f(x + w);
}

function noiseFill(g: G, w: number, h: number, seed: number, base: [number, number, number], amount: number, period = 6): void {
  const n = fbm(seed, period, 4);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 1 + amount * (n(x / w, y / h) - 0.5);
      const i = (y * w + x) * 4;
      img.data[i] = base[0] * k;
      img.data[i + 1] = base[1] * k;
      img.data[i + 2] = base[2] * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function rgb(c: string): [number, number, number] {
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function shadeHex(c: string, k: number): string {
  const [r, g, b] = rgb(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Wood planks running across the canvas, joints staggered. */
function planks(g: G, w: number, h: number, rows: number, tones: string[], seed: number, seam = "#00000055"): void {
  const r = rng(seed);
  const n = fbm(seed + 3, 3, 4);
  const ph = h / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * w * 0.6;
    while (x < w) {
      const len = w * (0.45 + r() * 0.5);
      const tone = tones[Math.floor(r() * tones.length)]!;
      const k = 0.95 + r() * 0.09;
      g.fillStyle = shadeHex(tone, k);
      wrap(w, x, (xx) => g.fillRect(xx, row * ph, len, ph));
      // grain
      g.save();
      g.globalAlpha = 0.09;
      g.strokeStyle = shadeHex(tone, 0.62);
      g.lineWidth = Math.max(1, ph * 0.035);
      for (let l = 0; l < 5; l++) {
        const y0 = row * ph + ph * (0.15 + 0.7 * r());
        g.beginPath();
        for (let s = 0; s <= 24; s++) {
          const px = x + (len * s) / 24;
          const py = y0 + Math.sin(s * 0.7 + l * 2 + r()) * ph * 0.05 + (n(px / w, y0 / h) - 0.5) * ph * 0.3;
          if (s === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        wrap(w, 0, () => g.stroke());
      }
      g.restore();
      // end joint
      g.fillStyle = seam;
      wrap(w, x, (xx) => g.fillRect(xx, row * ph, Math.max(1.5, w * 0.004), ph));
      x += len;
    }
    g.fillStyle = seam;
    g.fillRect(0, row * ph, w, Math.max(1.5, h * 0.004));
  }
}

function plankBump(g: G, w: number, h: number, rows: number, seed: number): void {
  const r = rng(seed);
  g.fillStyle = "#c8c8c8";
  g.fillRect(0, 0, w, h);
  const ph = h / rows;
  for (let row = 0; row < rows; row++) {
    const grad = g.createLinearGradient(0, row * ph, 0, row * ph + ph);
    grad.addColorStop(0, "#9a9a9a");
    grad.addColorStop(0.06, "#d8d8d8");
    grad.addColorStop(0.94, "#d0d0d0");
    grad.addColorStop(1, "#8a8a8a");
    g.fillStyle = grad;
    g.fillRect(0, row * ph, w, ph);
    let x = -r() * w * 0.6;
    while (x < w) {
      const len = w * (0.45 + r() * 0.5);
      r(); r();
      g.fillStyle = "#606060";
      wrap(w, x, (xx) => g.fillRect(xx, row * ph, Math.max(1.5, w * 0.004), ph));
      x += len;
    }
    g.fillStyle = "#505050";
    g.fillRect(0, row * ph, w, Math.max(1.5, h * 0.004));
  }
}

function grid(g: G, w: number, h: number, cols: number, rows: number, line: string, width: number): void {
  g.fillStyle = line;
  for (let i = 0; i <= cols; i++) g.fillRect((i * w) / cols - width / 2, 0, width, h);
  for (let j = 0; j <= rows; j++) g.fillRect(0, (j * h) / rows - width / 2, w, width);
}

/** The lower part of a wall: wooden wainscot panels with a rail. `top` is the rail's height in tiles. */
function wainscot(g: G, w: number, h: number, top: number, tone: string, rail: string): void {
  const px = h / WALL_HEIGHT;
  const y0 = h - top * px;
  g.fillStyle = tone;
  g.fillRect(0, y0, w, h - y0);
  const pad = w * 0.09;
  roundRect(g, pad, y0 + px * 0.16, w - pad * 2, top * px - px * 0.34, w * 0.04);
  g.strokeStyle = shadeHex(tone.startsWith("#") ? tone : "#ffffff", 0.82);
  g.lineWidth = w * 0.025;
  g.stroke();
  g.fillStyle = rail;
  g.fillRect(0, y0 - px * 0.06, w, px * 0.1);
  g.fillStyle = "#ffffff55";
  g.fillRect(0, y0 - px * 0.06, w, px * 0.025);
}

function wainscotBump(g: G, w: number, h: number, top: number): void {
  const px = h / WALL_HEIGHT;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, w, h);
  const y0 = h - top * px;
  g.fillStyle = "#a0a0a0";
  g.fillRect(0, y0, w, h - y0);
  const pad = w * 0.09;
  roundRect(g, pad, y0 + px * 0.16, w - pad * 2, top * px - px * 0.34, w * 0.04);
  g.strokeStyle = "#606060";
  g.lineWidth = w * 0.03;
  g.stroke();
  g.fillStyle = "#e0e0e0";
  g.fillRect(0, y0 - px * 0.06, w, px * 0.1);
}

export const FINISHES: FinishDef[] = [
  // ---------- Wallpapers ----------
  {
    id: "cream-wainscot", kind: "wallpaper", name: "Cream Wainscot", series: "wooden", swatch: "#f3e6c8", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#a7744a", cap: "#6e4a32", bumpScale: 1.2,
    draw(g, w, h) {
      noiseFill(g, w, h, 11, rgb("#f6ead0"), 0.06, 8);
      wainscot(g, w, h, 1.0, "#d8a774", "#b98455");
    },
    bump(g, w, h) { wainscotBump(g, w, h, 1.0); },
  },
  {
    id: "log-wall", kind: "wallpaper", name: "Log Wall", series: "wooden", swatch: "#c48a52", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.75, skirting: "#7a4e2c", cap: "#5d3b22", bumpScale: 3,
    draw(g, w, h) {
      const logs = 10;
      const lh = h / logs;
      const r = rng(5);
      for (let i = 0; i < logs; i++) {
        const tone = ["#c98d55", "#bd8049", "#d39a62"][i % 3]!;
        const grad = g.createLinearGradient(0, i * lh, 0, i * lh + lh);
        grad.addColorStop(0, shadeHex(tone, 0.72));
        grad.addColorStop(0.25, shadeHex(tone, 1.04));
        grad.addColorStop(0.6, tone);
        grad.addColorStop(1, shadeHex(tone, 0.6));
        g.fillStyle = grad;
        g.fillRect(0, i * lh, w, lh);
        g.globalAlpha = 0.18;
        g.strokeStyle = shadeHex(tone, 0.55);
        for (let l = 0; l < 4; l++) {
          const y = i * lh + lh * (0.25 + 0.5 * r());
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(w * 0.3, y + lh * 0.08, w * 0.7, y - lh * 0.08, w, y);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    },
    bump(g, w, h) {
      const logs = 10, lh = h / logs;
      for (let i = 0; i < logs; i++) {
        const grad = g.createLinearGradient(0, i * lh, 0, i * lh + lh);
        grad.addColorStop(0, "#202020");
        grad.addColorStop(0.35, "#e0e0e0");
        grad.addColorStop(0.65, "#e0e0e0");
        grad.addColorStop(1, "#202020");
        g.fillStyle = grad;
        g.fillRect(0, i * lh, w, lh);
      }
    },
  },
  {
    id: "pink-polka", kind: "wallpaper", name: "Pink Polka Dots", series: "cute", swatch: "#f7c6d3", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#ffffff", cap: "#c66f8a",
    draw(g, w, h) {
      noiseFill(g, w, h, 21, rgb("#f8cdd8"), 0.05, 8);
      const step = w / 2;
      g.fillStyle = "#fff4f6";
      for (let row = 0; row * step < h + step; row++) {
        for (let col = 0; col < 2; col++) {
          const x = col * step + (row % 2 ? step / 2 : 0) + step / 4;
          const y = row * step * 0.9 + step / 4;
          wrap(w, x, (xx) => { g.beginPath(); g.arc(xx, y, w * 0.065, 0, Math.PI * 2); g.fill(); });
        }
      }
      wainscot(g, w, h, 0.85, "#fffaf7", "#f2b2c2");
    },
    bump(g, w, h) { wainscotBump(g, w, h, 0.85); },
    bumpScale: 1,
  },
  {
    id: "floral", kind: "wallpaper", name: "Floral Wallpaper", series: "cute", swatch: "#fdf1e2", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#e9a0a8", cap: "#a8646d",
    draw(g, w, h) {
      noiseFill(g, w, h, 31, rgb("#fdf3e4"), 0.05, 8);
      const r = rng(9);
      const colors = ["#f49aa9", "#f7c35f", "#9fc6ee", "#f4b0c8"];
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h;
        const c = colors[i % colors.length]!;
        wrap(w, x, (xx) => {
          g.strokeStyle = "#8fbf7a";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(xx, y);
          g.quadraticCurveTo(xx + w * 0.05, y + w * 0.06, xx + w * 0.02, y + w * 0.11);
          g.stroke();
          flower(g, xx, y, w * 0.055, c, "#fff3b8");
        });
      }
    },
  },
  {
    id: "mint-stripe", kind: "wallpaper", name: "Mint Stripes", series: "nordic", swatch: "#bfe6d6", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#ffffff", cap: "#4f8f7c",
    draw(g, w, h) {
      noiseFill(g, w, h, 41, rgb("#f4fbf6"), 0.04, 8);
      g.fillStyle = "#bfe6d5";
      for (let i = 0; i < 4; i++) g.fillRect((i * w) / 4, 0, w / 8, h);
      g.fillStyle = "#a9dcc6";
      for (let i = 0; i < 4; i++) g.fillRect((i * w) / 4 + w / 8 - 2, 0, 2, h);
    },
  },
  {
    id: "white-plaster", kind: "wallpaper", name: "White Plaster", series: "nordic", swatch: "#f6f1e7", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.9, skirting: "#e2d6c2", cap: "#9b8c78", bumpScale: 0.6,
    draw(g, w, h) {
      noiseFill(g, w, h, 51, rgb("#f7f2e8"), 0.07, 5);
    },
    bump(g, w, h) {
      noiseFill(g, w, h, 52, [128, 128, 128], 0.5, 24);
    },
  },
  {
    id: "shoji", kind: "wallpaper", name: "Shoji Wall", series: "japanese", swatch: "#efe6cf", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#6b4a2e", cap: "#4b3322", bumpScale: 1.5,
    draw(g, w, h) {
      const px = h / WALL_HEIGHT;
      noiseFill(g, w, h, 61, rgb("#f4ecd8"), 0.05, 10);
      const frame = "#a0784e";
      g.fillStyle = frame;
      const cols = 3, rows = 7;
      const top = h - px * 0.9;
      for (let i = 0; i <= cols; i++) g.fillRect((i * w) / cols - 3, 0, 6, top);
      for (let j = 0; j <= rows; j++) g.fillRect(0, (j * top) / rows - 3, w, 6);
      g.fillStyle = "#8a6440";
      g.fillRect(0, 0, w, px * 0.12);
      // Lower wooden panel.
      g.fillStyle = "#b88a5c";
      g.fillRect(0, top, w, h - top);
      g.fillStyle = "#8a6440";
      g.fillRect(0, top, w, px * 0.08);
      g.fillRect(w / 2 - 2, top, 4, h - top);
    },
    bump(g, w, h) {
      const px = h / WALL_HEIGHT;
      g.fillStyle = "#707070";
      g.fillRect(0, 0, w, h);
      const top = h - px * 0.9;
      g.fillStyle = "#e0e0e0";
      const cols = 3, rows = 7;
      for (let i = 0; i <= cols; i++) g.fillRect((i * w) / cols - 3, 0, 6, top);
      for (let j = 0; j <= rows; j++) g.fillRect(0, (j * top) / rows - 3, w, 6);
      g.fillStyle = "#b0b0b0";
      g.fillRect(0, top, w, h - top);
    },
  },
  {
    id: "starry-wall", kind: "wallpaper", name: "Starry Wallpaper", series: "starry", swatch: "#2f3a73", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.8, skirting: "#232a57", cap: "#1b2048",
    draw(g, w, h) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#232b63");
      grad.addColorStop(0.6, "#3a4686");
      grad.addColorStop(1, "#5a5b9e");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(17);
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y = r() * h;
        g.fillStyle = `rgba(255,255,240,${0.3 + r() * 0.5})`;
        wrap(w, x, (xx) => { g.beginPath(); g.arc(xx, y, 1 + r() * 1.6, 0, Math.PI * 2); g.fill(); });
      }
      for (let i = 0; i < 6; i++) {
        const x = r() * w, y = r() * h * 0.85;
        g.fillStyle = i % 2 ? "#ffe89a" : "#fff6cf";
        wrap(w, x, (xx) => { star(g, xx, y, w * (0.035 + r() * 0.03)); g.fill(); });
      }
    },
  },
  {
    id: "sky-wall", kind: "wallpaper", name: "Blue Sky", series: "basic", swatch: "#a9d8f5", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#ffffff", cap: "#4f86ad",
    draw(g, w, h) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#7cc3ef");
      grad.addColorStop(1, "#cfeefd");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(3);
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const x = r() * w, y = h * (0.1 + 0.18 * i) + r() * 20;
        const s = w * (0.1 + r() * 0.05);
        wrap(w, x, (xx) => {
          g.beginPath();
          g.ellipse(xx, y, s * 1.8, s * 0.7, 0, 0, Math.PI * 2);
          g.ellipse(xx - s * 0.8, y + s * 0.1, s, s * 0.6, 0, 0, Math.PI * 2);
          g.ellipse(xx + s * 0.4, y - s * 0.45, s * 0.9, s * 0.8, 0, 0, Math.PI * 2);
          g.fill();
        });
      }
    },
  },
  {
    id: "brick", kind: "wallpaper", name: "Red Brick", series: "basic", swatch: "#b6604a", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.92, skirting: "#5a3b2c", cap: "#5a3328", bumpScale: 2.5,
    draw(g, w, h) {
      g.fillStyle = "#e3d2bd";
      g.fillRect(0, 0, w, h);
      const rows = 14, bh = h / rows, bw = w / 2;
      const r = rng(8);
      for (let i = 0; i < rows; i++) {
        for (let j = -1; j < 3; j++) {
          const x = j * bw + (i % 2 ? bw / 2 : 0);
          const tone = ["#b85f47", "#a9533f", "#c46c50", "#9e4c3a"][Math.floor(r() * 4)]!;
          g.fillStyle = tone;
          roundRect(g, x + 3, i * bh + 3, bw - 6, bh - 6, 4);
          g.fill();
        }
      }
    },
    bump(g, w, h) {
      g.fillStyle = "#303030";
      g.fillRect(0, 0, w, h);
      const rows = 14, bh = h / rows, bw = w / 2;
      g.fillStyle = "#d0d0d0";
      for (let i = 0; i < rows; i++) {
        for (let j = -1; j < 3; j++) {
          const x = j * bw + (i % 2 ? bw / 2 : 0);
          roundRect(g, x + 3, i * bh + 3, bw - 6, bh - 6, 4);
          g.fill();
        }
      }
    },
  },
  {
    id: "palm-wall", kind: "wallpaper", name: "Palm-Leaf Wallpaper", series: "rattan", swatch: "#d9efe6", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.85, skirting: "#c79a62", cap: "#5f8c74",
    draw(g, w, h) {
      noiseFill(g, w, h, 71, rgb("#e6f4ec"), 0.05, 8);
      const r = rng(23);
      for (let i = 0; i < 7; i++) {
        const x = r() * w, y = r() * h;
        const a = r() * Math.PI * 2;
        const s = w * (0.22 + r() * 0.1);
        wrap(w, x, (xx) => {
          g.save();
          g.translate(xx, y);
          g.rotate(a);
          g.fillStyle = i % 2 ? "#9fd0b6" : "#b8dfc8";
          for (let k = -5; k <= 5; k++) {
            g.save();
            g.rotate(k * 0.16);
            g.beginPath();
            g.ellipse(0, -s * 0.55, s * 0.07, s * 0.5, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
          g.restore();
        });
      }
    },
  },
  {
    id: "gingham", kind: "wallpaper", name: "Yellow Gingham", series: "basic", swatch: "#f8e3a6", span: [1, WALL_HEIGHT], density: 256,
    roughness: 0.88, skirting: "#ffffff", cap: "#b48a3e",
    draw(g, w, h) {
      g.fillStyle = "#fff8e6";
      g.fillRect(0, 0, w, h);
      const n = 4, s = w / n;
      g.fillStyle = "rgba(245, 200, 95, 0.45)";
      for (let i = 0; i < n; i += 1) g.fillRect(i * s, 0, s / 2, h);
      for (let j = 0; j * s < h; j++) g.fillRect(0, j * s, w, s / 2);
    },
  },

  // ---------- Floorings ----------
  {
    id: "oak-planks", kind: "flooring", name: "Oak Planks", series: "wooden", swatch: "#d39b62", span: [2, 2], density: 320,
    roughness: 0.62, bumpScale: 2.2,
    draw(g, w, h) { planks(g, w, h, 6, ["#e0ae76", "#d9a56c", "#e5b783", "#dba870"], 101, "#00000048"); },
    bump(g, w, h) { plankBump(g, w, h, 6, 101); },
  },
  {
    id: "dark-planks", kind: "flooring", name: "Walnut Planks", series: "basic", swatch: "#8a5a3a", span: [2, 2], density: 320,
    roughness: 0.55, bumpScale: 2.2,
    draw(g, w, h) { planks(g, w, h, 6, ["#8e5d3c", "#7f5234", "#966644", "#845838"], 202, "#00000077"); },
    bump(g, w, h) { plankBump(g, w, h, 6, 202); },
  },
  {
    id: "white-planks", kind: "flooring", name: "White Oak Planks", series: "nordic", swatch: "#eadbc4", span: [2, 2], density: 320,
    roughness: 0.62, bumpScale: 2,
    draw(g, w, h) { planks(g, w, h, 6, ["#efe1cb", "#e8d7bd", "#f2e7d4", "#e4d2b6"], 303, "#00000030"); },
    bump(g, w, h) { plankBump(g, w, h, 6, 303); },
  },
  {
    id: "parquet", kind: "flooring", name: "Parquet", series: "nordic", swatch: "#c99a66", span: [2, 2], density: 320,
    roughness: 0.55, bumpScale: 1.5,
    draw(g, w, h) {
      const n = 4, s = w / n, strips = 3;
      const r = rng(55);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const vertical = (i + j) % 2 === 0;
          for (let k = 0; k < strips; k++) {
            const tone = ["#cf9f6a", "#c4925d", "#d6a974", "#bf8b57"][Math.floor(r() * 4)]!;
            g.fillStyle = tone;
            if (vertical) g.fillRect(i * s + (k * s) / strips, j * s, s / strips, s);
            else g.fillRect(i * s, j * s + (k * s) / strips, s, s / strips);
            g.fillStyle = "#00000030";
            if (vertical) g.fillRect(i * s + (k * s) / strips, j * s, 1.5, s);
            else g.fillRect(i * s, j * s + (k * s) / strips, s, 1.5);
          }
        }
      }
      grid(g, w, h, n, n, "#00000040", 2);
    },
    bump(g, w, h) {
      g.fillStyle = "#c0c0c0";
      g.fillRect(0, 0, w, h);
      grid(g, w, h, 4, 4, "#404040", 3);
      grid(g, w, h, 12, 12, "#8a8a8a", 1);
    },
  },
  {
    id: "mint-checker", kind: "flooring", name: "Mint Checker Tiles", series: "basic", swatch: "#a8dcc8", span: [2, 2], density: 320,
    roughness: 0.35, bumpScale: 1.2,
    draw(g, w, h) {
      const n = 4, s = w / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? "#fbf6ea" : "#9fd6c0";
          g.fillRect(i * s, j * s, s, s);
        }
      }
      grid(g, w, h, n, n, "#e8e0cf", 4);
    },
    bump(g, w, h) {
      g.fillStyle = "#d0d0d0";
      g.fillRect(0, 0, w, h);
      grid(g, w, h, 4, 4, "#404040", 5);
    },
  },
  {
    id: "pink-tile", kind: "flooring", name: "Sakura Pink Tiles", series: "cute", swatch: "#f6c9d3", span: [2, 2], density: 320,
    roughness: 0.3, bumpScale: 1.2,
    draw(g, w, h) {
      const n = 4, s = w / n;
      const r = rng(66);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? "#fbdde4" : "#f6c6d1";
          g.fillRect(i * s, j * s, s, s);
          if ((i + j) % 2) {
            g.fillStyle = "#ffffffaa";
            heart(g, i * s + s / 2, j * s + s / 2 + s * 0.06, s * 0.16 + r() * 0.001);
            g.fill();
          }
        }
      }
      grid(g, w, h, n, n, "#fff4f4", 4);
    },
    bump(g, w, h) {
      g.fillStyle = "#d0d0d0";
      g.fillRect(0, 0, w, h);
      grid(g, w, h, 4, 4, "#404040", 5);
    },
  },
  {
    id: "pink-carpet", kind: "flooring", name: "Pink Plush Carpet", series: "cute", swatch: "#f2b8c6", span: [2, 2], density: 256,
    roughness: 0.95, bumpScale: 1.5,
    draw(g, w, h) { noiseFill(g, w, h, 81, rgb("#f3bccb"), 0.12, 16); },
    bump(g, w, h) { noiseFill(g, w, h, 82, [128, 128, 128], 0.9, 64); },
  },
  {
    id: "tatami", kind: "flooring", name: "Tatami", series: "japanese", swatch: "#c9c98a", span: [2, 2], density: 320,
    roughness: 0.8, bumpScale: 2,
    draw(g, w, h) {
      const rows = 2, mh = h / rows;
      for (let row = 0; row < rows; row++) {
        const offset = row % 2 ? w / 2 : 0;
        for (let k = -1; k < 1; k++) {
          const x = offset + k * w;
          g.fillStyle = "#cfcf91";
          g.fillRect(x, row * mh, w, mh);
          g.strokeStyle = "#b5b574";
          g.lineWidth = 1.2;
          for (let l = 0; l < 64; l++) {
            const xx = x + (l * w) / 64;
            g.beginPath();
            g.moveTo(xx, row * mh);
            g.lineTo(xx, row * mh + mh);
            g.stroke();
          }
          g.fillStyle = "#4c6a43";
          g.fillRect(x, row * mh, w, mh * 0.06);
          g.fillRect(x, row * mh + mh * 0.94, w, mh * 0.06);
          g.fillStyle = "#00000040";
          g.fillRect(x, row * mh, 2, mh);
        }
      }
    },
    bump(g, w, h) {
      g.fillStyle = "#b0b0b0";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#909090";
      for (let l = 0; l < 128; l++) g.fillRect((l * w) / 128, 0, 1, h);
      const mh = h / 2;
      g.fillStyle = "#e0e0e0";
      for (let row = 0; row < 2; row++) {
        g.fillRect(0, row * mh, w, mh * 0.06);
        g.fillRect(0, row * mh + mh * 0.94, w, mh * 0.06);
      }
    },
  },
  {
    id: "terracotta", kind: "flooring", name: "Terracotta Tiles", series: "rattan", swatch: "#d88a5f", span: [2, 2], density: 320,
    roughness: 0.75, bumpScale: 1.8,
    draw(g, w, h) {
      g.fillStyle = "#efe2cf";
      g.fillRect(0, 0, w, h);
      const n = 2, s = w / n;
      const r = rng(91);
      const noise = fbm(92, 4, 4);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const tone = ["#dd9b75", "#d6916b", "#e3a780", "#d18c66"][Math.floor(r() * 4)]!;
          g.fillStyle = tone;
          roundRect(g, i * s + 4, j * s + 4, s - 8, s - 8, 8);
          g.fill();
        }
      }
      const img = g.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = 0.92 + 0.16 * noise(x / w, y / h);
        const i = (y * w + x) * 4;
        img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
      }
      g.putImageData(img, 0, 0);
    },
    bump(g, w, h) {
      g.fillStyle = "#303030";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#d0d0d0";
      const s = w / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { roundRect(g, i * s + 4, j * s + 4, s - 8, s - 8, 8); g.fill(); }
    },
  },
  {
    id: "starry-carpet", kind: "flooring", name: "Starry Carpet", series: "starry", swatch: "#2b3266", span: [2, 2], density: 256,
    roughness: 0.95, bumpScale: 1.2,
    draw(g, w, h) {
      noiseFill(g, w, h, 111, rgb("#2d3569"), 0.18, 8);
      const r = rng(112);
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h;
        g.fillStyle = i % 3 ? "rgba(255,240,180,0.85)" : "#fff8dd";
        wrap(w, x, (xx) => { star(g, xx, y, 4 + r() * 6); g.fill(); });
      }
    },
    bump(g, w, h) { noiseFill(g, w, h, 113, [128, 128, 128], 0.9, 64); },
  },
  {
    id: "grass", kind: "flooring", name: "Grass Floor", series: "basic", swatch: "#8cc56a", span: [2, 2], density: 256,
    roughness: 0.9, bumpScale: 2,
    draw(g, w, h) {
      noiseFill(g, w, h, 121, rgb("#8fc76b"), 0.22, 6);
      const r = rng(122);
      for (let i = 0; i < 900; i++) {
        const x = r() * w, y = r() * h;
        g.strokeStyle = r() > 0.5 ? "#a6d97f" : "#78b25a";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 4, y - 5 - r() * 5);
        g.stroke();
      }
      for (let i = 0; i < 10; i++) flower(g, r() * w, r() * h, 5, "#ffffff", "#ffd75e");
    },
    bump(g, w, h) { noiseFill(g, w, h, 123, [128, 128, 128], 0.9, 48); },
  },
];

export const finishById = new Map(FINISHES.map((f) => [f.id, f]));
