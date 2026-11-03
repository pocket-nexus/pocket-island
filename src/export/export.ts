// The export for the Nintendo 3DS. This page runs the catalogue's own
// builders, materials and procedural textures in a browser, and hands what
// they make to tools/export.ts, which writes it under .pocket-build/ir. The
// compiler (tools/cook.ts) lowers that to what the console draws. Nothing of
// the look is written a second time: a change to a model, a colour or a
// texture reaches the console through this page.
//
//   catalog.json     every item, finish, set and showroom, minus the builders
//   models.json      per item and variant, its parts: a geometry and a material
//   geometry.bin     the geometries those parts name, merged and welded
//   textures.json    the pictures the materials read, with textures/<n>.png
//   icons/           the catalogue's pictures of each item and variant
//   finish/          each wallpaper and flooring as drawn, and its swatch
//   ui/              the interface's icons

import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { ITEM_LIMIT, ROOM_SIZES, WALL_HEIGHT } from "../core/rules.ts";
import { FURNITURE } from "../furniture/catalog.ts";
import { FINISHES } from "../furniture/finishes.ts";
import { CATEGORY_NAMES, SERIES, type FurnitureDef, type SeriesId } from "../furniture/types.ts";
import { PRESETS } from "../presets.ts";
import { finishTextures } from "../scene/shell.ts";
import { showroom } from "../showroom.ts";
import { ICON_NAMES, icon } from "../ui/icons.ts";
import { finishThumb, thumb } from "../ui/thumbs.ts";

const sink = new URLSearchParams(location.search).get("sink");
const status = (text: string) => ((window as unknown as { __export: string }).__export = text);

async function put(path: string, body: BodyInit): Promise<void> {
  const response = await fetch(`${sink}/put?path=${encodeURIComponent(path)}`, { method: "POST", body });
  if (!response.ok) throw new Error(`export: ${path}: ${response.status}`);
}

const json = (value: unknown) => JSON.stringify(value);

function blob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("toBlob"))), "image/png"));
}

/** A picture at `size`, drawn down from `source` with the browser's best filter. */
function shrink(source: CanvasImageSource, sw: number, sh: number, size: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const g = out.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(source, 0, 0, sw, sh, 0, 0, size, size);
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((done, fail) => {
    const image = new Image();
    image.onload = () => done(image);
    image.onerror = () => fail(new Error(`image ${url.slice(0, 40)}`));
    image.src = url;
  });
}

// ---------------------------------------------------------------- materials and textures

type MaterialKind =
  /** Lit by the room. */
  | "lit"
  /** A shade or a bulb: lit, and gives off `emissive` × `strength` while its item is on. */
  | "glow"
  /** A screen: its picture gives off light while its item is on. */
  | "screen"
  /** Always gives off its light. */
  | "emissive"
  /** The sky seen through a window, which follows the time of day. */
  | "sky"
  /** Seen through, at `opacity`. */
  | "glass";

interface MaterialIR {
  kind: MaterialKind;
  /** sRGB. */
  color: string;
  emissive: string;
  strength: number;
  /** Index into textures.json, or -1. */
  texture: number;
  wrap: [boolean, boolean];
  opacity: number;
  side: "front" | "back" | "double";
  metal: number;
  roughness: number;
}

interface TextureIR {
  key: string;
  width: number;
  height: number;
  file: string;
}

const textures: TextureIR[] = [];
const textureIds = new Map<unknown, number>();
const pending: Promise<void>[] = [];

function textureId(texture: THREE.Texture | null | undefined): number {
  if (!texture) return -1;
  const image = texture.image as HTMLCanvasElement | undefined;
  if (!image || !("getContext" in image)) return -1;
  let id = textureIds.get(image);
  if (id === undefined) {
    id = textures.length;
    const file = `textures/${id}.png`;
    textures.push({ key: texture.name || `texture-${id}`, width: image.width, height: image.height, file });
    textureIds.set(image, id);
    pending.push(blob(image).then((b) => put(file, b)));
  }
  return id;
}

function describe(material: THREE.Material): { ir: MaterialIR; map: THREE.Texture | null } {
  const m = material as THREE.MeshStandardMaterial;
  const emissive = m.emissive ?? new THREE.Color(0, 0, 0);
  const glows = m.userData?.glow !== undefined;
  const lights = emissive.r + emissive.g + emissive.b > 0 || !!m.emissiveMap;
  let kind: MaterialKind = "lit";
  let map: THREE.Texture | null = m.map ?? null;
  if (m.name === "sky") {
    kind = "sky";
    map = null;
  } else if (lights && m.emissiveMap) {
    kind = glows ? "screen" : "emissive";
    map = m.emissiveMap;
  } else if (lights) {
    kind = glows ? "glow" : "emissive";
  } else if (m.transparent && m.opacity < 0.99) {
    kind = "glass";
  }
  const ir: MaterialIR = {
    kind,
    color: "#" + (m.color ?? new THREE.Color(1, 1, 1)).getHexString(),
    emissive: "#" + emissive.getHexString(),
    strength: glows ? (m.userData.glow as number) : (m.emissiveIntensity ?? 0),
    texture: textureId(map),
    wrap: [map?.wrapS === THREE.RepeatWrapping, map?.wrapT === THREE.RepeatWrapping],
    opacity: m.transparent ? m.opacity : 1,
    side: m.side === THREE.DoubleSide ? "double" : m.side === THREE.BackSide ? "back" : "front",
    metal: m.metalness ?? 0,
    roughness: m.roughness ?? 1,
  };
  return { ir, map };
}

// ---------------------------------------------------------------- geometry

interface GeometryIR {
  /** Byte offset of this geometry in geometry.bin: positions, normals, uvs (float32), then indices (uint32). */
  offset: number;
  vertices: number;
  indices: number;
}

const geometries: GeometryIR[] = [];
const geometryIds = new Map<string, number>();
const chunks: ArrayBuffer[] = [];
let binBytes = 0;

function hashOf(arrays: ArrayLike<number>[]): string {
  // FNV-1a over the arrays' bits, two seeds: a collision would need both to agree.
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (const array of arrays) {
    const words = new Uint32Array((array as Float32Array).buffer, (array as Float32Array).byteOffset, (array as Float32Array).byteLength / 4);
    for (let i = 0; i < words.length; i++) {
      a = Math.imul(a ^ words[i]!, 0x01000193);
      b = Math.imul(b ^ words[i]!, 0x5bd1e995);
    }
    a = Math.imul(a ^ words.length, 0x01000193);
  }
  return `${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

function addGeometry(geo: THREE.BufferGeometry): number {
  const position = geo.getAttribute("position").array as Float32Array;
  const normal = geo.getAttribute("normal").array as Float32Array;
  const uv = geo.getAttribute("uv").array as Float32Array;
  const index = new Uint32Array(geo.index!.array);
  const key = hashOf([position, normal, uv, index]);
  const seen = geometryIds.get(key);
  if (seen !== undefined) return seen;
  const id = geometries.length;
  geometries.push({ offset: binBytes, vertices: position.length / 3, indices: index.length });
  for (const array of [position, normal, uv]) {
    const copy = new Float32Array(array);
    chunks.push(copy.buffer);
    binBytes += copy.byteLength;
  }
  chunks.push(index.buffer);
  binBytes += index.byteLength;
  geometryIds.set(key, id);
  return id;
}

interface PartIR {
  geometry: number;
  material: MaterialIR;
}

/** One built model as parts: its meshes' triangles in the item's frame, one part per material. */
function partsOf(model: THREE.Object3D): PartIR[] {
  model.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { positions: number[]; normals: number[]; uvs: number[] }>();
  const normalMatrix = new THREE.Matrix3();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const uvTransform = new THREE.Matrix3();
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    if (!source.getAttribute("normal")) source.computeVertexNormals();
    const pos = source.getAttribute("position");
    const nor = source.getAttribute("normal");
    const uv = source.getAttribute("uv");
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) && source.groups.length
      ? source.groups
      : [{ start: 0, count: pos.count, materialIndex: 0 }];
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    // A mirrored mesh turns its triangles inside out; their order is put back.
    const mirrored = mesh.matrixWorld.determinant() < 0;
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      if (!material || !material.visible) continue;
      const { map } = describe(material);
      if (map) {
        map.updateMatrix();
        uvTransform.copy(map.matrix);
      } else {
        uvTransform.identity();
      }
      const bucket = buckets.get(material) ?? { positions: [], normals: [], uvs: [] };
      buckets.set(material, bucket);
      const end = Math.min(pos.count, group.start + group.count);
      for (let tri = group.start; tri + 2 < end; tri += 3) {
        const order = mirrored ? [tri, tri + 2, tri + 1] : [tri, tri + 1, tri + 2];
        for (const i of order) {
          p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
          bucket.positions.push(p.x, p.y, p.z);
          bucket.normals.push(n.x, n.y, n.z);
          if (uv) {
            const u = uv.getX(i), v = uv.getY(i);
            const e = uvTransform.elements;
            bucket.uvs.push(e[0]! * u + e[3]! * v + e[6]!, e[1]! * u + e[4]! * v + e[7]!);
          } else {
            bucket.uvs.push(0, 0);
          }
        }
      }
    }
  });
  const parts: PartIR[] = [];
  for (const [material, bucket] of buckets) {
    if (!bucket.positions.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
    const welded = mergeVertices(geo, 1e-4);
    parts.push({ geometry: addGeometry(welded), material: describe(material).ir });
    geo.dispose();
    welded.dispose();
  }
  return parts;
}

// ---------------------------------------------------------------- the catalogue

function meta(def: FurnitureDef) {
  const { build: _build, ...rest } = def;
  return rest;
}

async function exportIcons(): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const def of FURNITURE) {
    for (let v = 0; v < def.variants.length; v++) {
      jobs.push(new Promise<string>((done) => thumb(def, v, done))
        .then(loadImage)
        .then((image) => blob(shrink(image, image.width, image.height, 64)))
        .then((b) => put(`icons/${def.id}.${v}.png`, b)));
    }
  }
  await Promise.all(jobs);
}

async function exportFinishes() {
  const out = [];
  for (const f of FINISHES) {
    const { draw: _draw, bump: _bump, ...rest } = f;
    const image = finishTextures(f).map.image as HTMLCanvasElement;
    await put(`finish/${f.id}.png`, await blob(image));
    const swatch = await loadImage(finishThumb(f));
    await put(`finish/${f.id}.swatch.png`, await blob(shrink(swatch, swatch.width, swatch.height, 64)));
    out.push({ ...rest, width: image.width, height: image.height });
  }
  return out;
}

async function exportInterfaceIcons(): Promise<void> {
  for (const name of ICON_NAMES) {
    const svg = icon(name).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    for (const size of [24, 32]) {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(image, 0, 0, size, size);
      await put(`ui/${name}.${size}.png`, await blob(c));
    }
  }
}

async function run(): Promise<void> {
  status("models");
  const models: Record<string, PartIR[][]> = {};
  let triangles = 0;
  for (const def of FURNITURE) {
    models[def.id] = [];
    for (let v = 0; v < def.variants.length; v++) {
      const parts = partsOf(def.build(v));
      models[def.id]!.push(parts);
      for (const part of parts) triangles += geometries[part.geometry]!.indices / 3;
    }
  }
  status("geometry");
  await put("geometry.bin", new Blob(chunks));
  await put("models.json", json({ geometries, items: models }));
  status("catalogue");
  const series = Object.keys(SERIES) as SeriesId[];
  const catalog = {
    limits: { items: ITEM_LIMIT, wallHeight: WALL_HEIGHT },
    sizes: ROOM_SIZES,
    series: series.map((id) => ({ id, ...SERIES[id] })),
    categories: CATEGORY_NAMES,
    items: FURNITURE.map(meta),
    finishes: await exportFinishes(),
    presets: PRESETS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb, swatch: p.swatch, state: p.make() })),
    showrooms: Object.fromEntries([...series, "all" as const].map((s) => [s, showroom(s, 0)])),
  };
  await put("catalog.json", json(catalog));
  status("icons");
  await exportIcons();
  await exportInterfaceIcons();
  status("textures");
  await put("textures.json", json(textures));
  await Promise.all(pending);
  await put("summary.json", json({ items: FURNITURE.length, variants: FURNITURE.reduce((n, d) => n + d.variants.length, 0), geometries: geometries.length, triangles, bytes: binBytes, textures: textures.length }));
  status("done");
}

run().catch((error) => status(`error: ${error instanceof Error ? error.stack : String(error)}`));
