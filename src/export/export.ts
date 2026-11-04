// The export for the Nintendo 3DS. This page runs the catalogue's own
// builders, materials and procedural textures in a browser, and hands what
// they make to tools/export.ts, which writes it under .pocket-build/ir. The
// compiler (tools/cook.ts) lowers that to what the console draws. Nothing of
// the look is written a second time: a change to a model, a colour or a
// texture reaches the console through this page.
//
//   catalog.json     every item, finish, set and showroom, minus the builders
//   models.json      per item and variant, its parts: a geometry and a material;
//                    and the island's models (ground and water by chunk, the
//                    house, bridges, inclines, each prop's looks, the player's parts)
//   island.json      the island's map, and where each of its models stands
//   light.json       the room's and the island's light at each look of the day, the room's shell
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
import { DOORMAT, finishTextures, SHELL } from "../scene/shell.ts";
import { CEILING_MODES, look, outdoorLook, PERIODS } from "../scene/lighting.ts";
import { showroom } from "../showroom.ts";
import { ICON_NAMES, icon } from "../ui/icons.ts";
import { finishThumb, itemThumb, thumb } from "../ui/thumbs.ts";
import { ITEMS, itemDef } from "../items/items.ts";
import { bundleModel, buriedModel, floatModel, HOLD, itemModel, keeperModel } from "../items/models.ts";
import { SHOW } from "../core/things.ts";
import { PROP_RADIUS, PROP_VARIANTS, makeIsland, type PropKind } from "../core/island.ts";
import { JOINTS, PART_NAMES } from "../character/joints.ts";
import { partModels } from "../character/model.ts";
import { buildHouse } from "../island/house.ts";
import { MAP_COLORS, drawMap } from "../island/map.ts";
import { PROP_LIGHT, buildBridge, buildRampSteps, propModel } from "../island/props.ts";
import { CHUNK, SEA, buildField, buildRiver, chunkMesh, fieldHeight, seaChunk, shoreField } from "../island/terrain.ts";
import { loadCore } from "../core/wasm.ts";
import coreUrl from "../core/pocket_island_core.wasm?url";

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
  /** Lit by the rooms inside the house (its windows): the console lights it as the room is lit. */
  house?: boolean;
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
    ...(m.userData?.house ? { house: true } : {}),
  };
  return { ir, map };
}

// ---------------------------------------------------------------- geometry

interface GeometryIR {
  /** Byte offset of this geometry in geometry.bin: positions, normals, uvs, colours (rgba, sRGB) as float32, then indices (uint32). */
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
  const color = geo.getAttribute("color").array as Float32Array;
  const index = new Uint32Array(geo.index!.array);
  const key = hashOf([position, normal, uv, color, index]);
  const seen = geometryIds.get(key);
  if (seen !== undefined) return seen;
  const id = geometries.length;
  geometries.push({ offset: binBytes, vertices: position.length / 3, indices: index.length });
  for (const array of [position, normal, uv, color]) {
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
  const buckets = new Map<THREE.Material, { positions: number[]; normals: number[]; uvs: number[]; colors: number[] }>();
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
    // Vertex colours (the island's ground and sea), linear in three.js: written in sRGB like a material's.
    const col = source.getAttribute("color");
    const linear = new THREE.Color();
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
      const bucket = buckets.get(material) ?? { positions: [], normals: [], uvs: [], colors: [] };
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
          if (col && (material as THREE.MeshStandardMaterial).vertexColors) {
            linear.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.LinearSRGBColorSpace);
            const srgb = linear.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
            bucket.colors.push(srgb.r, srgb.g, srgb.b, col.itemSize === 4 ? col.getW(i) : 1);
          } else {
            bucket.colors.push(1, 1, 1, 1);
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
    geo.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 4));
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

/** The pictures of what the player carries, for the console's pockets. */
async function exportItemIcons(): Promise<void> {
  await Promise.all(ITEMS.map((d) => new Promise<string>((done) => itemThumb(d.id, done))
    .then(loadImage)
    .then(async (image) => {
      const icon = shrink(image, image.width, image.height, 64);
      await put(`icons/item.${d.id}.png`, await blob(icon));
      // The encyclopedia's kinds not found yet show as their shape in the interface's brown.
      if (d.kind === "fish" || d.kind === "fossil") {
        const c = document.createElement("canvas");
        c.width = icon.width, c.height = icon.height;
        const g = c.getContext("2d")!;
        g.drawImage(icon, 0, 0);
        g.globalCompositeOperation = "source-in";
        g.fillStyle = "rgba(107, 86, 60, 0.4)";
        g.fillRect(0, 0, c.width, c.height);
        await put(`icons/item.${d.id}.shadow.png`, await blob(c));
      }
    })));
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

// ---------------------------------------------------------------- the island

/** What the console needs of a model besides its parts: how wide a shadow it throws, whether it is a lamp. */
interface IslandModel {
  name: string;
  /** The blob shadow's radius under it, tiles; 0 for none. */
  shadow: number;
  /** 1: a lamp, lit after dark. 2: the ground or water of a chunk. 4: one of the player's parts. 16: one
   * of the island's things, drawn where the core lists it (not placed). */
  flags: number;
}

/** What the core lists to draw (src/core/things.ts view), by its number: the items with models of their
 * own lying down, the tools as held, and the marks. A fish or a fossil dropped lies as a bundle. */
const THING_CODES = [
  ...ITEMS.filter((d) => d.kind === "tool" || d.kind === "material" || d.kind === "shell" || d.kind === "fruit").map((d) => d.id),
  SHOW.buried, SHOW.float, SHOW.bundle, SHOW.keeper,
];

/** A model standing on the island: its origin, and its turn about y. */
interface Placed {
  model: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const SHADOW: Partial<Record<PropKind, number>> = { tree: 1.0, fruit: 1.0, cedar: 0.85, palm: 0.7, bush: 0.5, rock: 0.48, lamp: 0.22, mailbox: 0.24, stall: 1.25 };

function exportIsland(): { parts: Record<string, PartIR[]>; data: unknown } {
  const m = makeIsland();
  const field = buildField(m);
  const shore = shoreField(m);
  const height = (x: number, z: number) => fieldHeight(field, x, z);
  const models: IslandModel[] = [];
  const parts: Record<string, PartIR[]> = {};
  const placed: Placed[] = [];
  const model = (name: string, object: THREE.Object3D, shadow = 0, flags = 0) => {
    parts[name] = partsOf(object);
    models.push({ name, shadow, flags });
    return models.length - 1;
  };
  // The ground and water, chunk by chunk, each about its own middle.
  for (let cj = 0; cj * CHUNK < m.d; cj++) for (let ci = 0; ci * CHUNK < m.w; ci++) {
    const g = new THREE.Group();
    const ground = chunkMesh(field, ci, cj);
    ground.position.set(0, 0, 0);
    g.add(ground);
    const sea = seaChunk(m, shore, ci, cj);
    if (sea) {
      sea.position.set(0, 0, 0);
      g.add(sea);
    }
    g.add(buildRiver(m, [ci, cj]));
    const w = Math.min(CHUNK, m.w - ci * CHUNK), d = Math.min(CHUNK, m.d - cj * CHUNK);
    for (const child of g.children) child.position.set(-w / 2, 0, -d / 2);
    placed.push({ model: model(`chunk:${ci},${cj}`, g, 0, 2), x: ci * CHUNK + w / 2, y: 0, z: cj * CHUNK + d / 2, yaw: 0 });
  }
  // The house, the bridges and the inclines' steps: each about the middle of its rectangle.
  const [hx0, hz0, hx1, hz1] = m.house.rect;
  placed.push({ model: model("house", buildHouse(), 2.6), x: (hx0 + hx1) / 2, y: height((hx0 + hx1) / 2, hz1 + 0.2), z: (hz0 + hz1) / 2, yaw: 0 });
  const centred = (name: string, object: THREE.Object3D, rect: readonly number[]) => {
    const cx = (rect[0]! + rect[2]!) / 2, cz = (rect[1]! + rect[3]!) / 2;
    const g = new THREE.Group();
    g.add(object);
    object.position.x -= cx;
    object.position.z -= cz;
    placed.push({ model: model(name, g), x: cx, y: 0, z: cz, yaw: 0 });
  };
  m.bridges.forEach((b, i) => centred(`bridge:${i}`, buildBridge(b), b.rect));
  m.ramps.forEach((r, i) => centred(`ramp:${i}`, buildRampSteps(r), r.rect));
  // Each prop's looks, then every prop.
  const look = new Map<string, number>();
  for (const kind of Object.keys(PROP_VARIANTS) as PropKind[]) {
    for (let v = 0; v < PROP_VARIANTS[kind]; v++) look.set(`${kind}:${v}`, model(`prop:${kind}:${v}`, propModel(kind, v), SHADOW[kind] ?? 0, kind === "lamp" ? 1 : 0));
  }
  // Shells are the island's things, which the core washes in each day; the recipe's are not drawn.
  for (const p of m.props) if (p.kind !== "shell") placed.push({ model: look.get(`${p.kind}:${Math.min(p.variant, PROP_VARIANTS[p.kind] - 1)}`)!, x: p.x, y: height(p.x, p.z), z: p.z, yaw: p.rot });
  // The island's things, each a model of its own, drawn where the core lists it; a tool with how it is held.
  const things = THING_CODES.map((code) => {
    const def = itemDef(code);
    const object = code === SHOW.buried ? buriedModel() : code === SHOW.float ? floatModel() : code === SHOW.bundle ? bundleModel() : code === SHOW.keeper ? keeperModel() : itemModel(code);
    const shadow = def?.kind === "tool" || code === SHOW.buried || code === SHOW.float ? 0 : def?.kind === "fruit" ? 0.13 : code === SHOW.keeper ? 0 : 0.17;
    const hold = def && HOLD[def.key];
    return { code, model: model(`thing:${code}`, object, shadow, 16), shadow, hold: hold ? { at: hold.at, turn: hold.turn, tip: -hold.tip[1] } : null };
  });
  // The player's parts, each in its joint's frame.
  const player = partModels();
  const partIndex = PART_NAMES.map((name) => model(`player:${name}`, player[name], 0, 4));
  const data = {
    w: m.w, d: m.d,
    tier: btoa(String.fromCharCode(...m.tier)),
    ground: btoa(String.fromCharCode(...m.ground)),
    ramps: m.ramps, bridges: m.bridges, house: m.house, shop: m.shop, spawn: m.spawn,
    props: m.props.filter((p) => PROP_RADIUS[p.kind] > 0),
    models, placed, parts: partIndex, joints: JOINTS,
    lamp: PROP_LIGHT.lamp,
    things,
  };
  return { parts, data };
}

/**
 * The island's map as the console's phone shows it (apps/island-3ds/phone.tsx): three pixels a tile, the
 * sea all round, on a 256 × 256 picture (the console's pictures are powers of two) whose top 198 rows fill
 * the phone's screen under its status bar; the rows below are clear, so the screen need not clip it. It is
 * shown the size it is, so the console samples one texel a pixel: a larger picture shrunk to fit cost the
 * GPU 1.7 ms a frame.
 */
const PHONE_MAP = { w: 256, h: 256, shown: 198, tile: 3 } as const;
async function exportMap(): Promise<void> {
  const m = makeIsland();
  const c = document.createElement("canvas");
  c.width = PHONE_MAP.w;
  c.height = PHONE_MAP.h;
  const g = c.getContext("2d")!;
  g.fillStyle = MAP_COLORS.deep;
  g.fillRect(0, 0, c.width, PHONE_MAP.shown);
  g.translate(Math.round((PHONE_MAP.w - m.w * PHONE_MAP.tile) / 2), Math.round((PHONE_MAP.shown - m.d * PHONE_MAP.tile) / 2));
  drawMap(g, m, PHONE_MAP.tile);
  await put("island/map.png", await blob(c));
}

async function run(): Promise<void> {
  // The sets and showrooms are laid out by the room's rules, which are the island's core.
  await loadCore(coreUrl);
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
  status("island");
  const island = exportIsland();
  for (const list of Object.values(island.parts)) for (const part of list) triangles += geometries[part.geometry]!.indices / 3;
  await exportMap();
  await put("island.json", json(island.data));
  // The light the console draws by: the room's for each ceiling mode and look of the day, the island's
  // for each look, the room's shell and doormat, and the sea beyond the map (as sRGB).
  const deep = new THREE.Color().setRGB(SEA.deep[0], SEA.deep[1], SEA.deep[2], THREE.LinearSRGBColorSpace);
  await put("light.json", json({
    room: CEILING_MODES.flatMap((m) => PERIODS.map((t) => look(m, t))), outdoor: PERIODS.map((t) => outdoorLook(t)),
    shell: SHELL, doormat: DOORMAT, deepSea: `#${deep.getHexString()}`,
  }));
  status("geometry");
  await put("geometry.bin", new Blob(chunks));
  await put("models.json", json({ geometries, items: models, island: island.parts }));
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
  await exportItemIcons();
  await exportInterfaceIcons();
  status("textures");
  await put("textures.json", json(textures));
  await Promise.all(pending);
  await put("summary.json", json({ items: FURNITURE.length, variants: FURNITURE.reduce((n, d) => n + d.variants.length, 0), geometries: geometries.length, triangles, bytes: binBytes, textures: textures.length }));
  status("done");
}

run().catch((error) => status(`error: ${error instanceof Error ? error.stack : String(error)}`));
