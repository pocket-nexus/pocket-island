// The island shown: its ground, the sea and the river, the house, every
// prop as instances of one model per kind and look, and the player.

import * as THREE from "three";
import type { IslandMap, Prop, PropKind } from "../core/island.ts";
import { PROP_VARIANTS } from "../core/island.ts";
import type { LampSource } from "../scene/lighting.ts";
import { GLOW_LAYER } from "../scene/materials.ts";
import { buildBridge, buildRampSteps, propModel, PROP_LIGHT } from "./props.ts";
import { buildHouse, setHouseGlow } from "./house.ts";
import { animateWater, buildField, buildGround, buildRiver, buildSea, fieldHeight, type Field } from "./terrain.ts";

/** A model's meshes merged by material, as instanced meshes, one instance per prop. */
function instanced(model: THREE.Object3D, props: Prop[], height: (x: number, z: number) => number): THREE.Object3D[] {
  model.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
    const list = buckets.get(mesh.material as THREE.Material) ?? [];
    list.push(geo);
    buckets.set(mesh.material as THREE.Material, list);
  });
  const out: THREE.Object3D[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const [material, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0]! : mergeAll(geos);
    const mesh = new THREE.InstancedMesh(merged, material, props.length);
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

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of geos) count += g.getAttribute("position").count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2]] as const) {
    const array = new Float32Array(count * size);
    let at = 0;
    for (const g of geos) {
      const a = g.getAttribute(name).array as Float32Array;
      array.set(a, at);
      at += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  return out;
}

export class IslandView {
  readonly group = new THREE.Group();
  readonly field: Field;
  private lamps: Prop[];

  constructor(readonly map: IslandMap) {
    this.group.name = "island";
    this.field = buildField(map);
    this.group.add(buildGround(map, this.field), buildSea(map), buildRiver(map));
    const height = (x: number, z: number) => this.height(x, z);
    // Props by kind and look.
    const groups = new Map<string, Prop[]>();
    for (const p of map.props) {
      const key = `${p.kind}:${Math.min(p.variant, PROP_VARIANTS[p.kind] - 1)}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    for (const [key, props] of groups) {
      const [kind, variant] = key.split(":") as [PropKind, string];
      this.group.add(...instanced(propModel(kind, Number(variant)), props, height));
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

  setNight(glow: number): void {
    setHouseGlow(glow);
    PROP_LIGHT.setGlow(glow);
  }

  frame(seconds: number): void {
    animateWater(seconds);
  }
}
