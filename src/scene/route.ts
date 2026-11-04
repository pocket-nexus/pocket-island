// Where a click sent the player: dots that march along the way toward its end, and at the end a ring
// that breathes and a wave that spreads from it. The way is the corners the core has still to walk
// (src/core/game.ts `goal`); the console draws the same on its upper screen
// (programs/3ds-island/src/scene.c, draw_route).

import * as THREE from "three";
import { routeDots, type Point } from "../island/route.ts";

/** The most dots drawn. */
const DOTS = 48;

/**
 * How the marker looks, which the console draws by too (the export hands it to its pack, tools/cook.ts
 * VIEW): its colours; each dot's radius, lift off the ground and strength; the ring at the end (inner
 * and outer radius, lift, strength, how much it breathes and how fast, radians a second); the wave
 * that spreads from it (radii, lift, strength at its start, how far it grows, waves a second); the
 * coral dot in the middle.
 */
export const MARKER = {
  cream: "#fffcf0", coral: "#f2806b",
  dot: { r: 0.085, lift: 0.06, alpha: 0.92 },
  ring: { inner: 0.31, outer: 0.43, lift: 0.07, alpha: 0.95, breathe: 0.12, rate: 5.5 },
  wave: { inner: 0.35, outer: 0.42, lift: 0.065, alpha: 0.7, grow: 1.3, rate: 0.9 },
  centre: { r: 0.12, lift: 0.075 },
} as const;

export class RouteMarker {
  readonly group = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private wave: THREE.Mesh;
  private centre: THREE.Mesh;
  private m = new THREE.Matrix4();

  constructor() {
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
    const paint = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const { cream, coral, dot, ring, wave, centre } = MARKER;
    this.dots = new THREE.InstancedMesh(flat(new THREE.CircleGeometry(dot.r, 12)), paint(cream, dot.alpha), DOTS);
    this.ring = new THREE.Mesh(flat(new THREE.RingGeometry(ring.inner, ring.outer, 40)), paint(cream, ring.alpha));
    this.wave = new THREE.Mesh(flat(new THREE.RingGeometry(wave.inner, wave.outer, 40)), paint(cream, wave.alpha));
    this.centre = new THREE.Mesh(flat(new THREE.CircleGeometry(centre.r, 20)), paint(coral, 1));
    for (const o of [this.dots, this.ring, this.wave, this.centre]) {
      o.renderOrder = 3;
      o.frustumCulled = false;
    }
    this.group.name = "route";
    this.group.add(this.dots, this.ring, this.wave, this.centre);
    this.group.visible = false;
  }

  /**
   * The marker for a walk from `from` through the corners `ahead` (the place's tiles), at time `t`.
   * `ground(x, z)` is the height of the ground there; (`ox`, `oz`) takes the place's tiles to the scene.
   */
  update(from: Point, ahead: readonly Point[], t: number, ground: (x: number, z: number) => number, ox = 0, oz = 0): void {
    this.group.visible = ahead.length > 0;
    if (!ahead.length) return;
    const dots = routeDots(from, ahead, t, { most: DOTS });
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      this.m.makeTranslation(d.x + ox, ground(d.x, d.z) + MARKER.dot.lift, d.z + oz);
      this.dots.setMatrixAt(i, this.m);
    }
    this.dots.count = dots.length;
    this.dots.instanceMatrix.needsUpdate = true;
    const end = ahead[ahead.length - 1]!;
    const y = ground(end.x, end.z);
    const { ring, wave: w, centre } = MARKER;
    const breathe = 1 + ring.breathe * Math.sin(t * ring.rate), wave = (t * w.rate) % 1;
    this.ring.position.set(end.x + ox, y + ring.lift, end.z + oz);
    this.ring.scale.setScalar(breathe);
    this.wave.position.set(end.x + ox, y + w.lift, end.z + oz);
    this.wave.scale.setScalar(1 + w.grow * wave);
    (this.wave.material as THREE.MeshBasicMaterial).opacity = w.alpha * (1 - wave) * (1 - wave);
    this.centre.position.set(end.x + ox, y + centre.lift, end.z + oz);
  }
}
