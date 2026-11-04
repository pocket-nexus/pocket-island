// Where a click sent the player: dots that march along the way toward its end, and at the end a ring
// that breathes and a wave that spreads from it. The way is the corners the core has still to walk
// (src/core/game.ts `goal`); the console draws the same on its upper screen
// (programs/3ds-island/src/scene.c, draw_route).

import * as THREE from "three";
import { routeDots, type Point } from "../island/route.ts";

/** The most dots drawn. */
const DOTS = 48;
const CREAM = 0xfffcf0, CORAL = 0xf2806b;

export class RouteMarker {
  readonly group = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private wave: THREE.Mesh;
  private centre: THREE.Mesh;
  private m = new THREE.Matrix4();

  constructor() {
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
    const paint = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.dots = new THREE.InstancedMesh(flat(new THREE.CircleGeometry(0.085, 12)), paint(CREAM, 0.92), DOTS);
    this.ring = new THREE.Mesh(flat(new THREE.RingGeometry(0.31, 0.43, 40)), paint(CREAM, 0.95));
    this.wave = new THREE.Mesh(flat(new THREE.RingGeometry(0.35, 0.42, 40)), paint(CREAM, 0.7));
    this.centre = new THREE.Mesh(flat(new THREE.CircleGeometry(0.12, 20)), paint(CORAL, 1));
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
      this.m.makeTranslation(d.x + ox, ground(d.x, d.z) + 0.06, d.z + oz);
      this.dots.setMatrixAt(i, this.m);
    }
    this.dots.count = dots.length;
    this.dots.instanceMatrix.needsUpdate = true;
    const end = ahead[ahead.length - 1]!;
    const y = ground(end.x, end.z);
    const breathe = 1 + 0.12 * Math.sin(t * 5.5), wave = (t * 0.9) % 1;
    this.ring.position.set(end.x + ox, y + 0.07, end.z + oz);
    this.ring.scale.setScalar(breathe);
    this.wave.position.set(end.x + ox, y + 0.065, end.z + oz);
    this.wave.scale.setScalar(1 + 1.3 * wave);
    (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - wave) * (1 - wave);
    this.centre.position.set(end.x + ox, y + 0.075, end.z + oz);
  }
}
