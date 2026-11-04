// The camera. Like the island's, it looks into the room from the open
// front, a little from above, through a long lens. Decorating raises it
// toward a top-down view. The visitor may turn it a little, tilt it, zoom
// toward a point and pan; every offset eases in, and the framing fits the
// room to any viewport (after Pocket Studio's rig: a pose names the
// rectangle that must stay in view and the distance follows).

import * as THREE from "three";
import { WALL_HEIGHT } from "../core/rules.ts";

export type View = "view" | "decorate" | "outdoors";

interface Offsets {
  yaw: number;
  pitch: number;
  zoom: number;
  pan: THREE.Vector3;
}

const clamp = THREE.MathUtils.clamp;

type Pose = { pitch: number; yawLimit: number; pitchLimit: readonly [number, number]; zoom: readonly [number, number] };

/**
 * The camera's numbers, which the console's upper screen draws by too (the export hands them to its
 * pack, tools/cook.ts VIEW): the lens; each pose's pitch and how far the visitor may turn, tilt and
 * zoom it; the pitch it never passes; outdoors the span of ground across (the least, and the least
 * aspect it is worked out for) and the point over the player it looks at; in the room the margins it fits and the point it looks at (a
 * share of the walls' height up, of the depth back); the near and far planes; and the time
 * constants (ms) it eases toward its goal with, and after the player.
 */
export const RIG = {
  fov: 26,
  poses: {
    view: { pitch: 0.7, yawLimit: 0.5, pitchLimit: [-0.28, 0.5], zoom: [0.45, 1.25] },
    decorate: { pitch: 1.0, yawLimit: 0.6, pitchLimit: [-0.45, 0.3], zoom: [0.5, 1.3] },
    // Outdoors the camera faces north over the player's shoulder, as island cameras do, and turns
    // only a little.
    outdoors: { pitch: 0.74, yawLimit: 0.3, pitchLimit: [-0.3, 0.35], zoom: [0.6, 1.45] },
  } satisfies Record<View, Pose>,
  pitchRange: [0.15, 1.45],
  outdoors: { span: 19, least: 9, aspect: 1.2, up: 0.55, back: 0.6 },
  room: { fitW: 1.6, fitH: 1.0, lift: 0.3, depth: -0.04 },
  planes: { near: 0.2, nearLeast: 0.1, far: 3, farMore: 20 },
  easeMs: 120,
  followMs: 180,
} as const;

const FOV = RIG.fov;
const POSES: Record<View, Pose> = RIG.poses;

export class Rig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private aspect = 1;
  private w = 6;
  private d = 6;
  view: View = "view";
  private goal: Offsets = { yaw: 0, pitch: 0, zoom: 1, pan: new THREE.Vector3() };
  private shown: Offsets = { yaw: 0, pitch: 0, zoom: 1, pan: new THREE.Vector3() };
  private basePitch = POSES.view.pitch;
  /** Outdoors: the point the camera follows, and where it is shown (eased). */
  private follow: THREE.Vector3 | null = null;
  private followShown = new THREE.Vector3();
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

  /** How far the view has turned from facing north (into the room), radians. */
  get yaw(): number {
    return this.shown.yaw;
  }

  /** Follow `point` outdoors (null indoors). `snap` puts the camera there at once. */
  setFollow(point: THREE.Vector3 | null, snap = false): void {
    this.follow = point ? point.clone() : null;
    if (point && snap) this.followShown.copy(point);
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
    if (this.view === "outdoors") {
      p.set(0, 0, 0);
      return;
    }
    p.x = clamp(p.x, -this.w * 0.45, this.w * 0.45);
    p.z = clamp(p.z, -this.d * 0.45, this.d * 0.45);
  }

  /** Ease toward the goal; true while the camera is still moving. */
  update(dt: number): boolean {
    const q = 1 - Math.exp(-dt / RIG.easeMs);
    const k = 1 - Math.exp(-dt / 260);
    const before = this.camera.matrixWorld.clone();
    this.basePitch += (POSES[this.view].pitch - this.basePitch) * (1 - Math.exp(-dt / 160));
    this.shown.yaw += (this.goal.yaw - this.shown.yaw) * q;
    this.shown.pitch += (this.goal.pitch - this.shown.pitch) * q;
    this.shown.zoom += (this.goal.zoom - this.shown.zoom) * q;
    this.shown.pan.lerp(this.goal.pan, q);
    this.sway.lerp(this.swayGoal, k);
    if (this.follow) {
      this.followShown.lerp(this.follow, 1 - Math.exp(-dt / RIG.followMs));
      if (this.followShown.distanceToSquared(this.follow) < 1e-8) this.followShown.copy(this.follow);
    }
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
    if (this.view === "outdoors") return 0;
    return Math.min(1, Math.max(0, (this.basePitch - POSES.view.pitch) / (POSES.decorate.pitch - POSES.view.pitch)));
  }

  private target(): THREE.Vector3 {
    if (this.view === "outdoors") return this.followShown.clone().add(new THREE.Vector3(0, RIG.outdoors.up, -RIG.outdoors.back));
    const b = this.blend;
    const lift = WALL_HEIGHT * (RIG.room.lift - 0.2 * b);
    // While decorating the toolbar covers the bottom: the room sits a little higher.
    const z = this.d * (RIG.room.depth + 0.1 * b);
    return new THREE.Vector3(0, lift, z).add(this.shown.pan);
  }

  private apply(): void {
    const pitch = clamp(this.basePitch + this.shown.pitch, RIG.pitchRange[0], RIG.pitchRange[1]);
    const yaw = this.shown.yaw;
    // The rectangle that must show at the target: the floor's width, and its
    // depth and the walls as seen from this pitch.
    const b = this.blend;
    const fitW = this.w + RIG.room.fitW + 1.2 * b;
    const fitH = this.d * Math.sin(pitch) + WALL_HEIGHT * Math.cos(pitch) + RIG.room.fitH + 2.2 * b;
    const half = THREE.MathUtils.degToRad(FOV / 2);
    const dist = this.view === "outdoors"
      // A span of ground across, but never so far on a tall screen that the island looks small.
      ? (Math.max(RIG.outdoors.span / Math.max(this.aspect, RIG.outdoors.aspect), RIG.outdoors.least) / 2 / Math.tan(half)) * this.shown.zoom
      : Math.max(fitH / 2 / Math.tan(half), fitW / 2 / (Math.tan(half) * this.aspect)) * this.shown.zoom;
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
    this.camera.near = Math.max(RIG.planes.nearLeast, dist * RIG.planes.near);
    this.camera.far = dist * RIG.planes.far + RIG.planes.farMore;
    this.camera.updateProjectionMatrix();
  }
}
