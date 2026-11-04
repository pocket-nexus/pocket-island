// The room's state shown as objects. Each placed item is a clone of a model
// built once per item and variant; the model's meshes are merged by
// material, so a bed is a handful of draw calls rather than forty. Lamps get
// their own copy of the materials that glow, so each switches alone.
//
// Items ease toward where the state puts them, pop in when they arrive and
// shrink away when they are put away.

import * as THREE from "three";
import { PIECE_EASE } from "../core/game.ts";
import { WALL_HEIGHT, byUid, centerOf, worldRot } from "../core/rules.ts";
import type { Placement, RoomState } from "../core/types.ts";
import { furniture } from "../furniture/catalog.ts";
import type { FurnitureDef } from "../furniture/types.ts";
import type { LampSource } from "./lighting.ts";
import { GLOW_LAYER, isEmissive } from "./materials.ts";
import { inModel, merged } from "./merge.ts";

export interface Entry {
  uid: string;
  /** A window's patch of sunlight on the floor. */
  beam: THREE.Mesh | null;
  def: FurnitureDef;
  variant: number;
  root: THREE.Group;
  glows: THREE.MeshStandardMaterial[];
  halo: THREE.Sprite | null;
  on: boolean;
  goal: THREE.Vector3;
  goalYaw: number;
  /** Extra height while held, so a carried item floats a little. */
  lift: number;
  shownLift: number;
  pop: number;
  dying: boolean;
}

const protos = new Map<string, THREE.Group>();

/** Merge a model's meshes by material and shadow flag, transforms baked in. */
function bake(model: THREE.Object3D): THREE.Group {
  model.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material;
    const key = `${mat.uuid}:${mesh.castShadow}`;
    const b = buckets.get(key) ?? { mat, cast: mesh.castShadow, geos: [] };
    b.geos.push(inModel(mesh));
    buckets.set(key, b);
  });
  const out = new THREE.Group();
  for (const { mat, cast, geos } of buckets.values()) {
    const geo = merged(geos);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    out.add(mesh);
    if (geos.length > 1) geos.forEach((g) => g.dispose());
  }
  return out;
}

function modelFor(def: FurnitureDef, variant: number): THREE.Group {
  const key = `${def.id}:${variant}`;
  let p = protos.get(key);
  if (!p) {
    p = bake(def.build(variant));
    p.name = key;
    protos.set(key, p);
  }
  return p;
}

let haloTexture: THREE.Texture | null = null;
function haloMap(): THREE.Texture {
  if (haloTexture) return haloTexture;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.42)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.16)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.04)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  haloTexture = new THREE.CanvasTexture(c);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

let beamTexture: THREE.Texture | null = null;
/** Sunlight through panes: four soft squares divided by the frame, fading away from the wall. */
function beamMap(): THREE.Texture {
  if (beamTexture) return beamTexture;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.filter = "blur(5px)";
  const pane = (x: number, y: number, w: number, h: number) => {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(1, "rgba(255,255,255,0.35)");
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  };
  pane(12, 12, 48, 108);
  pane(68, 12, 48, 108);
  pane(12, 132, 48, 110);
  pane(68, 132, 48, 110);
  const fade = document.createElement("canvas");
  fade.width = 128;
  fade.height = 256;
  const f = fade.getContext("2d")!;
  f.drawImage(c, 0, 0);
  f.globalCompositeOperation = "destination-in";
  const grad = f.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0.15)");
  f.fillStyle = grad;
  f.fillRect(0, 0, 128, 256);
  beamTexture = new THREE.CanvasTexture(fade);
  beamTexture.colorSpace = THREE.SRGBColorSpace;
  return beamTexture;
}

/** The one material every sunbeam shares; the lighting sets its colour and strength. */
export const beamMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff3d6, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

/** A parallelogram on the floor in front of a window `w` wide, leaning away from the light. */
function sunbeam(w: number): THREE.Mesh {
  const len = 1.5, skew = 0.55;
  const g = new THREE.BufferGeometry();
  const x0 = -w * 0.42, x1 = w * 0.42;
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, 0, 0.05, x1, 0, 0.05, x0 + skew, 0, len, x1 + skew, 0, len], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  if (!beamMaterial.map) beamMaterial.map = beamMap();
  const m = new THREE.Mesh(g, beamMaterial);
  m.raycast = () => {};
  m.renderOrder = 4;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** A placed item as a fresh object: shared geometry, its own glowing materials. */
export function instance(def: FurnitureDef, variant: number): { root: THREE.Group; glows: THREE.MeshStandardMaterial[]; halo: THREE.Sprite | null } {
  const model = modelFor(def, variant).clone(true);
  const glows: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Anything that gives off light, however its piece was made, is a bloom source.
    if (isEmissive(mesh.material)) mesh.layers.enable(GLOW_LAYER);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.userData.glow !== undefined) {
      const own = mat.clone();
      own.userData = { ...mat.userData };
      mesh.material = own;
      glows.push(own);
    }
  });
  const root = new THREE.Group();
  root.add(model);
  let halo: THREE.Sprite | null = null;
  if (def.light && def.light.halo > 0) {
    // A halo leans toward white: a saturated warm halo reads pink once added over a cream wall.
    halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloMap(), color: new THREE.Color(def.light.color).lerp(new THREE.Color(1, 0.97, 0.9), 0.55),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.9,
    }));
    halo.position.fromArray(def.light.at);
    halo.scale.setScalar(def.light.halo);
    halo.raycast = () => {};
    halo.renderOrder = 5;
    root.add(halo);
  }
  return { root, glows, halo };
}

export function setGlow(glows: THREE.MeshStandardMaterial[], halo: THREE.Sprite | null, on: boolean, haloStrength = 1): void {
  // Shades glow less by day (0.18 is the daytime halo strength), fully at night.
  const k = 0.3 + 0.7 * Math.min(1, Math.max(0, (haloStrength - 0.18) / 0.82));
  for (const m of glows) m.emissiveIntensity = on ? (m.userData.glow as number) * k : 0.0;
  if (halo) {
    halo.visible = on;
    halo.material.opacity = 0.9 * haloStrength;
  }
}

/** Where an item stands in the world, and which way it faces. */
export function worldPose(state: RoomState, p: Placement): { position: THREE.Vector3; yaw: number } {
  const hw = state.w / 2, hd = state.d / 2;
  if (p.layer === "wall") {
    const u = p.u ?? 0, v = p.v ?? 0;
    if (p.wall === "left") return { position: new THREE.Vector3(-hw, v, u - hd), yaw: Math.PI / 2 };
    if (p.wall === "right") return { position: new THREE.Vector3(hw, v, u - hd), yaw: -Math.PI / 2 };
    return { position: new THREE.Vector3(u - hw, v, -hd), yaw: 0 };
  }
  const [x, z] = centerOf(state, p);
  let y = 0;
  if (p.layer === "ceiling") y = WALL_HEIGHT;
  if (p.layer === "rug") y = 0.001;
  if (p.layer === "surface") {
    const host = byUid(state, p.host);
    y = (host && furniture(host.item)?.surface?.y) ?? 0;
  }
  return { position: new THREE.Vector3(x - hw, y, z - hd), yaw: (-worldRot(state, p) * Math.PI) / 2 };
}

const HULL_VERT = /* glsl */ `
uniform float thickness;
void main() {
  vec3 n = normalize(normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * n);
  world.xyz += wn * thickness;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const HULL_FRAG = /* glsl */ `
uniform vec3 color;
uniform float time;
void main() {
  float pulse = 0.5 + 0.5 * sin(time * 4.5);
  gl_FragColor = vec4(mix(color, vec3(1.0), 0.35 * pulse), 1.0);
}`;

/** The outline drawn around selected items: their back faces, pushed out along the normals. */
export const hullMaterial = new THREE.ShaderMaterial({
  vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, side: THREE.BackSide, toneMapped: false,
  uniforms: { thickness: { value: 0.042 }, color: { value: new THREE.Color("#ffd84a") }, time: { value: 0 } },
});

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RoomView {
  readonly items = new THREE.Group();
  private entries = new Map<string, Entry>();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Set when something visible moved this frame. */
  moving = false;
  /** How strongly lamp halos show, set by the lighting. */
  haloStrength = 0.35;

  constructor() {
    this.items.name = "items";
  }

  entry(uid: string): Entry | undefined {
    return this.entries.get(uid);
  }

  all(): Entry[] {
    return [...this.entries.values()].filter((e) => !e.dying);
  }

  /** Bring the objects in line with `state`. `instant` skips the easing (a room loaded whole). */
  sync(state: RoomState, instant = false): void {
    const seen = new Set<string>();
    for (const p of state.items) {
      const def = furniture(p.item);
      if (!def) continue;
      seen.add(p.uid);
      let e = this.entries.get(p.uid);
      if (e && e.variant !== p.variant) {
        this.items.remove(e.root);
        this.entries.delete(p.uid);
        e = undefined;
        instant = instant || false;
      }
      const pose = worldPose(state, p);
      if (!e) {
        const made = instance(def, p.variant);
        const beam = def.category === "window" ? sunbeam(def.size[0]) : null;
        if (beam) made.root.add(beam);
        e = {
          uid: p.uid, beam, def, variant: p.variant, root: made.root, glows: made.glows, halo: made.halo, on: false,
          goal: pose.position.clone(), goalYaw: pose.yaw, lift: 0, shownLift: 0, pop: instant ? 1 : 0, dying: false,
        };
        e.root.userData.uid = p.uid;
        e.root.position.copy(pose.position);
        e.root.rotation.y = pose.yaw;
        if (!instant) e.root.scale.setScalar(0.01);
        this.items.add(e.root);
        this.entries.set(p.uid, e);
      }
      e.goal.copy(pose.position);
      e.goalYaw = pose.yaw;
      // The patch lies on the floor, whatever height the window hangs at.
      if (e.beam) e.beam.position.y = -pose.position.y + 0.004;
      if (instant) {
        e.root.position.copy(pose.position);
        e.root.rotation.y = pose.yaw;
      }
      const on = p.on ?? def.light?.startsOn ?? false;
      e.on = on;
      setGlow(e.glows, e.halo, on, this.haloStrength);
    }
    for (const [uid, e] of this.entries) {
      if (seen.has(uid)) continue;
      e.dying = true;
      if (instant || this.reduced) this.drop(uid);
    }
    this.moving = true;
  }

  private drop(uid: string): void {
    const e = this.entries.get(uid);
    if (!e) return;
    this.items.remove(e.root);
    this.entries.delete(uid);
  }

  /** Ease every item toward its goal; returns whether anything moved. */
  frame(dt: number): boolean {
    const k = this.reduced ? 1 : 1 - Math.exp(-dt / (PIECE_EASE * 1000));
    let moved = false;
    for (const [uid, e] of this.entries) {
      if (e.dying) {
        const s = e.root.scale.x * Math.exp(-dt / 50);
        e.root.scale.setScalar(s);
        e.root.position.y += dt * 0.0006;
        moved = true;
        if (s < 0.05) this.drop(uid);
        continue;
      }
      if (e.pop < 1) {
        e.pop = Math.min(1, e.pop + dt / 320);
        const t = e.pop;
        // Ease out with a little overshoot.
        const s = 1 + 0.12 * Math.sin(t * Math.PI) * (1 - t) * 3 - (1 - t) ** 3;
        e.root.scale.set(s, 1 + (1 - t) * 0.0 + 0.1 * Math.sin(t * Math.PI * 1.5) * (1 - t), s);
        if (e.pop === 1) e.root.scale.setScalar(1);
        moved = true;
      }
      e.shownLift += (e.lift - e.shownLift) * (this.reduced ? 1 : 1 - Math.exp(-dt / 70));
      const target = e.goal.clone();
      target.y += e.shownLift;
      if (e.root.position.distanceToSquared(target) > 1e-7 || Math.abs(e.root.rotation.y - e.goalYaw) > 1e-4) {
        e.root.position.lerp(target, k);
        e.root.rotation.y = lerpAngle(e.root.rotation.y, e.goalYaw, k);
        moved = true;
      } else {
        e.root.position.copy(target);
        e.root.rotation.y = e.goalYaw;
      }
    }
    this.moving = moved;
    return moved;
  }

  /** Light sources of the lamps that are on, in world space. */
  lamps(): LampSource[] {
    const out: LampSource[] = [];
    for (const e of this.all()) {
      const l = e.def.light;
      if (!l || !e.on) continue;
      e.root.updateMatrixWorld();
      out.push({ position: new THREE.Vector3(...l.at).applyMatrix4(e.root.matrixWorld), color: l.color, intensity: l.intensity, distance: l.distance });
    }
    return out;
  }

  private hulls = new Map<string, THREE.Group>();

  /** Outline exactly these items. */
  highlight(uids: Iterable<string>, ok = true): void {
    const want = new Set(uids);
    hullMaterial.uniforms.color.value.set(ok ? "#ffd84a" : "#ff5a4f");
    for (const [uid, hull] of this.hulls) {
      const e = this.entries.get(uid);
      if (!want.has(uid) || !e || e.dying || hull.parent !== e.root) {
        hull.removeFromParent();
        this.hulls.delete(uid);
      }
    }
    for (const uid of want) {
      if (this.hulls.has(uid)) continue;
      const e = this.entries.get(uid);
      if (!e || e.dying) continue;
      const hull = new THREE.Group();
      hull.name = "hull";
      const model = e.root.children[0]!;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = new THREE.Mesh(mesh.geometry, hullMaterial);
        m.raycast = () => {};
        m.castShadow = false;
        m.receiveShadow = false;
        hull.add(m);
      });
      e.root.add(hull);
      this.hulls.set(uid, hull);
    }
  }

  /** The uid of the item an object belongs to. */
  uidOf(object: THREE.Object3D | null): string | null {
    for (let o = object; o; o = o.parent) {
      if (o.userData.uid) return o.userData.uid as string;
    }
    return null;
  }

  meshesOf(uids: Iterable<string>): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const uid of uids) {
      const e = this.entries.get(uid);
      if (!e || e.dying) continue;
      e.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); });
    }
    return out;
  }
}
