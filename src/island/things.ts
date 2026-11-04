// The island's things drawn, as the island's core lists them each frame (src/core/things.ts view):
// what lies about and the fruit on the trees, each kind as instanced meshes of its model; where a
// fossil is buried; the fish's shadows in the water; the rod's float; the shop's keeper. A tree being shaken or chopped
// is swayed by the island's view. The console draws the same list (programs/3ds-island/src/scene.c,
// draw_things).

import * as THREE from "three";
import { MAX_FISH, SHOW, VIEW_FIELDS, things } from "../core/things.ts";
import { bundleModel, buriedModel, floatModel, itemModel, keeperModel } from "../items/models.ts";

/** The most of one kind drawn. */
const CAPACITY = 160;

/** How the fish's shadows and the fishing line (src/world.ts) are drawn, here and on the console (the export hands them to its pack: tools/cook.ts SCEN). */
export const FISH_SHADOW = { color: "#10303f", opacity: 0.5 } as const;
export const FISHING_LINE = { color: "#fffbee", opacity: 0.85 } as const;

/**
 * A fish's shadow as the core outlines it (things.outline: round and wide at the head, +z, long and
 * thin to the tail), flat for a fish of shadow size 1: a strip of quads across it, as the console
 * draws it (scene.c draw_fish).
 */
function fishShadow(): THREE.BufferGeometry {
  const outline = things.outline();
  const at: number[] = [];
  for (let k = 0; k + 1 < outline.length; k++) {
    const [a0, h0] = outline[k]!, [a1, h1] = outline[k + 1]!;
    at.push(-h0, 0, a0, h0, 0, a0, h1, 0, a1, -h0, 0, a0, h1, 0, a1, -h1, 0, a1);
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(at, 3));
}

interface Kind {
  parts: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[];
  used: number;
}

export class ThingsView {
  readonly group = new THREE.Group();
  private kinds = new Map<number, Kind>();
  private shadows: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);
  private last = "";

  constructor() {
    this.group.name = "things";
    this.shadows = new THREE.InstancedMesh(fishShadow(), new THREE.MeshBasicMaterial({ color: FISH_SHADOW.color, transparent: true, opacity: FISH_SHADOW.opacity, depthWrite: false, side: THREE.DoubleSide }), MAX_FISH);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.group.add(this.shadows);
  }

  private kind(what: number): Kind {
    let k = this.kinds.get(what);
    if (k) return k;
    const model = what === SHOW.buried ? buriedModel() : what === SHOW.float ? floatModel() : what === SHOW.bundle ? bundleModel() : what === SHOW.keeper ? keeperModel() : itemModel(what);
    model.updateMatrixWorld(true);
    k = { parts: [], used: 0 };
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, CAPACITY);
      inst.castShadow = what !== SHOW.float;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      inst.count = 0;
      this.group.add(inst);
      k!.parts.push({ mesh: inst, local: mesh.matrixWorld.clone() });
    });
    this.kinds.set(what, k);
    return k;
  }

  /**
   * Draw `n` entries of the core's list (`data`). `shake(x, z, f)` sways the tree whose trunk is there.
   * Returns whether anything moved since the last frame (the sun's shadows are then drawn again).
   */
  update(n: number, data: Float32Array, shake: (x: number, z: number, f: number) => void, still: () => void): boolean {
    for (const k of this.kinds.values()) k.used = 0;
    let fish = 0;
    let shook = false;
    let signature = "";
    for (let e = 0; e < n; e++) {
      const o = e * VIEW_FIELDS;
      const what = data[o]!, x = data[o + 1]!, y = data[o + 2]!, z = data[o + 3]!, yaw = data[o + 4]!, value = data[o + 5]!;
      if (what === SHOW.shake) {
        shake(x, z, value);
        shook = true;
        signature += `s${value.toFixed(2)}`;
        continue;
      }
      if (what === SHOW.fish) {
        if (fish < MAX_FISH) {
          this.q.setFromAxisAngle(this.up, yaw);
          this.m.compose(this.v.set(x, y + 0.02, z), this.q, this.v2.set(value, 1, value));
          this.shadows.setMatrixAt(fish++, this.m);
        }
        continue;
      }
      const k = this.kind(what);
      if (k.used >= CAPACITY) continue;
      this.q.setFromAxisAngle(this.up, yaw);
      this.m.compose(this.v.set(x, y, z), this.q, this.one);
      for (const p of k.parts) p.mesh.setMatrixAt(k.used, new THREE.Matrix4().multiplyMatrices(this.m, p.local));
      k.used++;
      // What moves the sun's shadows: not the float, nor the keeper's breath (only their turn).
      if (what !== SHOW.float) signature += what === SHOW.keeper ? `${what}:${x.toFixed(2)},${z.toFixed(2)},${yaw.toFixed(1)};` : `${what}:${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)};`;
    }
    if (!shook) still();
    for (const k of this.kinds.values()) {
      for (const p of k.parts) {
        if (p.mesh.count !== k.used || k.used) p.mesh.instanceMatrix.needsUpdate = true;
        p.mesh.count = k.used;
      }
    }
    this.shadows.count = fish;
    this.shadows.instanceMatrix.needsUpdate = fish > 0;
    const moved = signature !== this.last;
    this.last = signature;
    return moved;
  }
}
