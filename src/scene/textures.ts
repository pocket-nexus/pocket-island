// Procedural textures drawn on canvases: grain, weave, the floor and wall
// finishes, labels. Everything is seeded, so a texture looks the same on
// every load.

import * as THREE from "three";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise with period `period` cells. */
export function valueNoise(seed: number, period: number): (x: number, y: number) => number {
  const r = rng(seed);
  const grid = Array.from({ length: period * period }, () => r());
  const at = (i: number, j: number) => grid[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = fade(x - i), fy = fade(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Fractal noise, tileable over [0,1)² when sampled at u*period. */
export function fbm(seed: number, period: number, octaves = 4): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => valueNoise(seed + o * 101, period << o));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    layers.forEach((noise, o) => {
      const f = period << o;
      sum += noise(u * f, v * f) * amp;
      norm += amp;
      amp *= 0.5;
    });
    return sum / norm;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: false })!];
}

/** Fill a canvas pixel by pixel; `f` returns [r, g, b] in 0..255. */
export function paint(w: number, h: number, f: (u: number, v: number, x: number, y: number) => [number, number, number]): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, gg, b] = f(x / w, y / h, x, y);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function toTexture(source: HTMLCanvasElement, opts: { color?: boolean; repeat?: [number, number] } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = opts.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (opts.repeat) t.repeat.set(...opts.repeat);
  t.needsUpdate = true;
  return t;
}

export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(a: RGB, k: number): RGB {
  return [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];
}

const cache = new Map<string, THREE.Texture>();

export function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    // The key names the picture for the 3DS export (src/export/export.ts).
    if (!t.name) t.name = key;
    cache.set(key, t);
  }
  return t;
}

/** Light wood grain running along U, near white so a material colour tints it. */
export function grainTexture(kind: "fine" | "bold" = "fine"): THREE.Texture {
  return cached("grain:" + kind, () => {
    const tone = fbm(7 + (kind === "bold" ? 3 : 0), 2, 4);
    const streaks = fbm(19, 32, 3);
    const warp = fbm(23, 4, 3);
    const c = paint(512, 512, (u, v) => {
      // Long thin streaks along U, gently wavy, over a slow change of tone.
      const w = warp(u, v) * 0.08;
      const s = streaks(u * 0.0625 + 0.5, v + w);
      const line = Math.pow(Math.abs(Math.sin((v + w) * Math.PI * (kind === "bold" ? 18 : 26))), 18);
      const k = 0.93 + 0.05 * (tone(u, v) - 0.5) - 0.05 * (s - 0.5) - (kind === "bold" ? 0.06 : 0.035) * line;
      const g = Math.round(255 * Math.min(1, k));
      return [g, Math.round(g * 0.99), Math.round(g * 0.97)];
    });
    return toTexture(c);
  });
}

/** A soft mottle for painted and plastic surfaces. */
export function mottleTexture(): THREE.Texture {
  return cached("mottle", () => {
    const n = fbm(41, 6, 4);
    const c = paint(256, 256, (u, v) => {
      const g = Math.round(255 * (0.93 + 0.07 * n(u, v)));
      return [g, g, g];
    });
    return toTexture(c);
  });
}

/** Woven cloth as a height map. */
export function weaveBump(): THREE.Texture {
  return cached("weave", () => {
    const n = fbm(5, 8, 3);
    const c = paint(256, 256, (u, v, x, y) => {
      const a = Math.sin((x / 256) * Math.PI * 2 * 48);
      const b = Math.sin((y / 256) * Math.PI * 2 * 48);
      const over = ((Math.floor(x / (256 / 48)) + Math.floor(y / (256 / 48))) % 2) ? a : b;
      const g = Math.round(255 * (0.5 + 0.28 * over + 0.2 * (n(u, v) - 0.5)));
      return [g, g, g];
    });
    return toTexture(c, { color: false });
  });
}

/** Fluffy pile for rugs and plush. */
export function pileBump(): THREE.Texture {
  return cached("pile", () => {
    const n = fbm(77, 32, 3);
    const c = paint(256, 256, (u, v) => {
      const g = Math.round(255 * n(u, v));
      return [g, g, g];
    });
    return toTexture(c, { color: false });
  });
}

/** Rattan weave, as a colour multiplier with its own height. */
export function rattanTexture(): { map: THREE.Texture; bump: THREE.Texture } {
  const map = cached("rattan", () => {
    const c = paint(256, 256, (_u, _v, x, y) => {
      const cell = 32;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const fx = (x % cell) / cell, fy = (y % cell) / cell;
      const horizontal = (cx + cy) % 2 === 0;
      const f = horizontal ? fy : fx;
      const strand = Math.sin(f * Math.PI * 3) ** 2;
      const k = 0.74 + 0.26 * strand;
      const g = Math.round(255 * k);
      return [g, Math.round(g * 0.97), Math.round(g * 0.9)];
    });
    return toTexture(c);
  });
  const bump = cached("rattan:bump", () => {
    const c = paint(256, 256, (_u, _v, x, y) => {
      const cell = 32;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const fx = (x % cell) / cell, fy = (y % cell) / cell;
      const horizontal = (cx + cy) % 2 === 0;
      const f = horizontal ? fy : fx;
      const along = horizontal ? fx : fy;
      const g = Math.round(255 * (Math.sin(f * Math.PI * 3) ** 2 * (0.6 + 0.4 * Math.sin(along * Math.PI))));
      return [g, g, g];
    });
    return toTexture(c, { color: false });
  });
  return { map, bump };
}

/** A label, poster or screen drawn with the 2D canvas API. */
export function drawn(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  return cached("drawn:" + key, () => {
    const [c, g] = canvas(w, h);
    draw(g, w, h);
    const t = toTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = 0.45): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s, y - s * 0.35, x, y + s * 0.35);
  g.closePath();
}

export function flower(g: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, centre: string, petals = 5): void {
  g.fillStyle = petal;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = centre;
  g.beginPath();
  g.arc(x, y, r * 0.3, 0, Math.PI * 2);
  g.fill();
}
