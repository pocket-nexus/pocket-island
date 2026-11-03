// The camera. Like the island's, it looks into the room from the open
// front, a little from above, through a long lens. Decorating raises it
// toward a top-down view. The visitor may turn it a little, tilt it, zoom
// toward a point and pan; every offset eases in, and the framing fits the
// room to any viewport (after Pocket Studio's rig: a pose names the
// rectangle that must stay in view and the distance follows).

import * as THREE from "three";
import { WALL_HEIGHT } from "../core/rules.ts";

export type View = "view" | "decorate";

interface Offsets {
  yaw: number;
  pitch: number;
  zoom: number;
  pan: THREE.Vector3;
}

const FOV = 26;
const clamp = THREE.MathUtils.clamp;

const POSES: Record<View, { pitch: number; yawLimit: number; pitchLimit: [number, number]; zoom: [number, number] }> = {
  view: { pitch: 0.7, yawLimit: 0.5, pitchLimit: [-0.28, 0.5], zoom: [0.45, 1.25] },
  decorate: { pitch: 1.0, yawLimit: 0.6, pitchLimit: [-0.45, 0.3], zoom: [0.5, 1.3] },
};

export class Rig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private aspect = 1;
  private w = 6;
  private d = 6;
  view: View = "view";
  private goal: Offsets = { yaw: 0, pitch: 0, zoom: 1, pan: new THREE.Vector3() };
  private shown: Offsets = { yaw: 0, pitch: 0, zoom: 1, pan: new THREE.Vector3() };
  private basePitch = POSES.view.pitch;
  private sway = new THREE.Vector2();
  private swayGoal = new THREE.Vector2();
  swayAmount = 0.01;

  resize(aspect: number): void {
    this.aspect = aspect;
    this.apply();
  }

  setRoom(w: number, d: number): void {
    this.w = w;
    this.d = d;
    this.goal.pan.set(0, 0, 0);
    this.apply();
  }

  setView(view: View): void {
    this.view = view;
    const pose = POSES[view];
    this.goal.yaw = clamp(this.goal.yaw, -pose.yawLimit, pose.yawLimit);
    this.goal.pitch = 0;
    this.goal.zoom = clamp(this.goal.zoom, pose.zoom[0], pose.zoom[1]);
  }

  reset(): void {
    this.goal = { yaw: 0, pitch: 0, zoom: 1, pan: new THREE.Vector3() };
  }

  pointer(x: number, y: number): void {
    this.swayGoal.set(x, y);
  }

  orbit(dx: number, dy: number): void {
    const pose = POSES[this.view];
    this.goal.yaw = clamp(this.goal.yaw - dx * 0.004, -pose.yawLimit, pose.yawLimit);
    this.goal.pitch = clamp(this.goal.pitch + dy * 0.003, pose.pitchLimit[0], pose.pitchLimit[1]);
  }

  /** Slide the view by a drag of (dx, dy) pixels, across the floor. */
  pan(dx: number, dy: number): void {
    const dist = this.camera.position.distanceTo(this.target());
    const k = (2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / Math.max(1, innerHeight);
    const yaw = this.shown.yaw;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.goal.pan.addScaledVector(right, -dx * k).addScaledVector(forward, dy * k);
    this.limitPan();
  }

  /** Zoom by `factor` (below 1 is closer) toward the floor point under (x, y) in -1..1. */
  zoom(factor: number, x: number, y: number): void {
    const pose = POSES[this.view];
    const next = clamp(this.goal.zoom * factor, pose.zoom[0], pose.zoom[1]);
    if (next === this.goal.zoom) return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), new THREE.Vector3());
    if (hit && next < this.goal.zoom) {
      const centre = this.target();
      this.goal.pan.addScaledVector(hit.sub(centre).setY(0), 1 - next / this.goal.zoom);
    } else if (next > this.goal.zoom) {
      this.goal.pan.multiplyScalar(next >= 1 ? 0.5 : Math.max(0, (1 - next) / (1 - this.goal.zoom)));
    }
    this.goal.zoom = next;
    this.limitPan();
  }

  private limitPan(): void {
    const p = this.goal.pan;
    p.x = clamp(p.x, -this.w * 0.45, this.w * 0.45);
    p.z = clamp(p.z, -this.d * 0.45, this.d * 0.45);
  }

  /** Ease toward the goal; true while the camera is still moving. */
  update(dt: number): boolean {
    const q = 1 - Math.exp(-dt / 120);
    const k = 1 - Math.exp(-dt / 260);
    const before = this.camera.matrixWorld.clone();
    this.basePitch += (POSES[this.view].pitch - this.basePitch) * (1 - Math.exp(-dt / 160));
    this.shown.yaw += (this.goal.yaw - this.shown.yaw) * q;
    this.shown.pitch += (this.goal.pitch - this.shown.pitch) * q;
    this.shown.zoom += (this.goal.zoom - this.shown.zoom) * q;
    this.shown.pan.lerp(this.goal.pan, q);
    this.sway.lerp(this.swayGoal, k);
    // Settle exactly, so a still view stays still (shadows and AO are then left alone).
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
    if (near(this.basePitch, POSES[this.view].pitch)) this.basePitch = POSES[this.view].pitch;
    if (near(this.shown.yaw, this.goal.yaw)) this.shown.yaw = this.goal.yaw;
    if (near(this.shown.pitch, this.goal.pitch)) this.shown.pitch = this.goal.pitch;
    if (near(this.shown.zoom, this.goal.zoom)) this.shown.zoom = this.goal.zoom;
    if (this.shown.pan.distanceToSquared(this.goal.pan) < 1e-10) this.shown.pan.copy(this.goal.pan);
    if (this.sway.distanceToSquared(this.swayGoal) < 1e-10) this.sway.copy(this.swayGoal);
    this.apply();
    this.camera.updateMatrixWorld();
    return !before.equals(this.camera.matrixWorld);
  }

  /** 0 in the view, 1 while decorating: the framing blends between the two. */
  private get blend(): number {
    return Math.min(1, Math.max(0, (this.basePitch - POSES.view.pitch) / (POSES.decorate.pitch - POSES.view.pitch)));
  }

  private target(): THREE.Vector3 {
    const b = this.blend;
    const lift = WALL_HEIGHT * (0.3 - 0.2 * b);
    // While decorating the toolbar covers the bottom: the room sits a little higher.
    const z = this.d * (-0.04 + 0.1 * b);
    return new THREE.Vector3(0, lift, z).add(this.shown.pan);
  }

  private apply(): void {
    const pitch = clamp(this.basePitch + this.shown.pitch, 0.15, 1.45);
    const yaw = this.shown.yaw;
    // The rectangle that must show at the target: the floor's width, and its
    // depth and the walls as seen from this pitch.
    const b = this.blend;
    const fitW = this.w + 1.6 + 1.2 * b;
    const fitH = this.d * Math.sin(pitch) + WALL_HEIGHT * Math.cos(pitch) + 1.0 + 2.2 * b;
    const half = THREE.MathUtils.degToRad(FOV / 2);
    const dist = Math.max(fitH / 2 / Math.tan(half), fitW / 2 / (Math.tan(half) * this.aspect)) * this.shown.zoom;
    const target = this.target();
    const arm = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    const forward = arm.clone().normalize().negate();
    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward);
    const reach = dist * this.swayAmount;
    this.camera.position.copy(target).add(arm).addScaledVector(right, this.sway.x * reach).addScaledVector(up, -this.sway.y * reach * 0.6);
    this.camera.lookAt(target);
    this.camera.fov = FOV;
    this.camera.aspect = this.aspect;
    this.camera.near = Math.max(0.1, dist * 0.2);
    this.camera.far = dist * 3 + 20;
    this.camera.updateProjectionMatrix();
  }
}
