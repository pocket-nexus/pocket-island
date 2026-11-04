// A model's meshes made ready to merge, for the room's pieces (./view.ts) and the island's props
// (src/island/view.ts) alike: each mesh's geometry carried into the model's frame, unindexed, with
// a position, a normal and a uv (zeros where it has none) and nothing else, so that any two merge.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const KEPT = ["position", "normal", "uv"];

/** `mesh`'s geometry in its model's frame (the model's world matrices made first). */
export function inModel(mesh: THREE.Mesh): THREE.BufferGeometry {
  let geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  if (geo.index) geo = geo.toNonIndexed();
  for (const name of Object.keys(geo.attributes)) if (!KEPT.includes(name)) geo.deleteAttribute(name);
  if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  return geo;
}

/** Geometries made by `inModel`, as one. */
export function merged(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return geos.length === 1 ? geos[0]! : mergeGeometries(geos, false)!;
}
