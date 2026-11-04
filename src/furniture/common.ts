// Parts that many pieces share: knobs, legs, drawers, cushions, rugs,
// picture frames, plant pots, lamp shades.

import * as THREE from "three";
import * as K from "../scene/kit.ts";
import * as M from "../scene/materials.ts";
import { drawn } from "../scene/textures.ts";
import type { V3 } from "../scene/kit.ts";

export { K, M };
export type { V3 };

/** A round knob on a front, facing +Z. */
export function knob(p: V3, mat: THREE.Material, r = 0.035): THREE.Mesh {
  return K.part(K.lathe([[0, 0], [r * 0.55, 0], [r * 0.6, r * 0.5], [r, r * 0.9], [r * 0.9, r * 1.5], [0, r * 1.7]], 20), mat, { p, r: [Math.PI / 2, 0, 0] });
}

/** A bar handle on a front, facing +Z. */
export function handle(p: V3, w: number, mat: THREE.Material): THREE.Mesh {
  const r = 0.014;
  return K.part(K.tube([[-w / 2, 0, 0], [-w / 2 + 0.01, 0, 0.035], [w / 2 - 0.01, 0, 0.035], [w / 2, 0, 0]], r, 24, 10), mat, { p });
}

/** Four legs under a w×d top whose underside is at height h. */
export function legs(w: number, d: number, h: number, mat: THREE.Material, thick = 0.07, inset = 0.06, taper = 0.75): THREE.Object3D[] {
  return K.corners(w - inset * 2 - thick, d - inset * 2 - thick).map(([x, , z]) =>
    K.part(K.lathe([[0, 0], [thick * 0.5 * taper, 0], [thick * 0.5, h * 0.9], [thick * 0.55, h], [0, h]], 16), mat, { p: [x, 0, z] }));
}

/** Square legs, rounded. */
export function blockLegs(w: number, d: number, h: number, mat: THREE.Material, thick = 0.08, inset = 0.04): THREE.Object3D[] {
  return K.corners(w - inset * 2 - thick, d - inset * 2 - thick).map(([x, , z]) =>
    K.part(K.rbox(thick, h, thick, 0.02, 2, "y"), mat, { p: [x, h / 2, z] }));
}

/** A drawer front with a knob, facing +Z, centred on p. */
export function drawer(p: V3, w: number, h: number, front: THREE.Material, knobMat: THREE.Material): THREE.Object3D[] {
  return [
    K.part(K.rbox(w, h, 0.04, 0.015, 2), front, { p }),
    knob([p[0], p[1], p[2] + 0.02], knobMat, 0.03),
  ];
}

/** A cushion seat or back, puffy, centred on p. */
export function cushion(p: V3, w: number, h: number, d: number, mat: THREE.Material, r: V3 = [0, 0, 0], puff = 0.28, pinch = 0.25): THREE.Mesh {
  return K.part(K.soft(w, h, d, puff, pinch, 36), mat, { p, r });
}

/** A rug lying on the floor: `shape` is drawn on a w×d texture. */
export function rug(key: string, w: number, d: number, round: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, thick = 0.035): THREE.Object3D {
  const px = 220;
  const tex = drawn(`rug:${key}`, Math.round(w * px), Math.round(d * px), draw);
  const shape = round >= 0.5 ? ellipseShape(w / 2 - 0.04, d / 2 - 0.04) : K.roundedRectShape(w - 0.08, d - 0.08, round);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.03, bevelSegments: 3, curveSegments: 48 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.01, 0);
  geo.computeVertexNormals();
  K.planarUV(geo, w, -d, "y");
  const mesh = K.part(geo, M.printedCloth(key, tex), {});
  mesh.castShadow = false;
  return K.group([mesh]);
}

export function ellipseShape(rx: number, ry: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}

/** A picture in a frame on the wall: frame w×h, back on z = 0. */
export function framed(key: string, w: number, h: number, frameMat: THREE.Material, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, border = 0.06, depth = 0.05): THREE.Object3D {
  const tex = drawn(`pic:${key}`, Math.round(w * 256), Math.round(h * 256), draw);
  const outer = K.roundedRectShape(w, h, 0.03);
  const hole = K.roundedRectShape(w - border * 2, h - border * 2, 0.01);
  outer.holes.push(hole as unknown as THREE.Path);
  const frame = K.part(K.extrude(outer, depth, 0.012), frameMat, { p: [0, 0, depth / 2] });
  const picGeo = new THREE.PlaneGeometry(w - border * 2 + 0.01, h - border * 2 + 0.01);
  const pic = K.part(picGeo, M.printed(key, tex), { p: [0, 0, 0.012] });
  return K.group([frame, pic]);
}

/** A tapered pot with a rim and soil, standing on y = 0; returns the pot and the soil's height. */
export function pot(r: number, h: number, mat: THREE.Material, soil = "#6b4a33"): { parts: THREE.Object3D[]; top: number } {
  const body = K.part(K.lathe([[0, 0], [r * 0.72, 0], [r * 0.78, 0.02], [r * 0.95, h * 0.8], [r * 0.96, h * 0.82], [r * 1.05, h * 0.84], [r * 1.06, h], [r * 0.92, h], [r * 0.9, h * 0.9], [0, h * 0.9]], 32), mat);
  const dirt = K.part(K.lathe([[0, h * 0.84], [r * 0.9, h * 0.84], [r * 0.9, h * 0.88], [0, h * 0.9]], 24), M.paint(soil, 0.95));
  return { parts: [body, dirt], top: h * 0.88 };
}

/** A fan of leaves from a point: `count` leaves, each `len` long, rising at `rise` radians. */
export function leaves(at: V3, count: number, len: number, wid: number, mat: THREE.Material, rise = 0.9, seed = 1, shape: "oval" | "long" | "heart" = "oval", spread = 1): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * Math.PI * 2 + r() * 0.5;
    const l = len * (0.75 + r() * 0.4);
    const g = K.leafGeometry(l, wid * (0.8 + r() * 0.35), 0.28, 0.25 + r() * 0.2, shape);
    const m = K.part(g, mat, {});
    m.rotation.order = "YXZ";
    m.rotation.set(-(rise + (r() - 0.5) * 0.4) * spread, yaw, 0);
    m.position.set(...at);
    out.push(m);
  }
  return out;
}

/** Light seen through a coloured shade: the lamp's glow taking on the cloth's colour. */
function tinted(glow: string, cloth: string): string {
  return "#" + new THREE.Color(glow).lerp(new THREE.Color(cloth), 0.55).getHexString();
}

/**
 * A cone or drum lamp shade, open at both ends: cloth outside that lets a
 * little light through, and a lit inside.
 */
export function shade(rBottom: number, rTop: number, h: number, color: string, glowColor = "#ffe2a8", strength = 0.9): THREE.Object3D {
  const outerGeo = new THREE.CylinderGeometry(rTop, rBottom, h, 40, 1, true);
  const innerGeo = new THREE.CylinderGeometry(rTop * 0.985, rBottom * 0.985, h * 0.99, 40, 1, true);
  const outer = K.part(outerGeo, M.glow(tinted(glowColor, color), color, strength * 0.8, 0.85));
  const innerMat = M.glow(glowColor, "#fff6e0", strength * 2.8, 0.9);
  innerMat.side = THREE.BackSide;
  const inner = K.part(innerGeo, innerMat);
  inner.castShadow = false;
  return K.group([outer, inner]);
}

/** A dome shade from a lathe profile: lit inside, cloth or glass outside. */
export function dome(profile: Array<[number, number]>, color: string, glowColor = "#ffe2a8", strength = 0.9, outerMat?: THREE.Material): THREE.Object3D {
  const geo = K.lathe(profile, 40);
  const outer = K.part(geo, outerMat ?? M.glow(tinted(glowColor, color), color, strength * 0.8, 0.8));
  const innerMat = M.glow(glowColor, "#fff6e0", strength * 2.8, 0.9);
  innerMat.side = THREE.BackSide;
  const inner = K.part(geo, innerMat);
  inner.castShadow = false;
  return K.group([outer, inner]);
}

/** A small glowing bulb. */
export function bulb(p: V3, r: number, color = "#ffe2a8", strength = 3): THREE.Mesh {
  const m = K.part(new THREE.SphereGeometry(r, 20, 14), M.glow(color, "#fff8e8", strength, 0.3), { p });
  m.castShadow = false;
  return m;
}

/** A book standing up: w thick, h tall, d deep, spine facing +Z. */
export function book(p: V3, w: number, h: number, d: number, cover: string, tilt = 0): THREE.Object3D {
  const coverMat = M.paint(cover, 0.6);
  const pages = M.paint("#fbf5e6", 0.8);
  return K.group([
    K.part(K.rbox(w, h, d, 0.012, 2), coverMat, {}),
    K.part(K.rbox(w * 0.82, h * 0.94, d * 0.97, 0.004, 1), pages, { p: [0, 0, -0.012] }),
  ], { p, r: [0, 0, tilt] });
}

