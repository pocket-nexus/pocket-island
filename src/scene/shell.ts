// The room itself: a floor, three walls with skirting, and the cut tops of
// the walls. The front is open toward the camera, as on the island. The room
// is centred on the origin: x from -w/2 to w/2, z from -d/2 (back wall) to
// d/2 (the open front).

import * as THREE from "three";
import { WALL_HEIGHT } from "../core/rules.ts";
import type { FinishDef } from "../furniture/types.ts";
import { rbox } from "./kit.ts";
import { canvas, toTexture } from "./textures.ts";

const WALL_T = 0.32;
const SLAB = 0.35;
const SKIRT_H = 0.13;
const SKIRT_D = 0.05;
/** The mat inside the doorway, where the player comes in and goes out. */
export const DOORMAT = { w: 0.9, d: 0.55, h: 0.025, color: "#c9774f", border: "#a85a39" } as const;

interface Painted {
  map: THREE.Texture;
  bump: THREE.Texture | null;
}

const painted = new Map<string, Painted>();

/** A finish's colour and height textures, drawn once. */
export function finishTextures(def: FinishDef): Painted {
  let p = painted.get(def.id);
  if (p) return p;
  const w = Math.round(def.span[0] * def.density);
  const h = Math.round(def.span[1] * def.density);
  const [c, g] = canvas(w, h);
  def.draw(g, w, h);
  const map = toTexture(c);
  let bump: THREE.Texture | null = null;
  if (def.bump) {
    const [bc, bg] = canvas(w, h);
    def.bump(bg, w, h);
    bump = toTexture(bc, { color: false });
  }
  p = { map, bump };
  painted.set(def.id, p);
  return p;
}

export class Shell {
  readonly group = new THREE.Group();
  private floorMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  private wallMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private sideWallMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private capMat = new THREE.MeshStandardMaterial({ color: 0x6e4a32, roughness: 0.7 });
  private skirtMat = new THREE.MeshStandardMaterial({ color: 0xa7744a, roughness: 0.5 });
  private slabMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9 });
  private matMat = new THREE.MeshStandardMaterial({ color: DOORMAT.border, roughness: 0.95 });
  private matInner = new THREE.MeshStandardMaterial({ color: DOORMAT.color, roughness: 0.95 });
  private w = 6;
  private d = 6;
  private wallpaper: FinishDef | null = null;
  private flooring: FinishDef | null = null;
  /** Meshes that pointer rays hit to find the floor and walls. */
  floor!: THREE.Mesh;
  walls!: { back: THREE.Mesh; left: THREE.Mesh; right: THREE.Mesh };

  constructor() {
    this.group.name = "shell";
  }

  build(w: number, d: number): void {
    this.w = w;
    this.d = d;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    const H = WALL_HEIGHT;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = "floor";
    this.floor = floor;

    const slab = new THREE.Mesh(rbox(w + WALL_T * 2, SLAB, d + WALL_T, 0.03, 2), this.slabMat);
    slab.position.set(0, -SLAB / 2 - 0.001, -WALL_T / 2);
    slab.receiveShadow = true;

    const plane = (len: number, mat: THREE.Material) => {
      const g = new THREE.PlaneGeometry(len, H);
      // U runs in tiles along the wall, V from floor (0) to top (1).
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      return m;
    };
    const back = plane(w, this.wallMat);
    back.position.set(0, H / 2, -d / 2);
    back.name = "wall:back";
    const left = plane(d, this.sideWallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-w / 2, H / 2, 0);
    left.name = "wall:left";
    const right = plane(d, this.sideWallMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(w / 2, H / 2, 0);
    right.name = "wall:right";
    this.walls = { back, left, right };

    // Wall bodies: the cut tops and front ends are what show.
    const body = (sx: number, sz: number, x: number, z: number) => {
      const m = new THREE.Mesh(rbox(sx, H + 0.02, sz, 0.035, 2), this.capMat);
      m.position.set(x, H / 2 - 0.01, z);
      m.receiveShadow = true;
      return m;
    };
    const backBody = body(w + WALL_T * 2, WALL_T, 0, -d / 2 - WALL_T / 2 - 0.002);
    const leftBody = body(WALL_T, d + WALL_T, -w / 2 - WALL_T / 2 - 0.002, -WALL_T / 2);
    const rightBody = body(WALL_T, d + WALL_T, w / 2 + WALL_T / 2 + 0.002, -WALL_T / 2);

    const skirt = (len: number) => {
      const m = new THREE.Mesh(rbox(len, SKIRT_H, SKIRT_D, 0.015, 2), this.skirtMat);
      m.castShadow = false;
      m.receiveShadow = true;
      return m;
    };
    const sb = skirt(w);
    sb.position.set(0, SKIRT_H / 2, -d / 2 + SKIRT_D / 2);
    const sl = skirt(d);
    sl.rotation.y = Math.PI / 2;
    sl.position.set(-w / 2 + SKIRT_D / 2, SKIRT_H / 2, 0);
    const sr = skirt(d);
    sr.rotation.y = -Math.PI / 2;
    sr.position.set(w / 2 - SKIRT_D / 2, SKIRT_H / 2, 0);

    // The doormat on the doorway's tile (src/core/rules.ts doorRect), against the open front.
    const mat = new THREE.Mesh(rbox(DOORMAT.w, DOORMAT.h, DOORMAT.d, 0.012, 2), this.matMat);
    mat.position.set(0, DOORMAT.h / 2, d / 2 - DOORMAT.d / 2 - 0.08);
    mat.receiveShadow = true;
    const inner = new THREE.Mesh(rbox(DOORMAT.w - 0.16, DOORMAT.h + 0.004, DOORMAT.d - 0.16, 0.01, 2), this.matInner);
    inner.position.copy(mat.position);
    inner.receiveShadow = true;

    this.group.add(floor, slab, back, left, right, backBody, leftBody, rightBody, sb, sl, sr, mat, inner);
    if (this.wallpaper) this.setWallpaper(this.wallpaper);
    if (this.flooring) this.setFlooring(this.flooring);
  }

  setWallpaper(def: FinishDef): void {
    this.wallpaper = def;
    const t = finishTextures(def);
    for (const [mat, len] of [[this.wallMat, this.w], [this.sideWallMat, this.d]] as const) {
      // The texture repeats per tile along U through the plane's UVs.
      mat.map = t.map;
      mat.bumpMap = t.bump;
      mat.bumpScale = def.bumpScale ?? 1;
      mat.roughness = def.roughness;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      void len;
    }
    this.capMat.color.set(def.cap ?? "#6e4a32");
    this.skirtMat.color.set(def.skirting ?? "#a7744a");
  }

  setFlooring(def: FinishDef): void {
    this.flooring = def;
    const t = finishTextures(def);
    const map = t.map.clone();
    map.repeat.set(this.w / def.span[0], this.d / def.span[1]);
    map.needsUpdate = true;
    this.floorMat.map?.dispose();
    this.floorMat.map = map;
    if (t.bump) {
      const bump = t.bump.clone();
      bump.repeat.copy(map.repeat);
      bump.needsUpdate = true;
      this.floorMat.bumpMap?.dispose();
      this.floorMat.bumpMap = bump;
      this.floorMat.bumpScale = def.bumpScale ?? 1;
    } else {
      this.floorMat.bumpMap = null;
    }
    this.floorMat.roughness = def.roughness;
    this.floorMat.needsUpdate = true;
  }
}
