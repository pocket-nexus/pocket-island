// Modelling kit. Every piece of furniture is built from these soft shapes:
// rounded boxes, cushions, turned profiles, tubes and extrusions. Units are
// tiles (one tile is one world unit), Y up, the item's front faces +Z.
//
// All geometry gets world-scaled box-projected UVs, so a grain or a weave has
// the same density on a stool and on a wardrobe.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type V3 = [number, number, number];
export type Axis = "x" | "y" | "z";

/** Box-projected UVs, `scale` tiles per texture repeat, grain along `along`. */
export function boxUV(geo: THREE.BufferGeometry, scale = 1, along: Axis = "x"): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / scale, y = pos.getY(i) / scale, z = pos.getZ(i) / scale;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u: number, v: number;
    if (ny >= nx && ny >= nz) [u, v] = along === "z" ? [z, x] : [x, z];
    else if (nz >= nx) [u, v] = along === "y" ? [y, x] : [x, y];
    else [u, v] = along === "y" ? [y, z] : [z, y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * UVs projected straight on, normalised to a w×h picture: `facing` "z" maps
 * x and y (a poster, a clock face), "y" maps x and z (a rug seen from above).
 */
export function planarUV(geo: THREE.BufferGeometry, w: number, h: number, facing: "y" | "z" = "z"): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / w + 0.5;
    uv[i * 2 + 1] = facing === "z" ? pos.getY(i) / h + 0.5 : 0.5 - pos.getZ(i) / h;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Average the normals of coincident vertices, closing the seams of a sphere or lathe. */
export function weld(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? new THREE.Vector3();
    s.x += nor.getX(i); s.y += nor.getY(i); s.z += nor.getZ(i);
    sums.set(k, s);
  }
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!.clone().normalize();
    nor.setXYZ(i, s.x, s.y, s.z);
  }
  nor.needsUpdate = true;
  return geo;
}

/** A box with every edge rounded by `r`. */
export function rbox(w: number, h: number, d: number, r = 0.04, seg = 4, along: Axis = "x"): THREE.BufferGeometry {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return boxUV(new RoundedBoxGeometry(w, h, d, seg, rr), 1, along);
}

/**
 * A cushion: a superellipsoid, boxy at `e` near 0 and round at 1, with its
 * rim pinched in by `pinch` like a stuffed pillow.
 */
export function soft(w: number, h: number, d: number, e = 0.35, pinch = 0, seg = 40): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) {
    const x = f(p.getX(i)), y = f(p.getY(i)), z = f(p.getZ(i));
    const rim = Math.pow(Math.max(Math.abs(x), Math.abs(z)), 4);
    p.setXYZ(i, (x * w) / 2, ((y * h) / 2) * (1 - pinch * rim), (z * d) / 2);
  }
  weld(g);
  return boxUV(g, 1);
}

/** A turned shape from a profile of [radius, height] points, bottom to top. */
export function lathe(profile: Array<[number, number]>, seg = 40): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
  weld(g);
  return boxUV(g, 1, "y");
}

/** Points along a quarter arc, for rounding a profile's corner. */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 5): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** A cylinder standing on y = 0 with rounded rims: a puck, a seat, a pot. */
export function puck(r: number, h: number, bevel = 0.03, seg = 40, top = r): THREE.BufferGeometry {
  const b = Math.min(bevel, h / 2, r / 2, top / 2);
  const profile: Array<[number, number]> = [
    [0, 0],
    ...arc(r - b, b, b, -Math.PI / 2, 0),
    ...arc(top - b, h - b, b, 0, Math.PI / 2),
    [0, h],
  ];
  return lathe(profile, seg);
}

/** A tube through `points` with round end caps. */
export function tube(points: V3[], radius: number, seg = 48, radial = 12, smooth = true): THREE.BufferGeometry {
  const curve = smooth
    ? new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal")
    : new THREE.CurvePath<THREE.Vector3>();
  if (!smooth) {
    for (let i = 0; i < points.length - 1; i++) {
      (curve as THREE.CurvePath<THREE.Vector3>).add(new THREE.LineCurve3(new THREE.Vector3(...points[i]!), new THREE.Vector3(...points[i + 1]!)));
    }
  }
  const g = new THREE.TubeGeometry(curve as THREE.Curve<THREE.Vector3>, seg, radius, radial, false);
  return boxUV(g, 1, "y");
}

/** A straight round rod from a to b. */
export function rod(a: V3, b: V3, radius: number, radial = 14): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.0001, len), 4, radial);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return boxUV(g, 1, "y");
}

/** A flat shape pushed out along Z by `depth`, centred on z = 0, with bevelled edges. */
export function extrude(shape: THREE.Shape, depth: number, bevel = 0.02, curve = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 4, curveSegments: curve,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return boxUV(g, 1);
}

/** A rounded rectangle as a Shape, centred on (cx, cy). */
export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** An arch-topped panel: a rectangle whose top is a half circle. */
export function archShape(w: number, h: number, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, cy);
  s.lineTo(r, cy);
  s.lineTo(r, cy + h - r);
  s.absarc(0, cy + h - r, r, 0, Math.PI, false);
  s.lineTo(-r, cy);
  return s;
}

/**
 * A leaf: a blade `len` long and `wid` wide, folded along its midrib by
 * `fold` and arched by `bend`. It grows from the origin along +Z.
 */
export function leafGeometry(len: number, wid: number, fold = 0.25, bend = 0.3, shape: "oval" | "long" | "heart" = "oval"): THREE.BufferGeometry {
  const nu = 12, nv = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu;
    let half = Math.sin(Math.PI * Math.pow(t, shape === "heart" ? 0.7 : 0.85)) * (wid / 2);
    if (shape === "long") half *= 0.55 + 0.45 * Math.sin(Math.PI * t);
    for (let j = 0; j <= nv; j++) {
      const s = (j / nv) * 2 - 1;
      const x = s * half;
      const y = fold * Math.abs(s) * half + bend * t * t * len;
      const z = t * len;
      pos.push(x, y, z);
      uv.push(j / nv, t);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface At {
  p?: V3;
  r?: V3;
  s?: number | V3;
}

/** A mesh that casts and receives shadows, placed by `at`. */
export function part(geo: THREE.BufferGeometry, mat: THREE.Material, at: At = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  place(m, at);
  return m;
}

export function place<T extends THREE.Object3D>(o: T, at: At): T {
  if (at.p) o.position.set(...at.p);
  if (at.r) o.rotation.set(...at.r);
  if (at.s !== undefined) {
    if (typeof at.s === "number") o.scale.setScalar(at.s);
    else o.scale.set(...at.s);
  }
  return o;
}

export function group(children: THREE.Object3D[], at: At = {}): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return place(g, at);
}

/** The same object at each position: legs, knobs, slats. */
export function each(positions: V3[], make: (p: V3, i: number) => THREE.Object3D): THREE.Object3D[] {
  return positions.map((p, i) => make(p, i));
}

/** Four positions at the corners of a w×d rectangle at height y. */
export function corners(w: number, d: number, y = 0): V3[] {
  return [[-w / 2, y, -d / 2], [w / 2, y, -d / 2], [-w / 2, y, d / 2], [w / 2, y, d / 2]];
}

export const TAU = Math.PI * 2;
