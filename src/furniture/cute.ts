// Cute series: white lacquer and pastel cloth, hearts, scallops and frills — a
// little princess room. Most pieces come in the same four pastels.

import * as THREE from "three";
import { K, M, bulb, cushion, dome } from "./common.ts";
import { drawn, heart } from "../scene/textures.ts";
import type { FurnitureDef } from "./types.ts";

type V3 = K.V3;
type P2 = [number, number];

const TONES = [
  { name: "Strawberry", swatch: "#f5adc2", main: "#f5b0c5", deep: "#ec88a7", light: "#fde4ec" },
  { name: "Lavender", swatch: "#c8b5ee", main: "#cbb8ef", deep: "#a68bdb", light: "#efe8fc" },
  { name: "Mint Green", swatch: "#a5dec9", main: "#a8dfca", deep: "#6fc2a4", light: "#e2f5ed" },
  { name: "Butter Yellow", swatch: "#f6da92", main: "#f6da94", deep: "#eab55a", light: "#fdf3d7" },
];
const variants = TONES.map(({ name, swatch }) => ({ name, swatch }));
const T = (v: number) => TONES[v] ?? TONES[0]!;

const white = () => M.gloss("#fff8f2", 0.32);
const gold = () => M.metal("#e9c582", 0.3);
const sheet = () => M.fabric("#fffaf5", 0.5);

// ---------- Shapes ----------

/** A chubby heart `w` wide (0.8 w tall), centred on (cx, cy), in the XY plane. */
function heartShape(w: number, cx = 0, cy = 0): THREE.Shape {
  const r = w / 3.6, d = r * 0.8, p = r * 1.85;
  const oy = cy - (r - p) / 2;
  const tR = Math.atan2(-p, -d) + Math.acos(r / Math.hypot(d, p));
  const yi = Math.sqrt(r * r - d * d);
  const s = new THREE.Shape();
  s.moveTo(cx, oy - p);
  s.lineTo(cx + d + Math.cos(tR) * r, oy + Math.sin(tR) * r);
  s.absarc(cx + d, oy, r, tR, Math.atan2(yi, -d), false);
  s.absarc(cx - d, oy, r, Math.atan2(yi, d), Math.PI - tR, false);
  s.lineTo(cx, oy - p);
  return s;
}

/** A puffy heart `w` wide overall, `depth` thick, facing +Z. */
function heartSolid(w: number, depth: number, bevel = depth * 0.4): THREE.BufferGeometry {
  return K.extrude(heartShape(w - bevel * 2), depth, bevel, 20);
}

/** A heart-shaped frame: outer `w`, opening `inner`, facing +Z. */
function heartRing(w: number, inner: number, depth: number, bevel = 0.015): THREE.BufferGeometry {
  const s = heartShape(w - bevel * 2);
  s.holes.push(heartShape(inner + bevel * 2, 0, (w - inner) * 0.06));
  return K.extrude(s, depth, bevel, 24);
}

/** A panel w wide, h tall, then a row of n round scallops on top. */
function scallopTop(w: number, h: number, n: number): THREE.Shape {
  const r = w / (2 * n);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  for (let i = n - 1; i >= 0; i--) s.absarc(-w / 2 + r + i * 2 * r, h, r, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

/** A trim hanging down from y = 0: a band h deep whose lower edge is n scallops. */
function scallopBottom(w: number, h: number, n: number): THREE.Shape {
  const r = w / (2 * n);
  const s = new THREE.Shape();
  s.moveTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  s.lineTo(-w / 2, -h);
  for (let i = 0; i < n; i++) s.absarc(-w / 2 + r + i * 2 * r, -h, r, Math.PI, Math.PI * 2, false);
  s.lineTo(w / 2, 0);
  return s;
}

function ellipse(rx: number, ry: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}

// ---------- Plan paths (x, z) ----------

function arcPts(cx: number, cz: number, r: number, a0: number, a1: number, n = 8): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** Round a w×d rectangle: a closed loop, or open at the back (back-left, round the front, to back-right). */
function rrPath(w: number, d: number, r: number, closed: boolean, cz = 0): P2[] {
  const x0 = -w / 2, x1 = w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const pts: P2[] = [[x0, closed ? z0 + r : z0]];
  pts.push(...arcPts(x0 + r, z1 - r, r, Math.PI, Math.PI / 2));
  pts.push(...arcPts(x1 - r, z1 - r, r, Math.PI / 2, 0));
  pts.push([x1, closed ? z0 + r : z0]);
  if (closed) {
    pts.push(...arcPts(x1 - r, z0 + r, r, 0, -Math.PI / 2));
    pts.push(...arcPts(x0 + r, z0 + r, r, -Math.PI / 2, -Math.PI));
    pts.pop();
  }
  return pts;
}

/** A circle in plan, starting at the front and going round to the right. */
function circlePath(r: number, n = 48, a0 = 0, a1 = Math.PI * 2, cz = 0): P2[] {
  const closed = a1 - a0 >= Math.PI * 2 - 1e-6;
  const out: P2[] = [];
  for (let i = 0; i < (closed ? n : n + 1); i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return out;
}

/**
 * A ruffle hanging from a path in plan: a soft strip `h` deep whose top runs
 * along the path at height y, rippling in and out and flaring at the hem.
 */
function frill(path: P2[], closed: boolean, y: number, h: number, o: { thick?: number; amp?: number; wave?: number; flare?: number } = {}): THREE.BufferGeometry {
  const t = o.thick ?? 0.022, amp = o.amp ?? 0.016, flare = o.flare ?? 0.02;
  const pts = closed ? [...path, path[0]!] : path;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  let wave = o.wave ?? 0.1;
  if (closed) wave = total / Math.max(3, Math.round(total / wave));
  const n = Math.max(8, Math.round(total / (wave / 6)));
  const count = closed ? n : n + 1;
  const at = (s: number): P2 => {
    let k = 1;
    while (k < cum.length - 1 && cum[k]! < s) k++;
    const s0 = cum[k - 1]!, s1 = cum[k]!;
    const f = s1 > s0 ? Math.min(1, (s - s0) / (s1 - s0)) : 0;
    const p0 = pts[k - 1]!, p1 = pts[k]!;
    return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
  };
  const samples: P2[] = [];
  for (let i = 0; i < count; i++) samples.push(at((total * i) / n));
  const prof: P2[] = [
    [0, t / 2], [t * 0.4, t * 0.35], [t / 2, 0], [t / 2, -h],
    [t * 0.35, -h - t * 0.35], [0, -h - t / 2], [-t * 0.35, -h - t * 0.35],
    [-t / 2, -h], [-t / 2, 0], [-t * 0.4, t * 0.35],
  ];
  const pos: number[] = [];
  for (let i = 0; i < count; i++) {
    const prev = samples[closed ? (i - 1 + count) % count : Math.max(0, i - 1)]!;
    const next = samples[closed ? (i + 1) % count : Math.min(count - 1, i + 1)]!;
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const ripple = amp * Math.sin((Math.PI * 2 * total * i) / n / wave);
    const [sx, sz] = samples[i]!;
    for (const [u, py] of prof) {
      const f = Math.min(1, Math.max(0, -py / h));
      const off = u + ripple * (0.3 + 0.7 * f) + flare * f;
      pos.push(sx - tz * off, y + py, sz + tx * off);
    }
  }
  const P = prof.length;
  const idx: number[] = [];
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const i2 = (i + 1) % count;
    for (let k = 0; k < P; k++) {
      const k2 = (k + 1) % P;
      const a = i * P + k, b = i * P + k2, c = i2 * P + k, d = i2 * P + k2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return K.boxUV(geo, 1);
}

/** A gathered drape of cloth from a to b, ra and rb its radii there. */
function fold(a: V3, b: V3, ra: number, rb: number, mat: THREE.Material, waves = 7, amp = 0.16): THREE.Mesh {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const geo = new THREE.CylinderGeometry(rb, ra, va.distanceTo(vb), 42, 4, false);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = 1 + amp * Math.sin(Math.atan2(z, x) * waves);
    p.setXYZ(i, x * k, p.getY(i), z * k * 0.7);
  }
  K.weld(geo);
  K.boxUV(geo, 0.5, "y");
  const m = K.part(geo, mat);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  m.position.copy(va.add(vb).multiplyScalar(0.5));
  return m;
}

// ---------- Small parts ----------

/** A ribbon bow about `s` wide, facing +Z. */
function bow(p: V3, s: number, mat: THREE.Material, r: V3 = [0, 0, 0]): THREE.Object3D {
  return K.group([
    K.part(K.soft(0.5, 0.36, 0.18, 0.5, 0, 20), mat, { p: [-0.25, 0.03, 0], r: [0, 0.25, 0.3] }),
    K.part(K.soft(0.5, 0.36, 0.18, 0.5, 0, 20), mat, { p: [0.25, 0.03, 0], r: [0, -0.25, -0.3] }),
    K.part(K.soft(0.2, 0.22, 0.2, 0.6, 0, 16), mat, { p: [0, 0, 0.05] }),
    K.part(K.soft(0.14, 0.44, 0.08, 0.5, 0, 16), mat, { p: [-0.13, -0.25, 0], r: [0.15, 0, -0.4] }),
    K.part(K.soft(0.14, 0.44, 0.08, 0.5, 0, 16), mat, { p: [0.13, -0.25, 0], r: [0.15, 0, 0.4] }),
  ], { p, r, s });
}

/** A heart-shaped knob on a front facing +Z. */
function heartKnob(p: V3, mat: THREE.Material, w = 0.075): THREE.Mesh {
  return K.part(heartSolid(w, 0.03, 0.012), mat, { p: [p[0], p[1], p[2] + 0.015] });
}

const bunFoot = (h = 0.1, r = 0.06) => K.lathe([[0, 0], [r * 0.7, 0], [r, h * 0.3], [r * 1.02, h * 0.55], [r * 0.8, h * 0.88], [r * 0.6, h], [0, h]], 20);

const turnedLeg = (h: number, r = 0.032) => K.lathe([[0, 0], [r * 0.75, 0], [r * 0.95, h * 0.04], [r * 0.7, h * 0.14], [r * 0.95, h * 0.55], [r * 1.15, h * 0.85], [r * 1.3, h * 0.95], [r * 1.3, h], [0, h]], 20);

const ball = (r: number, mat: THREE.Material, p: V3, s: V3 = [1, 1, 1]) => K.part(new THREE.SphereGeometry(r, r < 0.03 ? 12 : 20, r < 0.03 ? 8 : 14), mat, { p, s });

// ---------- Prints ----------

/** Little hearts on a ground, kept off the edges (the sides of a cushion take the edge colour). */
function heartPrint(key: string, w: number, h: number, bg: string, ink: string, cell = 44): THREE.Texture {
  return drawn(`cute:hearts:${key}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    const m = cell * 0.55;
    for (let row = 0; row * cell < h + cell; row++) {
      for (let col = -1; col * cell < w + cell; col++) {
        const x = col * cell + ((row % 2) * cell) / 2 + cell / 4, y = row * cell + cell * 0.55;
        if (x < m || x > w - m || y < m || y > h - m) continue;
        heart(g, x, y, cell * 0.17);
        g.fill();
      }
    }
  });
}

function mirrorGlass(): THREE.Material {
  const tex = drawn("cute:mirror", 160, 200, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, w * 0.5, h);
    sky.addColorStop(0, "#f4fbff");
    sky.addColorStop(0.55, "#d3e9f5");
    sky.addColorStop(1, "#b7d5ea");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.85)";
    const glint = (x: number, y: number, len: number, wid: number) => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y - len);
      g.lineTo(x + len + wid, y - len);
      g.lineTo(x + wid, y);
      g.closePath();
      g.fill();
    };
    glint(w * 0.14, h * 0.62, w * 0.42, w * 0.13);
    glint(w * 0.36, h * 0.66, w * 0.32, w * 0.05);
  });
  return M.printed("cute:mirror", tex, 0.12);
}

/** A flat picture of `shape` facing +Z, its texture fitted to w×h. */
function pane(shape: THREE.Shape, w: number, h: number): THREE.BufferGeometry {
  return K.planarUV(new THREE.ShapeGeometry(shape, 32), w, h, "z");
}

// ---------- Items ----------

export const CUTE: FurnitureDef[] = [
  {
    id: "cute-bed", name: "Cute Princess Bed", series: "cute", category: "bed", kind: "floor", size: [2, 2], variants,
    build(v) {
      const c = T(v);
      const frame = white();
      const g = gold();
      const main = M.fabric(c.main, 0.7);
      const light = M.fabric(c.light, 0.85);
      const deep = M.gloss(c.deep, 0.35);
      const duvetGeo = K.planarUV(K.soft(1.82, 0.26, 1.22, 0.25, 0.08, 40), 1.82, 1.22, "y");
      const duvet = M.printedCloth(`cute:duvet:${v}`, heartPrint(`duvet:${v}`, 364, 244, c.main, "#fff6f8"), false);
      const parts: THREE.Object3D[] = [
        // Base under a ruffled skirt, on bun feet.
        K.part(K.rbox(1.72, 0.3, 1.66, 0.04), frame, { p: [0, 0.27, 0.04] }),
        ...K.corners(1.62, 1.58).map(([x, , z]) => K.part(bunFoot(0.12, 0.065), frame, { p: [x, 0, z + 0.04] })),
        K.part(frill(rrPath(1.76, 1.76, 0.14, false, 0.03), false, 0.41, 0.25, { amp: 0.02, wave: 0.11, flare: 0.022 }), light),
        // Mattress, duvet with its turned-down top, pillows.
        cushion([0, 0.49, 0.03], 1.74, 0.2, 1.74, sheet(), [0, 0, 0], 0.22, 0.1),
        K.part(duvetGeo, duvet, { p: [0, 0.53, 0.32] }),
        cushion([0, 0.645, -0.27], 1.84, 0.1, 0.2, M.fabric(c.light, 0.6), [0, 0, 0], 0.4, 0),
        cushion([-0.42, 0.68, -0.62], 0.68, 0.17, 0.36, sheet(), [-0.18, 0, 0.03], 0.45, 0.6),
        cushion([0.42, 0.68, -0.62], 0.68, 0.17, 0.36, sheet(), [-0.18, 0, -0.03], 0.45, 0.6),
        K.part(heartSolid(0.46, 0.14, 0.05), M.fabric(c.deep, 0.7), { p: [0.02, 0.82, -0.48], r: [-0.3, 0, -0.08] }),
        // Heart headboard with a tufted heart inset.
        K.part(heartSolid(1.5, 0.08, 0.03), frame, { p: [0, 0.97, -0.9] }),
        K.part(heartSolid(1.14, 0.08, 0.036), main, { p: [0, 1.0, -0.855] }),
        ...([[-0.26, 1.2], [0.26, 1.2], [0, 1.04], [-0.2, 0.86], [0.2, 0.86], [-0.46, 1.05], [0.46, 1.05]] as P2[]).map(([x, y]) => ball(0.022, M.fabric(c.deep, 0.5), [x, y, -0.818])),
      ];
      // Turned posts with ball finials: tall at the head, short at the foot.
      for (const x of [-0.88, 0.88]) {
        parts.push(K.part(K.lathe([[0, 0], [0.06, 0], [0.066, 0.04], [0.05, 0.1], [0.044, 0.9], [0.058, 0.94], [0.058, 0.98], [0.044, 1.02], [0, 1.02]], 20), frame, { p: [x, 0, -0.88] }));
        parts.push(K.part(K.puck(0.05, 0.03, 0.012, 20), g, { p: [x, 1.0, -0.88] }));
        parts.push(ball(0.07, frame, [x, 1.09, -0.88]));
        parts.push(K.part(K.lathe([[0, 0], [0.055, 0], [0.06, 0.04], [0.045, 0.1], [0.042, 0.5], [0.055, 0.54], [0.055, 0.57], [0, 0.57]], 20), frame, { p: [x, 0, 0.9] }));
        parts.push(K.part(K.puck(0.045, 0.025, 0.01, 20), g, { p: [x, 0.56, 0.9] }));
        parts.push(ball(0.06, frame, [x, 0.64, 0.9]));
      }
      // A little canopy crown on the wall, its valance and two tied drapes.
      const half = new THREE.Shape();
      half.moveTo(0.34, 0);
      half.absarc(0, 0, 0.34, 0, Math.PI, false);
      half.lineTo(0.34, 0);
      parts.push(K.part(K.extrude(half, 0.07, 0.02), frame, { p: [0, 1.9, -0.93], r: [Math.PI / 2, 0, 0] }));
      parts.push(K.part(frill(circlePath(0.34, 24, -Math.PI / 2, Math.PI / 2, -0.93), false, 1.88, 0.17, { amp: 0.014, wave: 0.075, flare: 0.022 }), main));
      parts.push(K.part(K.tube(circlePath(0.36, 24, -Math.PI / 2, Math.PI / 2, -0.93).map(([x, z]) => [x, 1.905, z] as V3), 0.016, 40, 8), g));
      parts.push(K.part(heartSolid(0.2, 0.05), deep, { p: [0, 1.99, -0.72] }));
      for (const s of [-1, 1]) {
        parts.push(fold([s * 0.24, 1.88, -0.8], [s * 0.8, 1.16, -0.8], 0.05, 0.07, light, 6, 0.2));
        parts.push(fold([s * 0.8, 1.16, -0.8], [s * 0.84, 0.62, -0.76], 0.07, 0.11, light, 7, 0.18));
        parts.push(bow([s * 0.8, 1.16, -0.73], 0.2, M.fabric(c.deep, 0.7), [0, 0, s * 0.2]));
      }
      return K.group(parts);
    },
  },
  {
    id: "cute-nightstand", name: "Cute Nightstand", series: "cute", category: "storage", kind: "floor", size: [1, 1], variants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.7 },
    build(v) {
      const c = T(v);
      const frame = white();
      const front = M.gloss(c.main, 0.35);
      const g = gold();
      return K.group([
        ...K.corners(0.64, 0.58).map(([x, , z]) => K.part(bunFoot(0.12, 0.06), frame, { p: [x, 0, z - 0.01] })),
        K.part(K.rbox(0.8, 0.52, 0.74, 0.05), frame, { p: [0, 0.36, -0.01] }),
        K.part(K.extrude(scallopBottom(0.7, 0.025, 7), 0.03, 0.01), frame, { p: [0, 0.13, 0.34] }),
        K.part(K.rbox(0.84, 0.035, 0.78, 0.015), front, { p: [0, 0.62, -0.01] }),
        K.part(K.rbox(0.9, 0.07, 0.86, 0.03), frame, { p: [0, 0.665, 0] }),
        K.part(K.rbox(0.68, 0.19, 0.04, 0.02), front, { p: [0, 0.485, 0.37] }),
        K.part(K.rbox(0.68, 0.19, 0.04, 0.02), front, { p: [0, 0.265, 0.37] }),
        K.part(K.rbox(0.56, 0.11, 0.02, 0.01), M.gloss(c.light, 0.35), { p: [0, 0.485, 0.392] }),
        K.part(K.rbox(0.56, 0.11, 0.02, 0.01), M.gloss(c.light, 0.35), { p: [0, 0.265, 0.392] }),
        heartKnob([0, 0.49, 0.395], g),
        heartKnob([0, 0.27, 0.395], g),
      ]);
    },
  },
  {
    id: "cute-wardrobe", name: "Cute Wardrobe", series: "cute", category: "storage", kind: "floor", size: [2, 1], variants,
    build(v) {
      const c = T(v);
      const frame = white();
      const front = M.gloss(c.main, 0.35);
      const panel = M.gloss(c.light, 0.35);
      const deep = M.gloss(c.deep, 0.35);
      const g = gold();
      const parts: THREE.Object3D[] = [
        ...K.corners(1.6, 0.64).map(([x, , z]) => K.part(bunFoot(0.12, 0.07), frame, { p: [x, 0, z - 0.06] })),
        K.part(K.rbox(1.84, 1.72, 0.76, 0.05), frame, { p: [0, 0.96, -0.06] }),
        K.part(K.rbox(1.88, 0.09, 0.82, 0.03), frame, { p: [0, 0.14, -0.05] }),
        K.part(K.rbox(1.88, 0.04, 0.82, 0.02), front, { p: [0, 1.8, -0.05] }),
        K.part(K.rbox(1.92, 0.07, 0.84, 0.03), frame, { p: [0, 1.85, -0.04] }),
        // A scalloped crown with a heart.
        K.part(K.extrude(scallopTop(1.5, 0.04, 5), 0.06, 0.018), frame, { p: [0, 1.885, 0.24] }),
        K.part(K.extrude(scallopTop(1.46, 0.02, 5), 0.03, 0.01), front, { p: [0, 1.875, 0.285] }),
        ...[-0.584, -0.292, 0.292, 0.584].map((x) => ball(0.022, g, [x, 1.97, 0.305])),
        K.part(heartSolid(0.2, 0.05), deep, { p: [0, 1.975, 0.32] }),
        // Two doors with arched panels and heart knobs, a drawer below.
        K.part(K.rbox(1.7, 0.3, 0.05, 0.025), front, { p: [0, 0.34, 0.33] }),
        K.part(K.rbox(1.5, 0.16, 0.02, 0.01), panel, { p: [0, 0.34, 0.358] }),
        heartKnob([-0.45, 0.34, 0.37], g, 0.08),
        heartKnob([0.45, 0.34, 0.37], g, 0.08),
      ];
      for (const s of [-1, 1]) {
        parts.push(K.part(K.rbox(0.84, 1.24, 0.05, 0.025), front, { p: [s * 0.435, 1.14, 0.33] }));
        parts.push(K.part(K.extrude(K.archShape(0.6, 1.0, -0.5), 0.03, 0.01), panel, { p: [s * 0.435, 1.13, 0.36] }));
        parts.push(K.part(heartSolid(0.15, 0.03, 0.01), deep, { p: [s * 0.435, 1.38, 0.38] }));
        parts.push(heartKnob([s * 0.07, 1.1, 0.355], g, 0.085));
      }
      return K.group(parts);
    },
  },
  {
    id: "cute-vanity", name: "Cute Vanity", series: "cute", category: "table", kind: "floor", size: [2, 1], variants,
    build(v) {
      const c = T(v);
      const frame = white();
      const front = M.gloss(c.main, 0.35);
      const deep = M.gloss(c.deep, 0.35);
      const g = gold();
      const parts: THREE.Object3D[] = [
        ...K.corners(1.56, 0.54).map(([x, , z]) => K.part(turnedLeg(0.56, 0.034), frame, { p: [x, 0, z] })),
        ...K.corners(1.56, 0.54).map(([x, , z]) => K.part(K.puck(0.034, 0.03, 0.01, 16), g, { p: [x, 0, z] })),
        K.part(K.rbox(1.66, 0.18, 0.6, 0.03), frame, { p: [0, 0.62, 0] }),
        K.part(K.extrude(scallopBottom(1.4, 0.02, 10), 0.03, 0.008), frame, { p: [0, 0.535, 0.28] }),
        K.part(K.rbox(1.8, 0.06, 0.74, 0.03), frame, { p: [0, 0.74, 0] }),
        // The oval mirror between two turned posts.
        K.part(K.extrude(Object.assign(ellipse(0.35, 0.45), { holes: [ellipse(0.3, 0.4)] }), 0.06, 0.02), frame, { p: [0, 1.32, -0.27] }),
        K.part(pane(ellipse(0.31, 0.41), 0.62, 0.82), mirrorGlass(), { p: [0, 1.32, -0.275] }),
        K.part(heartSolid(0.2, 0.05), deep, { p: [0, 1.85, -0.27] }),
      ];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        parts.push(ball(0.016, g, [Math.cos(a) * 0.335, 1.32 + Math.sin(a) * 0.435, -0.235]));
      }
      for (const s of [-1, 1]) {
        parts.push(K.part(K.lathe([[0, 0], [0.04, 0], [0.042, 0.03], [0.026, 0.08], [0.022, 0.55], [0.032, 0.6], [0.032, 0.63], [0, 0.63]], 16), frame, { p: [s * 0.43, 0.77, -0.27] }));
        parts.push(ball(0.035, g, [s * 0.43, 1.43, -0.27]));
        parts.push(ball(0.028, g, [s * 0.39, 1.32, -0.27]));
      }
      // Three little drawers with heart knobs.
      for (const x of [-0.53, 0, 0.53]) {
        parts.push(K.part(K.rbox(0.46, 0.12, 0.04, 0.02), front, { p: [x, 0.625, 0.31] }));
        parts.push(heartKnob([x, 0.627, 0.33], g, 0.06));
      }
      // A jewellery chest, perfume and a powder box.
      parts.push(K.part(K.rbox(0.3, 0.2, 0.24, 0.03), front, { p: [-0.66, 0.87, -0.12] }));
      for (const y of [0.92, 0.83]) {
        parts.push(K.part(K.rbox(0.25, 0.07, 0.02, 0.01), M.gloss(c.light, 0.35), { p: [-0.66, y, 0.0] }));
        parts.push(ball(0.014, g, [-0.66, y, 0.015]));
      }
      parts.push(K.part(K.lathe([[0, 0], [0.05, 0], [0.06, 0.03], [0.058, 0.09], [0.035, 0.12], [0.016, 0.13], [0, 0.13]], 24), M.glass(c.main, 0.65), { p: [0.6, 0.77, -0.02] }));
      parts.push(K.part(K.lathe([[0, 0], [0.025, 0], [0.03, 0.04], [0.02, 0.06], [0, 0.065]], 16), g, { p: [0.6, 0.9, -0.02] }));
      parts.push(K.part(heartSolid(0.13, 0.06, 0.02), M.glass(c.deep, 0.7), { p: [0.76, 0.83, -0.08] }));
      parts.push(ball(0.022, g, [0.76, 0.9, -0.08]));
      parts.push(K.part(K.puck(0.075, 0.05, 0.018, 28), M.gloss(c.light, 0.35), { p: [0.58, 0.77, -0.22] }));
      parts.push(ball(0.05, M.plush("#fff5f2"), [0.58, 0.83, -0.22], [1, 0.45, 1]));
      return K.group(parts);
    },
  },
  {
    id: "cute-chair", name: "Cute Chair", series: "cute", category: "seat", kind: "floor", size: [1, 1], variants,
    build(v) {
      const c = T(v);
      const frame = white();
      return K.group([
        ...K.corners(0.44, 0.4).map(([x, , z]) => K.part(turnedLeg(0.42, 0.03), frame, { p: [x, 0, z + 0.02] })),
        K.part(K.rbox(0.58, 0.06, 0.54, 0.03), frame, { p: [0, 0.44, 0.02] }),
        K.part(frill(rrPath(0.58, 0.54, 0.14, true, 0.02), true, 0.475, 0.08, { amp: 0.012, wave: 0.07, flare: 0.016 }), M.fabric(c.light, 0.85)),
        cushion([0, 0.51, 0.03], 0.56, 0.11, 0.52, M.fabric(c.main, 0.7), [0, 0, 0], 0.3, 0.3),
        // Heart back on two posts.
        K.part(K.rod([-0.17, 0.46, -0.21], [-0.17, 0.86, -0.25], 0.024), frame),
        K.part(K.rod([0.17, 0.46, -0.21], [0.17, 0.86, -0.25], 0.024), frame),
        K.part(heartRing(0.6, 0.42, 0.05), frame, { p: [0, 0.94, -0.25], r: [-0.1, 0, 0] }),
        K.part(heartSolid(0.46, 0.07, 0.03), M.fabric(c.main, 0.7), { p: [0, 0.945, -0.24], r: [-0.1, 0, 0] }),
        bow([0, 1.11, -0.22], 0.14, M.fabric(c.deep, 0.7), [-0.1, 0, 0]),
      ]);
    },
  },
  {
    id: "cute-sofa", name: "Cute Sofa", series: "cute", category: "seat", kind: "floor", size: [2, 1], variants,
    build(v) {
      const c = T(v);
      const frame = white();
      const main = M.fabric(c.main, 0.7);
      const parts: THREE.Object3D[] = [
        ...K.corners(1.6, 0.6).map(([x, , z]) => K.part(bunFoot(0.13, 0.055), gold(), { p: [x, 0, z] })),
        K.part(K.rbox(1.76, 0.22, 0.74, 0.04), frame, { p: [0, 0.25, 0] }),
        K.part(frill(rrPath(1.8, 0.8, 0.12, true), true, 0.37, 0.2, { amp: 0.015, wave: 0.09, flare: 0.02 }), M.fabric(c.light, 0.85)),
        // A scalloped white back with three puffy lobes, buttoned.
        K.part(K.extrude(scallopTop(1.76, 0.42, 3), 0.14, 0.03), frame, { p: [0, 0.2, -0.3] }),
        // Rolled arms and two seat cushions.
        cushion([-0.8, 0.5, 0.0], 0.2, 0.36, 0.74, main, [0, 0, 0], 0.45, 0.1),
        cushion([0.8, 0.5, 0.0], 0.2, 0.36, 0.74, main, [0, 0, 0], 0.45, 0.1),
        cushion([-0.36, 0.44, 0.05], 0.72, 0.17, 0.62, main, [0, 0, 0], 0.3, 0.25),
        cushion([0.36, 0.44, 0.05], 0.72, 0.17, 0.62, main, [0, 0, 0], 0.3, 0.25),
        K.part(heartSolid(0.34, 0.12, 0.045), M.fabric(c.deep, 0.7), { p: [0.4, 0.66, -0.1], r: [-0.3, 0, -0.12] }),
        cushion([-0.42, 0.64, -0.12], 0.3, 0.3, 0.12, M.fabric(c.light, 0.7), [-0.3, 0, 0.1], 0.6, 0.4),
      ];
      for (const x of [-0.587, 0, 0.587]) {
        parts.push(K.part(K.extrude(K.archShape(0.48, 0.52, 0), 0.1, 0.04), main, { p: [x, 0.34, -0.2] }));
        parts.push(ball(0.02, M.fabric(c.deep, 0.5), [x, 0.66, -0.135]));
      }
      return K.group(parts);
    },
  },
  {
    id: "cute-table", name: "Cute Round Table", series: "cute", category: "table", kind: "floor", size: [1, 1], variants,
    surface: { rect: [-0.5, -0.5, 0.5, 0.5], y: 0.74 },
    build(v) {
      const c = T(v);
      const frame = white();
      const clothGeo = K.planarUV(K.puck(0.42, 0.03, 0.012, 48), 0.84, 0.84, "y");
      const cloth = M.printedCloth(`cute:tablecloth:${v}`, heartPrint(`table:${v}`, 200, 200, c.main, "#fff6f8", 40), false);
      return K.group([
        K.part(K.lathe([[0, 0], [0.24, 0], [0.25, 0.03], [0.2, 0.07], [0.08, 0.12], [0.05, 0.2], [0.07, 0.3], [0.045, 0.42], [0.05, 0.56], [0.12, 0.64], [0.13, 0.67], [0, 0.67]], 32), frame),
        K.part(K.puck(0.25, 0.025, 0.01, 32), gold(), { p: [0, 0, 0] }),
        K.part(K.puck(0.41, 0.04, 0.015, 48), frame, { p: [0, 0.67, 0] }),
        K.part(clothGeo, cloth, { p: [0, 0.71, 0] }),
        K.part(frill(circlePath(0.415, 64), true, 0.728, 0.14, { amp: 0.014, wave: 0.085, flare: 0.02 }), M.fabric(c.light, 0.85)),
      ]);
    },
  },
  {
    id: "cute-floor-lamp", name: "Cute Floor Lamp", series: "cute", category: "lamp", kind: "floor", size: [1, 1], variants,
    light: { at: [0, 1.42, 0], color: "#ffe0bc", intensity: 4, distance: 4.5, halo: 1.3, startsOn: true },
    build(v) {
      const c = T(v);
      const frame = white();
      const g = gold();
      return K.group([
        K.part(K.lathe([[0, 0], [0.21, 0], [0.22, 0.03], [0.18, 0.07], [0.07, 0.1], [0.035, 0.13], [0, 0.13]], 36), frame),
        K.part(K.puck(0.215, 0.02, 0.008, 36), g, { p: [0, 0, 0] }),
        K.part(K.rod([0, 0.1, 0], [0, 1.4, 0], 0.02), frame),
        K.part(K.puck(0.035, 0.04, 0.012, 16), g, { p: [0, 0.62, 0] }),
        K.part(K.puck(0.035, 0.04, 0.012, 16), g, { p: [0, 1.2, 0] }),
        dome([[0.29, 1.3], [0.265, 1.34], [0.22, 1.41], [0.19, 1.49], [0.18, 1.56], [0.16, 1.62], [0.11, 1.67], [0.04, 1.69], [0, 1.69]], c.main, "#ffe2a8", 0.9),
        K.part(frill(circlePath(0.285, 48), true, 1.315, 0.075, { amp: 0.012, wave: 0.075, flare: 0.016 }), M.fabric("#fffaf6", 0.8)),
        K.part(heartSolid(0.15, 0.05), M.gloss(c.deep, 0.35), { p: [0, 1.75, 0] }),
        bulb([0, 1.44, 0], 0.07),
      ]);
    },
  },
  {
    id: "bunny-plush", name: "Bunny Plush", series: "cute", category: "toy", kind: "misc", size: [1, 1],
    variants: [
      { name: "White Bunny", swatch: "#f8f4ee" },
      { name: "Pink Bunny", swatch: "#f6c4d2" },
      { name: "Milk Tea Bunny", swatch: "#e8cdae" },
      { name: "Lavender Bunny", swatch: "#d8ccf0" },
    ],
    build(v) {
      const look = [
        { fur: "#faf6f0", inner: "#f7bccb", ribbon: "#ef8fae" },
        { fur: "#f7c6d3", inner: "#fde4ec", ribbon: "#fffaf5" },
        { fur: "#ead0b2", inner: "#f7c9c2", ribbon: "#8fcfb7" },
        { fur: "#dbcff2", inner: "#f7c6d6", ribbon: "#f2a2bb" },
      ][v] ?? { fur: "#faf6f0", inner: "#f7bccb", ribbon: "#ef8fae" };
      const fur = M.plush(look.fur);
      const inner = M.plush(look.inner);
      const eye = M.gloss("#3a2b2b", 0.2);
      const ear = (x: number, tilt: number, bend: number) => K.group([
        K.part(K.soft(0.09, 0.28, 0.05, 0.6, 0, 24), fur, { p: [0, 0.13, 0] }),
        K.part(K.soft(0.05, 0.2, 0.02, 0.6, 0, 20), inner, { p: [0, 0.13, 0.022] }),
      ], { p: [x, 0.47, 0], r: [bend, 0, tilt] });
      return K.group([
        ball(0.15, fur, [0, 0.145, 0], [1, 0.95, 0.9]),
        ball(0.135, fur, [0, 0.37, 0.02], [1.1, 0.95, 0.95]),
        ear(-0.055, 0.2, -0.15),
        ear(0.06, -0.75, -0.2),
        ball(0.026, M.plush("#f6a3b6"), [-0.08, 0.34, 0.125], [1, 0.65, 0.4]),
        ball(0.026, M.plush("#f6a3b6"), [0.08, 0.34, 0.125], [1, 0.65, 0.4]),
        ball(0.017, eye, [-0.05, 0.385, 0.137], [1, 1.2, 0.6]),
        ball(0.017, eye, [0.05, 0.385, 0.137], [1, 1.2, 0.6]),
        ball(0.012, M.gloss("#ef8aa0", 0.3), [0, 0.355, 0.15], [1.3, 1, 0.8]),
        ball(0.05, fur, [-0.11, 0.19, 0.1], [0.9, 1.2, 0.9]),
        ball(0.05, fur, [0.11, 0.19, 0.1], [0.9, 1.2, 0.9]),
        ball(0.058, fur, [-0.08, 0.04, 0.11], [1, 0.7, 1.3]),
        ball(0.058, fur, [0.08, 0.04, 0.11], [1, 0.7, 1.3]),
        ball(0.022, inner, [-0.08, 0.04, 0.183], [1, 1, 0.4]),
        ball(0.022, inner, [0.08, 0.04, 0.183], [1, 1, 0.4]),
        ball(0.05, M.plush("#ffffff"), [0, 0.1, -0.14]),
        bow([0, 0.255, 0.115], 0.13, M.fabric(look.ribbon, 0.7), [0.2, 0, 0]),
      ], { s: 0.92 });
    },
  },
  {
    id: "cute-music-box", name: "Music Box", series: "cute", category: "decor", kind: "misc", size: [1, 1], variants, switchable: true,
    build(v) {
      const c = T(v);
      const g = gold();
      const frame = white();
      const lamp = M.glow("#ffe2a8", "#fff6e0", 2.4, 0.3);
      const parts: THREE.Object3D[] = [
        K.part(K.puck(0.17, 0.08, 0.025, 40), M.gloss(c.main, 0.3), { p: [0, 0.015, 0] }),
        K.part(K.puck(0.175, 0.02, 0.008, 40), g, { p: [0, 0.0, 0] }),
        K.part(K.puck(0.172, 0.018, 0.008, 40), g, { p: [0, 0.088, 0] }),
        K.part(K.puck(0.15, 0.02, 0.008, 40), frame, { p: [0, 0.1, 0] }),
        K.part(heartSolid(0.07, 0.02, 0.008), M.gloss(c.deep, 0.3), { p: [0, 0.055, 0.172] }),
        K.part(K.rod([0, 0.1, 0], [0, 0.34, 0], 0.016), g),
        // Roof with a frilled valance, tiny lights, a heart on top.
        K.part(K.lathe([[0, 0.325], [0.175, 0.325], [0.18, 0.335], [0.12, 0.37], [0.05, 0.405], [0.015, 0.42], [0, 0.42]], 40), frame),
        K.part(frill(circlePath(0.165, 40), true, 0.33, 0.04, { thick: 0.014, amp: 0.008, wave: 0.06, flare: 0.008 }), M.fabric(c.main, 0.8)),
        ball(0.02, g, [0, 0.43, 0]),
        K.part(heartSolid(0.07, 0.025, 0.01), M.gloss(c.deep, 0.3), { p: [0, 0.475, 0] }),
        // A crank on the side.
        K.part(K.rod([0.17, 0.05, 0], [0.21, 0.05, 0], 0.01), g),
        K.part(K.rbox(0.02, 0.07, 0.03, 0.009), g, { p: [0.215, 0.05, 0] }),
      ];
      const riders = [M.gloss("#fffaf6", 0.3), M.gloss(c.deep, 0.3), M.gloss(c.light, 0.3), M.gloss(c.main, 0.3)];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const x = Math.sin(a) * 0.1, z = Math.cos(a) * 0.1;
        parts.push(K.part(K.rod([x, 0.1, z], [x, 0.33, z], 0.01, 8), g));
        parts.push(K.part(heartSolid(0.075, 0.035, 0.012), riders[i]!, { p: [x, 0.18 + (i % 2) * 0.05, z], r: [0, a, 0] }));
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const m = K.part(new THREE.SphereGeometry(0.017, 10, 8), lamp, { p: [Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.17] });
        m.castShadow = false;
        parts.push(m);
      }
      return K.group(parts);
    },
  },
  {
    id: "heart-mirror", name: "Heart Wall Mirror", series: "cute", category: "wall", kind: "wall", size: [1, 1], hang: 1.5, variants,
    build(v) {
      const c = T(v);
      const parts: THREE.Object3D[] = [
        K.part(heartRing(0.84, 0.64, 0.06, 0.02), M.gloss(c.main, 0.3), { p: [0, -0.05, 0.04] }),
        K.part(pane(heartShape(0.68, 0, 0.012), 0.68, 0.56), mirrorGlass(), { p: [0, -0.05, 0.025] }),
        // Ribbon up to a nail, with a bow.
        K.part(K.rbox(0.035, 0.2, 0.012, 0.005), M.fabric(c.deep, 0.6), { p: [-0.035, 0.36, 0.015], r: [0, 0, -0.33] }),
        K.part(K.rbox(0.035, 0.2, 0.012, 0.005), M.fabric(c.deep, 0.6), { p: [0.035, 0.36, 0.015], r: [0, 0, 0.33] }),
        ball(0.02, gold(), [0, 0.45, 0.02]),
        bow([0, 0.24, 0.07], 0.2, M.fabric(c.deep, 0.7)),
      ];
      const edge = heartShape(0.74, 0, 0.0).getSpacedPoints(26);
      for (let i = 0; i < 26; i++) {
        const p = edge[i]!;
        if (Math.abs(p.x) < 0.07 && p.y > 0.1) continue;
        parts.push(ball(0.017, M.ceramic("#fffaf6"), [p.x, p.y - 0.05, 0.075]));
      }
      return K.group(parts);
    },
  },
  {
    id: "cute-garland", name: "Heart Bunting", series: "cute", category: "wall", kind: "wall", size: [2, 0.5], hang: 2.25,
    variants: [
      { name: "Pink & White", swatch: "#f5a9bf" },
      { name: "Rainbow", swatch: "#f6e58f" },
      { name: "Lavender", swatch: "#cbb8ef" },
    ],
    build(v) {
      const sets = [
        ["#f5a9bf", "#fff6f2", "#ef87a6", "#fff6f2", "#f5a9bf", "#fff6f2", "#ef87a6"],
        ["#f5a9bf", "#f8c98a", "#f6e38f", "#a8dfca", "#a9cdf2", "#cbb8ef", "#f5a9bf"],
        ["#cbb8ef", "#fff6f2", "#a8dfca", "#fff6f2", "#cbb8ef", "#fff6f2", "#a8dfca"],
      ];
      const colors = sets[v] ?? sets[0]!;
      const sag = (x: number) => 0.2 - 0.1 * (1 - (x / 0.92) ** 2);
      const string: V3[] = [];
      for (let i = 0; i <= 16; i++) {
        const x = -0.92 + (i / 16) * 1.84;
        string.push([x, sag(x), 0.04]);
      }
      const parts: THREE.Object3D[] = [
        K.part(K.tube(string, 0.01, 64, 6), M.paint("#fffaf6", 0.6)),
        bow([-0.9, 0.2, 0.05], 0.13, M.fabric(colors[2]!, 0.7)),
        bow([0.9, 0.2, 0.05], 0.13, M.fabric(colors[2]!, 0.7)),
      ];
      for (let i = 0; i < 7; i++) {
        const x = -0.72 + i * 0.24;
        parts.push(K.part(heartSolid(0.2, 0.045, 0.018), M.gloss(colors[i]!, 0.35), { p: [x, sag(x) - 0.085, 0.045], r: [0, 0, (i % 2 ? 1 : -1) * 0.07] }));
        if (i < 6) parts.push(ball(0.026, M.plush(i % 2 ? "#fff6f2" : colors[(i + 3) % 7]!), [x + 0.12, sag(x + 0.12) - 0.012, 0.045]));
      }
      return K.group(parts);
    },
  },
  {
    id: "cute-pendant", name: "Cute Pendant Lamp", series: "cute", category: "ceiling", kind: "ceiling", size: [1, 1], variants,
    light: { at: [0, -0.64, 0], color: "#ffe0bc", intensity: 5, distance: 5.5, halo: 1.3, startsOn: true },
    build(v) {
      const c = T(v);
      const frame = white();
      const g = gold();
      const parts: THREE.Object3D[] = [
        K.part(K.puck(0.12, 0.04, 0.015, 32), frame, { p: [0, -0.04, 0] }),
        K.part(frill(circlePath(0.11, 32), true, -0.035, 0.03, { thick: 0.014, amp: 0.006, wave: 0.05, flare: 0.006 }), frame),
        K.part(K.rod([0, -0.04, 0], [0, -0.44, 0], 0.012, 8), frame),
        K.part(K.lathe([[0, -0.46], [0.05, -0.455], [0.045, -0.43], [0.02, -0.41], [0, -0.405]], 20), g),
        dome([[0.3, -0.78], [0.28, -0.74], [0.235, -0.67], [0.205, -0.6], [0.19, -0.54], [0.16, -0.49], [0.1, -0.455], [0.03, -0.445], [0, -0.445]], c.main, "#ffe2a8", 0.9),
        K.part(frill(circlePath(0.29, 48), true, -0.765, 0.07, { amp: 0.012, wave: 0.075, flare: 0.016 }), M.fabric("#fffaf6", 0.8)),
        bow([0, -0.43, 0.06], 0.16, M.fabric(c.deep, 0.7)),
        bulb([0, -0.62, 0], 0.075),
        // A pull chain with a heart charm.
        K.part(K.rod([0, -0.66, 0], [0, -0.88, 0], 0.01, 6), g),
        K.part(heartSolid(0.08, 0.025, 0.01), g, { p: [0, -0.92, 0] }),
      ];
      return K.group(parts);
    },
  },
];
