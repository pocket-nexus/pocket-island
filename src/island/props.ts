// What stands on the island, modelled like the furniture: from the kit's
// soft shapes, in matte paint with a faint mottle. Each model stands on
// y = 0 at its centre. Trees are a trunk under a cloud of round leaves;
// a fruit tree carries its fruit; a cedar is three skirts of needles; a
// palm leans with its fronds hanging. Flowers grow in clumps of three.

import * as THREE from "three";
import type { Bridge, PropKind, Ramp } from "../core/island.ts";
import { rampRise } from "../core/island.ts";
import * as K from "../scene/kit.ts";
import * as M from "../scene/materials.ts";
import type { V3 } from "../scene/kit.ts";

const BARK = "#8d5f3d";
const LEAVES = ["#5fb64d", "#4fa646", "#6dc25a"];

/** A seeded number source, so a model is the same every time it is built. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function trunk(height: number, radius: number, bend = 0): THREE.Mesh {
  const geo = K.lathe([[radius * 1.55, 0], [radius * 1.25, 0.05], [radius * 1.02, 0.2], [radius * 0.92, height * 0.6], [radius * 0.85, height * 0.96], [0, height]], 16);
  // A slight lean, more toward the top.
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + bend * (p.getY(i) / height) ** 2);
  geo.computeVertexNormals();
  return K.part(geo, M.wood(BARK, "bold", 0.75));
}

/** A cloud of leaves: round puffs about a centre, `size` across. */
function crown(centre: V3, size: number, color: string, seed: number): THREE.Object3D[] {
  const r = seeded(seed);
  const leaf = M.paint(color, 0.72);
  const shade = M.paint(new THREE.Color(color).multiplyScalar(0.82).getStyle(), 0.75);
  const puffs: Array<[V3, number, THREE.Material]> = [
    [[0, 0, 0], 1, leaf],
    [[-0.36, -0.16, 0.12], 0.72, leaf],
    [[0.38, -0.12, 0.08], 0.74, leaf],
    [[0.04, 0.34, -0.06], 0.7, leaf],
    [[0.02, -0.24, -0.32], 0.7, shade],
    [[-0.1, -0.1, 0.4], 0.58, leaf],
  ];
  return puffs.map(([[x, y, z], k, mat]) => {
    const s = size * k * (0.92 + r() * 0.16);
    return K.part(K.soft(s, s * 0.86, s, 0.82, 0, 22), mat, { p: [centre[0] + x * size, centre[1] + y * size, centre[2] + z * size], r: [0, r() * 3, 0] });
  });
}

function hardwood(variant: number, fruit?: string): THREE.Group {
  const lean = [0.06, -0.05, 0.03][variant % 3]!;
  const parts: THREE.Object3D[] = [trunk(1.35, 0.11, lean), ...crown([lean, 1.78, 0], 1.45 + (variant % 3) * 0.08, LEAVES[variant % 3]!, 11 + variant)];
  if (fruit) {
    const mat = M.gloss(fruit, 0.45);
    const stem = M.paint("#5b3a22");
    const spots: V3[] = [[-0.45, 1.5, 0.5], [0.42, 1.62, 0.52], [0.02, 1.95, 0.68], [-0.62, 1.82, 0.12], [0.62, 1.86, 0.1], [0.25, 2.25, 0.4], [-0.28, 2.2, 0.38]];
    for (const [x, y, z] of spots) {
      parts.push(K.part(K.soft(0.19, 0.18, 0.19, 0.9, 0, 14), mat, { p: [x + lean, y, z] }));
      parts.push(K.part(K.rod([x + lean, y + 0.08, z], [x + lean + 0.01, y + 0.14, z], 0.012, 5), stem));
    }
  }
  return K.group(parts);
}

function cedar(variant: number): THREE.Group {
  const green = ["#3f8f4f", "#4a9a54"][variant % 2]!;
  const mat = M.paint(green, 0.74);
  const parts: THREE.Object3D[] = [trunk(0.9, 0.1)];
  const skirts: Array<[number, number, number]> = [[0.62, 0.95, 0.9], [1.25, 0.74, 0.78], [1.8, 0.5, 0.66]];
  for (const [y, r, h] of skirts) {
    parts.push(K.part(K.lathe([[0, 0], [r * 0.9, 0.02], [r, 0.1], [r * 0.82, 0.22], [r * 0.3, h * 0.85], [0, h]], 18), mat, { p: [0, y, 0] }));
  }
  return K.group(parts);
}

function palm(variant: number): THREE.Group {
  const lean = variant ? -0.32 : 0.36;
  const parts: THREE.Object3D[] = [];
  const rings = [M.wood("#a07650", "bold", 0.8), M.wood("#8c6442", "bold", 0.8)];
  const n = 8, h = 2.3;
  const at = (t: number): V3 => [lean * t * t * 1.6, t * h, 0];
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const r = 0.12 - t0 * 0.035;
    parts.push(K.part(K.rod(at(t0), at(t1), r, 10), rings[k % 2]!));
  }
  const top = at(1);
  const frond = M.leaf("#5bb04c");
  for (let k = 0; k < 8; k++) {
    const g = K.leafGeometry(1.15, 0.36, 0.3, -0.55, "long");
    const leaf = K.part(g, frond);
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(-0.35 + (k % 2) * 0.2, (k / 8) * Math.PI * 2, 0);
    leaf.position.set(...top);
    parts.push(leaf);
  }
  const nut = M.paint("#7a5332", 0.6);
  for (const [x, z] of [[0.1, 0.08], [-0.09, 0.07], [0.0, -0.1]]) parts.push(K.part(new THREE.SphereGeometry(0.09, 12, 10), nut, { p: [top[0] + x!, top[1] - 0.1, top[2] + z!] }));
  return K.group(parts);
}

const BLOOMS = ["#f0524f", "#ffd23f", "#fff6e6", "#ff9bc0", "#b48cf0", "#ff9a4a"];

function bush(variant: number): THREE.Group {
  const mat = M.paint("#4f9e45", 0.75);
  const parts: THREE.Object3D[] = [
    K.part(K.soft(0.82, 0.62, 0.78, 0.8, 0, 20), mat, { p: [0, 0.31, 0] }),
    K.part(K.soft(0.6, 0.5, 0.58, 0.8, 0, 18), mat, { p: [-0.22, 0.27, 0.16] }),
    K.part(K.soft(0.58, 0.48, 0.56, 0.8, 0, 18), mat, { p: [0.24, 0.26, 0.12] }),
  ];
  if (variant > 0) {
    const bloom = M.paint([BLOOMS[3]!, BLOOMS[2]!, BLOOMS[1]!][variant - 1]!, 0.6);
    const r = seeded(40 + variant);
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2, y = 0.35 + r() * 0.3;
      const rr = 0.36 + r() * 0.05;
      parts.push(K.part(new THREE.SphereGeometry(0.055, 8, 6), bloom, { p: [Math.cos(a) * rr, y, Math.sin(a) * rr * 0.9 + 0.08] }));
    }
  }
  return K.group(parts);
}

function blossom(color: string, centre: string): THREE.Object3D {
  const petal = M.paint(color, 0.55);
  const parts: THREE.Object3D[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(K.part(K.soft(0.075, 0.03, 0.06, 0.8, 0, 10), petal, { p: [Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045], r: [0, -a, 0.25] }));
  }
  parts.push(K.part(new THREE.SphereGeometry(0.026, 8, 6), M.paint(centre, 0.6), { p: [0, 0.012, 0] }));
  return K.group(parts);
}

function flowers(variant: number): THREE.Group {
  const color = BLOOMS[variant % BLOOMS.length]!;
  const centre = variant === 1 ? "#ff9a3c" : variant === 2 ? "#ffd23f" : "#fff1b0";
  const stem = M.paint("#4c9a3f", 0.7);
  const leaf = M.leaf("#5aae48");
  const parts: THREE.Object3D[] = [];
  const spots: Array<[number, number, number]> = [[0, 0, 0.3], [-0.13, 0.1, 0.24], [0.12, 0.08, 0.22]];
  for (const [x, z, h] of spots) {
    parts.push(K.part(K.rod([x, 0, z], [x, h, z], 0.012, 5), stem));
    const b = blossom(color, centre);
    b.position.set(x, h, z);
    b.rotation.set(0.25, x * 4, 0);
    parts.push(b);
  }
  for (let k = 0; k < 4; k++) {
    const l = K.part(K.leafGeometry(0.16, 0.07, 0.2, 0.25), leaf);
    l.rotation.order = "YXZ";
    l.rotation.set(-0.6, (k / 4) * Math.PI * 2 + 0.4, 0);
    parts.push(l);
  }
  return K.group(parts);
}

function rock(variant: number): THREE.Group {
  const geo = new THREE.IcosahedronGeometry(0.42, 2);
  const r = seeded(70 + variant);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  // Each corner pushed in or out a little, the same wherever the icosahedron's faces share it.
  const jitter = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = jitter.get(key);
    if (k === undefined) jitter.set(key, (k = 0.88 + r() * 0.2));
    p.setXYZ(i, p.getX(i) * k * 1.08, Math.max(-0.05, p.getY(i) * k * 0.72), p.getZ(i) * k);
  }
  geo.translate(0, 0.2, 0);
  geo.computeVertexNormals();
  K.weld(geo);
  K.boxUV(geo, 1);
  const color = ["#a7a59b", "#9c968a", "#b0aca0"][variant % 3]!;
  return K.group([K.part(geo, M.paint(color, 0.85))]);
}

/** The lantern's glow is one material, brightened after dark. */
const lanternGlass = M.glow("#ffd890", "#fff4d6", 0, 0.4);
const windowLight = { value: 0 };

export const PROP_LIGHT = {
  lamp: { y: 1.42, color: "#ffd59a", intensity: 2.2, distance: 5.5 },
  setGlow(glow: number) {
    windowLight.value = glow;
    lanternGlass.emissiveIntensity = 0.2 + glow * 2.2;
  },
};

function lamp(): THREE.Group {
  const iron = M.paint("#3b4a44", 0.5);
  return K.group([
    K.part(K.puck(0.16, 0.08, 0.02, 16), iron),
    K.part(K.rod([0, 0.05, 0], [0, 1.28, 0], 0.035, 10), iron),
    K.part(K.rbox(0.22, 0.04, 0.22, 0.015, 2), iron, { p: [0, 1.29, 0] }),
    K.part(K.rbox(0.18, 0.24, 0.18, 0.03, 2), lanternGlass, { p: [0, 1.42, 0] }),
    K.part(K.lathe([[0.15, 0], [0.13, 0.03], [0.06, 0.1], [0, 0.12]], 12), iron, { p: [0, 1.54, 0] }),
  ]);
}

function mailbox(): THREE.Group {
  const post = M.wood("#9a6a44", "fine", 0.6);
  const box = M.gloss("#e8624f", 0.45);
  return K.group([
    K.part(K.rbox(0.09, 0.75, 0.09, 0.02, 2, "y"), post, { p: [0, 0.37, 0] }),
    K.part(K.rbox(0.3, 0.2, 0.42, 0.04, 3), box, { p: [0, 0.82, 0] }),
    K.part(K.soft(0.3, 0.16, 0.42, 0.25, 0, 18), box, { p: [0, 0.9, 0] }),
    K.part(K.rbox(0.02, 0.16, 0.06, 0.006, 1), M.paint("#ffd23f"), { p: [0.16, 0.95, -0.08] }),
  ]);
}

function shell(variant: number): THREE.Group {
  const color = ["#fbe3d6", "#ffd0c4", "#fff3e0"][variant % 3]!;
  const geo = new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, 0.35, 0.9);
  return K.group([K.part(geo, M.paint(color, 0.5), { r: [0, variant, 0] })]);
}

const builders: Record<PropKind, (variant: number) => THREE.Group> = {
  tree: (v) => hardwood(v),
  fruit: (v) => hardwood(v, ["#ff9a3c", "#e8473f", "#ffb19a"][v % 3]),
  cedar, palm, bush,
  flower: flowers,
  rock,
  lamp: () => lamp(),
  mailbox: () => mailbox(),
  shell,
};

const models = new Map<string, THREE.Group>();
/** A prop's model, built once per kind and look. */
export function propModel(kind: PropKind, variant: number): THREE.Group {
  const key = `${kind}:${variant}`;
  let m = models.get(key);
  if (!m) models.set(key, (m = builders[kind](variant)));
  return m;
}

// ---------------------------------------------------------------- bridges and inclines

const PLANK = "#b88350";

/** A plank bridge, lifted a little in its middle, with a rail each side. */
export function buildBridge(b: Bridge): THREE.Group {
  const [x0, z0, x1, z1] = b.rect;
  const along = b.axis === "x" ? x1 - x0 : z1 - z0;
  const across = b.axis === "x" ? z1 - z0 : x1 - x0;
  const wood = M.wood(PLANK, "bold", 0.7);
  const dark = M.wood("#8f6238", "bold", 0.7);
  const parts: THREE.Object3D[] = [];
  const arch = (t: number) => 0.12 * Math.sin(Math.PI * t);
  const planks = Math.round(along / 0.3);
  for (let k = 0; k < planks; k++) {
    const t = (k + 0.5) / planks;
    parts.push(K.part(K.rbox(0.27, 0.07, across - 0.3, 0.02, 2, "z"), wood, { p: [(t - 0.5) * along, arch(t), 0], r: [0, 0, Math.cos(Math.PI * t) * -0.12] }));
  }
  for (const side of [-1, 1]) {
    const z = side * (across / 2 - 0.2);
    const posts = Math.max(2, Math.round(along / 0.9) + 1);
    const top: V3[] = [];
    for (let k = 0; k < posts; k++) {
      const t = k / (posts - 1);
      const x = (t - 0.5) * (along - 0.2);
      parts.push(K.part(K.rbox(0.1, 0.52, 0.1, 0.025, 2, "y"), dark, { p: [x, arch(t) + 0.24, z] }));
      top.push([x, arch(t) + 0.5, z]);
    }
    parts.push(K.part(K.tube(top, 0.04, 24, 8), dark));
  }
  const g = K.group(parts);
  if (b.axis === "z") g.rotation.y = Math.PI / 2;
  g.position.set((x0 + x1) / 2, b.y, (z0 + z1) / 2);
  return g;
}

/** Log steps across an incline's slope. */
export function buildRampSteps(r: Ramp): THREE.Group {
  const [x0, z0, x1, z1] = r.rect;
  const log = M.wood("#9c6b43", "bold", 0.8);
  const parts: THREE.Object3D[] = [];
  const ns = r.up === "n" || r.up === "s";
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    const z = r.up === "n" ? z1 - (z1 - z0) * t : r.up === "s" ? z0 + (z1 - z0) * t : (z0 + z1) / 2;
    const x = r.up === "e" ? x0 + (x1 - x0) * t : r.up === "w" ? x1 - (x1 - x0) * t : (x0 + x1) / 2;
    const y = r.low + (r.high - r.low) * rampRise(r, x, z);
    const a: V3 = ns ? [x0 + 0.12, y + 0.04, z] : [x, y + 0.04, z0 + 0.12];
    const b: V3 = ns ? [x1 - 0.12, y + 0.04, z] : [x, y + 0.04, z1 - 0.12];
    parts.push(K.part(K.rod(a, b, 0.065, 10), log));
  }
  return K.group(parts);
}

export { windowLight };
