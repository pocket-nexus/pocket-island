// The island shown: its ground, the sea and the river, the house, every
// prop as instances of one model per kind and look, and the player.

import * as THREE from "three";
import type { IslandMap, Prop, PropKind } from "../core/island.ts";
import { PROP_VARIANTS } from "../core/island.ts";
import type { LampSource } from "../scene/lighting.ts";
import { GLOW_LAYER } from "../scene/materials.ts";
import { inModel, merged } from "../scene/merge.ts";
import { buildBridge, buildRampSteps, propModel, PROP_LIGHT } from "./props.ts";
import { buildHouse, setHouseGlow } from "./house.ts";
import { animateWater, buildField, buildGround, buildRiver, buildSea, fieldHeight, type Field } from "./terrain.ts";

/** Props the island's things stand for, not drawn as props (src/island/things.ts draws them). */
const AS_THINGS: ReadonlySet<PropKind> = new Set(["shell"]);
/** Props a player can shake or chop: they sway. */
const TREES: ReadonlySet<PropKind> = new Set(["tree", "fruit", "cedar", "palm"]);

/** A model's meshes merged by material, as instanced meshes, one instance per prop. */
function instanced(model: THREE.Object3D, props: Prop[], height: (x: number, z: number) => number): THREE.Object3D[] {
  model.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = buckets.get(mesh.material as THREE.Material) ?? [];
    list.push(inModel(mesh));
    buckets.set(mesh.material as THREE.Material, list);
  });
  const out: THREE.Object3D[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const [material, geos] of buckets) {
    const mesh = new THREE.InstancedMesh(merged(geos), material, props.length);
    props.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.compose(new THREE.Vector3(p.x, height(p.x, p.z), p.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    if ((material as THREE.MeshStandardMaterial).emissive && (material as THREE.MeshStandardMaterial).userData.glow !== undefined) mesh.layers.enable(GLOW_LAYER);
    out.push(mesh);
  }
  return out;
}

export class IslandView {
  readonly group = new THREE.Group();
  readonly field: Field;
  private lamps: Prop[];
  /** Each tree's instanced meshes and its instance in them, for a sway. */
  private trees = new Map<Prop, { meshes: THREE.InstancedMesh[]; i: number }>();
  private swaying: Prop | null = null;

  constructor(readonly map: IslandMap) {
    this.group.name = "island";
    this.field = buildField(map);
    this.group.add(buildGround(map, this.field), buildSea(map), buildRiver(map));
    const height = (x: number, z: number) => this.height(x, z);
    // Props by kind and look.
    const groups = new Map<string, Prop[]>();
    for (const p of map.props) {
      if (AS_THINGS.has(p.kind)) continue;
      const key = `${p.kind}:${Math.min(p.variant, PROP_VARIANTS[p.kind] - 1)}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    for (const [key, props] of groups) {
      const [kind, variant] = key.split(":") as [PropKind, string];
      const meshes = instanced(propModel(kind, Number(variant)), props, height);
      this.group.add(...meshes);
      if (TREES.has(kind)) props.forEach((p, i) => this.trees.set(p, { meshes: meshes as THREE.InstancedMesh[], i }));
    }
    for (const b of map.bridges) this.group.add(buildBridge(b));
    for (const r of map.ramps) this.group.add(buildRampSteps(r));
    const house = buildHouse();
    house.name = "house";
    const [x0, z0, x1, z1] = map.house.rect;
    house.position.set((x0 + x1) / 2, this.height((x0 + x1) / 2, z1 + 0.2), (z0 + z1) / 2);
    this.group.add(house);
    this.lamps = map.props.filter((p) => p.kind === "lamp");
  }

  /** The tree whose trunk is at (x, z) rocks, `f` from 0 to 1 through a shake; `f` of 1 or more stands it still. */
  sway(x: number, z: number, f: number): void {
    let tree: Prop | null = null;
    for (const p of this.trees.keys()) if (Math.abs(p.x - x) < 0.05 && Math.abs(p.z - z) < 0.05) tree = p;
    if (this.swaying && this.swaying !== tree) this.tilt(this.swaying, 0);
    this.swaying = f < 1 ? tree : null;
    if (tree) this.tilt(tree, f < 1 ? Math.sin(f * Math.PI * 6) * 0.07 * (1 - f) : 0);
  }

  /** No tree sways. */
  still(): void {
    if (this.swaying) this.tilt(this.swaying, 0);
    this.swaying = null;
  }

  private tilt(p: Prop, angle: number): void {
    const t = this.trees.get(p);
    if (!t) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, this.height(p.x, p.z), p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, p.rot, 0, "YXZ")), new THREE.Vector3(1, 1, 1));
    for (const mesh of t.meshes) {
      mesh.setMatrixAt(t.i, m);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** The ground's height as drawn. */
  height(x: number, z: number): number {
    return fieldHeight(this.field, x, z);
  }

  /** The lamps outdoors that are lit after dark, nearest `centre` first. */
  lampsNear(centre: THREE.Vector3): LampSource[] {
    return this.lamps
      .map((p) => ({ p, d: (p.x - centre.x) ** 2 + (p.z - centre.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .map(({ p }) => ({ position: new THREE.Vector3(p.x, this.height(p.x, p.z) + PROP_LIGHT.lamp.y, p.z), color: PROP_LIGHT.lamp.color, intensity: PROP_LIGHT.lamp.intensity, distance: PROP_LIGHT.lamp.distance }));
  }

  /** After dark (`glow`, 0 by day to 1): the lamps light up, and the house's windows as its rooms are lit. */
  setNight(glow: number, inside?: { glow: number; cool: boolean }): void {
    setHouseGlow(glow, inside);
    PROP_LIGHT.setGlow(glow);
  }

  frame(seconds: number): void {
    animateWater(seconds);
  }
}
