#!/usr/bin/env bun
// The compiler for the 3DS: lowers what the export page wrote
// (.pocket-build/ir) to the pack the console reads (island.pack), and writes
// what the interface compiles from it (apps/island-3ds/generated/).
//
//   bun tools/cook.ts [--ir .pocket-build/ir] [--error 0.014]
//
// Per item and variant: each part's triangles are simplified until the
// surface would move more than `--error` tiles (an eighth of a pixel or so
// at the room's framing on the upper screen), then parts that draw alike
// (the same picture, blend and culling) are merged into one draw with the
// material's colours in the vertices. The pictures become PICA200 textures
// (ETC1, by devkitPro's tex3ds) with their mip chains. The pack's layout is
// programs/3ds-island/src/pack.h; both sides check PACK_VERSION.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { createCanvas, loadImage } from "../vendor/pocketjs/node_modules/@napi-rs/canvas";
import { THREE_DS_CONTAINER_IMAGE } from "../vendor/pocketjs/tools/3ds-toolchain.ts";

const root = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);
const opt = (key: string, fallback: string) => {
  const at = argv.indexOf(key);
  return at < 0 ? fallback : (argv[at + 1] ?? fallback);
};

export const PACK_VERSION = 6;
const IR = resolve(opt("--ir", join(root, ".pocket-build/ir")));
const OUT = join(root, ".pocket-build/3ds/romfs");
const GENERATED = join(root, "apps/island-3ds/generated");
/** Tiles the simplified surface may move. */
const ERROR = Number(opt("--error", "0.014"));
/** A variant's triangles at most, after simplification. */
const BUDGET = 2400;
/**
 * An island prop's: a tree stands seventy pixels tall on the upper screen, and twenty of them can
 * be in view. The ground's chunks and the player's parts have none.
 */
const PROP_BUDGET = 420;
const POS_SCALE = 2048;
const UV_SCALE = 1024;

// ---------------------------------------------------------------- the IR

interface MaterialIR {
  kind: "lit" | "glow" | "screen" | "emissive" | "sky" | "glass";
  color: string;
  emissive: string;
  strength: number;
  texture: number;
  wrap: [boolean, boolean];
  opacity: number;
  side: "front" | "back" | "double";
  metal: number;
  roughness: number;
  /** Lit by the rooms inside the house: its draws are kept apart, and the renderer lights them as the room is. */
  house?: boolean;
}
interface GeometryIR { offset: number; vertices: number; indices: number }
interface PartIR { geometry: number; material: MaterialIR }
interface TextureIR { key: string; width: number; height: number; file: string }

const catalog = JSON.parse(readFileSync(join(IR, "catalog.json"), "utf8"));
const models = JSON.parse(readFileSync(join(IR, "models.json"), "utf8")) as { geometries: GeometryIR[]; items: Record<string, PartIR[][]>; island: Record<string, PartIR[]> };
interface IslandIR {
  w: number; d: number; tier: string; ground: string;
  ramps: unknown[]; bridges: unknown[]; house: unknown; shop: unknown; spawn: unknown; props: unknown[];
  models: { name: string; shadow: number; flags: number }[];
  placed: { model: number; x: number; y: number; z: number; yaw: number }[];
  parts: number[];
  joints: Record<string, number>;
  lamp: { y: number; color: string; intensity: number; distance: number };
  /** The island's things: the core's number, the model, its shadow, and for a tool how it is held. */
  things: { code: number; model: number; shadow: number; hold: { at: [number, number, number]; turn: number; tip: number } | null }[];
}
const island = JSON.parse(readFileSync(join(IR, "island.json"), "utf8")) as IslandIR;
/** The light the export page worked out (src/scene/lighting.ts look, outdoorLook) and the room's shell (src/scene/shell.ts). */
interface LookIR { key: string; keyPower: number; sky: string; ground: string; fill: number; env: number; background: string; window: [string, string, boolean, number]; lamp: number; halo: number }
interface LightIR {
  room: LookIR[];
  outdoor: LookIR[];
  shell: { wallT: number; slab: number; skirtH: number; skirtD: number; slabColor: string; capColor: string; skirtColor: string };
  doormat: { w: number; d: number; h: number; inset: number; border: number; color: string; borderColor: string };
  deepSea: string;
  fishShadow: { color: string; opacity: number };
  fishingLine: { color: string; opacity: number };
}
const light = JSON.parse(readFileSync(join(IR, "light.json"), "utf8")) as LightIR;
/**
 * The island by night, lowered for the console: it has no environment map, tone curve or the
 * browser's lift in saturation, and its screen is dimmer, so the night's key, fill and environment
 * are raised (0.55, 0.42 and 0.12 in the browser) and its sky and ground lightened (the ground's
 * toward the grass), until the island at night looks on a New 3DS XL as the browser shows it.
 */
const CONSOLE_NIGHT: Partial<LookIR> = { keyPower: 0.9, fill: 0.62, env: 0.2, sky: "#5a6aa0", ground: "#34442e" };
const textureList = JSON.parse(readFileSync(join(IR, "textures.json"), "utf8")) as TextureIR[];
const bin = readFileSync(join(IR, "geometry.bin"));
const binBuffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);

function geometry(id: number) {
  const g = models.geometries[id]!;
  const n = g.vertices;
  return {
    positions: new Float32Array(binBuffer, g.offset, n * 3),
    normals: new Float32Array(binBuffer, g.offset + n * 12, n * 3),
    uvs: new Float32Array(binBuffer, g.offset + n * 24, n * 2),
    colors: new Float32Array(binBuffer, g.offset + n * 32, n * 4),
    indices: new Uint32Array(binBuffer, g.offset + n * 48, g.indices),
  };
}

const rgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

// ---------------------------------------------------------------- textures

/**
 * Pictures the console has no use for: a faint mottle reads as flat paint at 400 × 240, the grass's
 * blades and the river's ripples are left to the ground's and the water's colours.
 */
const DROPPED = new Set(["mottle", "drawn:grass", "drawn:ripple"]);

interface TextureOut { width: number; height: number; format: number; levels: number; bytes: Uint8Array; source: Uint8Array; alpha: boolean }
const texturesOut: TextureOut[] = [];
const textureIndex = new Map<string, number>();

const pow2 = (n: number) => 2 ** Math.round(Math.log2(Math.max(8, n)));
/** Pack format numbers (programs/3ds-island/src/pack.c format_of). */
const ETC1 = 5, ETC1A4 = 6;

async function picture(path: string, width: number, height: number): Promise<{ png: Uint8Array; alpha: boolean }> {
  const image = await loadImage(readFileSync(path));
  const canvas = createCanvas(width, height);
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(image, 0, 0, width, height);
  const data = g.getImageData(0, 0, width, height).data;
  let alpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) alpha = true;
  return { png: new Uint8Array(canvas.toBuffer("image/png")), alpha };
}

/**
 * A picture as a texture of at most `max` texels a side, by its file. Every texture is ETC1 (4 bits a
 * texel; ETC1A4, 8, where it has alpha) with its mip chain, made by devkitPro's tex3ds in one run of
 * the toolchain's container (`encodeTextures`).
 */
async function texture(path: string, sourceW: number, sourceH: number, max: number): Promise<number> {
  const key = `${path}@${max}`;
  const seen = textureIndex.get(key);
  if (seen !== undefined) return seen;
  const width = Math.min(max, pow2(sourceW)), height = Math.min(max, pow2(sourceH));
  const { png, alpha } = await picture(path, width, height);
  const id = texturesOut.length;
  texturesOut.push({ width, height, format: alpha ? ETC1A4 : ETC1, levels: 0, bytes: new Uint8Array(0), source: png, alpha });
  textureIndex.set(key, id);
  return id;
}

/** Levels down to 8 texels on the shorter side, and the bytes they take in this format. */
function chainBytes(t: TextureOut): { levels: number; bytes: number } {
  let w = t.width, h = t.height, levels = 0, bytes = 0;
  for (;;) {
    bytes += (w * h * (t.format === ETC1A4 ? 8 : 4)) / 8;
    levels++;
    if (w <= 8 || h <= 8) break;
    w >>= 1, h >>= 1;
  }
  return { levels, bytes };
}

async function encodeTextures(): Promise<void> {
  const cache = join(root, ".pocket-build/3ds/tex");
  mkdirSync(cache, { recursive: true });
  const jobs: { t: TextureOut; name: string }[] = [];
  for (const t of texturesOut) {
    const name = new Bun.CryptoHasher("sha256").update(t.source).update(String(t.format)).digest("hex").slice(0, 24);
    jobs.push({ t, name });
    if (!existsSync(join(cache, `${name}.bin`))) writeFileSync(join(cache, `${name}.png`), t.source);
  }
  const todo = jobs.filter((j) => !existsSync(join(cache, `${j.name}.bin`)));
  if (todo.length) {
    const lines = todo.map((j) => `tex3ds -f ${j.t.format === ETC1A4 ? "etc1a4" : "etc1"} -q high -m linear -z none -r -o /tex/${j.name}.bin /tex/${j.name}.png`).join(" && ");
    const run = Bun.spawnSync(["docker", "run", "--rm", "--network=none", "-v", `${cache}:/tex`, THREE_DS_CONTAINER_IMAGE, "bash", "-c", `export PATH=/opt/devkitpro/tools/bin:$PATH; ${lines}`], { stdout: "inherit", stderr: "inherit" });
    if (run.exitCode !== 0) throw new Error("cook: tex3ds failed");
    console.log(`cook: ${todo.length} texture(s) encoded`);
  }
  for (const { t, name } of jobs) {
    // With -z none tex3ds still writes its 4-byte compression header (type 0, then the size).
    const bytes = new Uint8Array(readFileSync(join(cache, `${name}.bin`))).subarray(4);
    const expect = chainBytes(t);
    if (bytes.length !== expect.bytes) throw new Error(`cook: ${name}: tex3ds wrote ${bytes.length} bytes; ${t.width}x${t.height} in ${expect.levels} levels is ${expect.bytes}`);
    t.bytes = bytes;
    t.levels = expect.levels;
  }
}

/** The texture a material reads on the console, or -1 for none. */
async function materialTexture(m: MaterialIR): Promise<number> {
  if (m.texture < 0) return -1;
  const t = textureList[m.texture]!;
  if (DROPPED.has(t.key)) return -1;
  // A rug or a picture on the wall can fill a good part of the upper screen; anything else
  // shows at less than 128 pixels there.
  const max = /^drawn:(rug|pic|starry-cloudrug)/.test(t.key) ? 256 : 128;
  return texture(join(IR, t.file), t.width, t.height, max);
}

// ---------------------------------------------------------------- geometry

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
/** How much a change of vertex colour counts against the simplification, per unit of colour, in tiles. */
const COLOR_WEIGHT = 0.12;

/** Faces meeting at less than this keep one normal: a fillet is smooth, a box's edge is sharp. */
const CREASE = Math.cos((50 * Math.PI) / 180);

/**
 * One part's triangles, simplified until they would move more than `error`.
 *
 * The export's vertices are split wherever a normal or a texture coordinate
 * changes, and a simplifier keeps every such seam: a rounded box made of a
 * few hundred split faces stays a few hundred faces. So the part is welded
 * by position first (and by texture coordinate where a picture is read),
 * simplified as one surface, and its normals are worked out again from the
 * faces that are left, split where two faces meet at more than CREASE.
 */
const simplifiedCache = new Map<string, ReturnType<typeof simplifyPart>>();
function simplified(id: number, error: number, textured: boolean) {
  const key = `${id}:${error}:${textured}`;
  let out = simplifiedCache.get(key);
  if (!out) simplifiedCache.set(key, (out = simplifyPart(id, error, textured)));
  return out;
}

function simplifyPart(id: number, error: number, textured: boolean) {
  const g = geometry(id);
  const n = g.positions.length / 3;
  const slots = new Map<string, number>();
  const remap = new Uint32Array(n);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
  // Whether the part's vertices carry colours of their own (the island's ground and sea).
  let painted = false;
  for (let i = 0; i < n * 4 && !painted; i++) if (Math.abs(g.colors[i]! - 1) > 1e-3) painted = true;
  for (let i = 0; i < n; i++) {
    const p = [g.positions[i * 3]!, g.positions[i * 3 + 1]!, g.positions[i * 3 + 2]!];
    let key = `${Math.round(p[0]! * 1e4)},${Math.round(p[1]! * 1e4)},${Math.round(p[2]! * 1e4)}`;
    if (textured) key += `,${Math.round(g.uvs[i * 2]! * 2048)},${Math.round(g.uvs[i * 2 + 1]! * 2048)}`;
    let at = slots.get(key);
    if (at === undefined) {
      at = positions.length / 3;
      slots.set(key, at);
      positions.push(p[0]!, p[1]!, p[2]!);
      uvs.push(g.uvs[i * 2]!, g.uvs[i * 2 + 1]!);
      colors.push(g.colors[i * 4]!, g.colors[i * 4 + 1]!, g.colors[i * 4 + 2]!, g.colors[i * 4 + 3]!);
    }
    remap[i] = at;
  }
  const welded = new Uint32Array(g.indices.length);
  for (let i = 0; i < welded.length; i++) welded[i] = remap[g.indices[i]!]!;
  const P = new Float32Array(positions);
  // A painted surface keeps its colours where they change: a path's edge, the wet sand, a cliff's layers.
  const indices = welded.length < 3 * 24 ? welded
    : painted ? MeshoptSimplifier.simplifyWithAttributes(welded, P, 3, new Float32Array(colors), 4, [COLOR_WEIGHT, COLOR_WEIGHT, COLOR_WEIGHT, COLOR_WEIGHT], null, 0, error, ["ErrorAbsolute"])[0]
    : MeshoptSimplifier.simplify(welded, P, 3, 0, error, ["ErrorAbsolute"])[0];

  // Normals again, per corner: the faces around a vertex that lie within CREASE of this face.
  const faces = indices.length / 3;
  const faceNormal = new Float32Array(faces * 3);
  const around = new Map<number, number[]>();
  for (let f = 0; f < faces; f++) {
    const [a, b, c] = [indices[f * 3]!, indices[f * 3 + 1]!, indices[f * 3 + 2]!];
    const e1 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
    const e2 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
    // Not normalized: a larger face weighs more.
    faceNormal[f * 3] = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
    faceNormal[f * 3 + 1] = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
    faceNormal[f * 3 + 2] = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    for (const v of [a, b, c]) {
      const list = around.get(v);
      if (list) list.push(f);
      else around.set(v, [f]);
    }
  }
  const unit = (f: number) => {
    const x = faceNormal[f * 3]!, y = faceNormal[f * 3 + 1]!, z = faceNormal[f * 3 + 2]!;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l] as const;
  };
  const outPositions: number[] = [], outNormals: number[] = [], outUvs: number[] = [], outColors: number[] = [], outIndices: number[] = [];
  const corners = new Map<string, number>();
  for (let f = 0; f < faces; f++) {
    const nf = unit(f);
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]!;
      let x = 0, y = 0, z = 0;
      for (const o of around.get(v)!) {
        const no = unit(o);
        if (no[0] * nf[0] + no[1] * nf[1] + no[2] * nf[2] < CREASE) continue;
        x += faceNormal[o * 3]!, y += faceNormal[o * 3 + 1]!, z += faceNormal[o * 3 + 2]!;
      }
      const l = Math.hypot(x, y, z) || 1;
      const normal = [x / l, y / l, z / l];
      const key = `${v}:${Math.round(normal[0]! * 127)},${Math.round(normal[1]! * 127)},${Math.round(normal[2]! * 127)}`;
      let at = corners.get(key);
      if (at === undefined) {
        at = outPositions.length / 3;
        corners.set(key, at);
        outPositions.push(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!);
        outNormals.push(normal[0]!, normal[1]!, normal[2]!);
        outUvs.push(uvs[v * 2]!, uvs[v * 2 + 1]!);
        outColors.push(colors[v * 4]!, colors[v * 4 + 1]!, colors[v * 4 + 2]!, colors[v * 4 + 3]!);
      }
      outIndices.push(at);
    }
  }
  return { positions: new Float32Array(outPositions), normals: new Float32Array(outNormals), uvs: new Float32Array(outUvs), colors: new Float32Array(outColors), indices: new Uint32Array(outIndices) };
}

interface Vertex {
  p: [number, number, number];
  n: [number, number, number];
  uv: [number, number];
  color: [number, number, number, number];
  emit: [number, number, number, number];
}

/** A draw: what its vertices share. */
interface Draw {
  texture: number;
  blend: 0 | 1;
  cull: 0 | 1 | 2;
  /** The house's windows, lit by its rooms. */
  house?: boolean;
  vertices: Vertex[];
  indices: number[];
}

/** SKY stands for the room's window picture, which follows the time of day. */
const SKY = -2;

function emission(m: MaterialIR): [number, number, number, number] {
  if (m.kind === "lit" || m.kind === "glass") return [0, 0, 0, 0];
  if (m.kind === "sky") return [255, 255, 255, 255];
  const [r, g, b] = m.kind === "screen" ? [255, 255, 255] : rgb(m.emissive);
  // Stored as a quarter of the strength: a shade's lit inside is 2.8.
  const k = Math.min(4, m.strength) / 4;
  // 0 in alpha: lights only while the item is on. 255: always.
  return [Math.round(r * k), Math.round(g * k), Math.round(b * k), m.kind === "emissive" ? 255 : 0];
}

async function variantDraws(parts: PartIR[], error: number): Promise<Draw[]> {
  const draws = new Map<string, Draw>();
  for (const part of parts) {
    const m = part.material;
    const tex = m.kind === "sky" ? SKY : await materialTexture(m);
    const blend = m.kind === "glass" ? 1 : 0;
    const cull = m.side === "double" ? 2 : m.side === "back" ? 1 : 0;
    const house = !!m.house;
    const key = `${tex}:${blend}:${cull}:${house}`;
    let draw = draws.get(key);
    if (!draw) draws.set(key, (draw = { texture: tex, blend, cull, house, vertices: [], indices: [] }));
    const g = simplified(part.geometry, error, tex >= 0);
    // Metal has no room to reflect here: its colour is what it shows.
    const [r, gg, b] = rgb(m.color);
    const alpha = m.kind === "glass" ? m.opacity : 1;
    const emit = emission(m);
    const remap = new Map<number, number>();
    for (const index of g.indices) {
      let at = remap.get(index);
      if (at === undefined) {
        at = draw.vertices.length;
        remap.set(index, at);
        // The material's colour times the vertex's own.
        const c = (k: number) => g.colors[index * 4 + k]!;
        draw.vertices.push({
          p: [g.positions[index * 3]!, g.positions[index * 3 + 1]!, g.positions[index * 3 + 2]!],
          n: [g.normals[index * 3]!, g.normals[index * 3 + 1]!, g.normals[index * 3 + 2]!],
          uv: [g.uvs[index * 2]!, g.uvs[index * 2 + 1]!],
          color: [Math.round(r * c(0)), Math.round(gg * c(1)), Math.round(b * c(2)), Math.round(255 * alpha * c(3))],
          emit,
        });
      }
      draw.indices.push(at);
    }
  }
  // A draw indexes 16 bits of vertices; a larger one is split by triangles. One with nothing to draw
  // is left out: the console's GPU hangs on a draw of no triangles.
  const out: Draw[] = [];
  for (const draw of draws.values()) {
    if (!draw.indices.length) continue;
    if (draw.vertices.length <= 65535) {
      out.push(draw);
      continue;
    }
    for (let start = 0; start < draw.indices.length; ) {
      const piece: Draw = { ...draw, vertices: [], indices: [] };
      const remap = new Map<number, number>();
      while (start < draw.indices.length && piece.vertices.length < 65530) {
        for (let k = 0; k < 3; k++) {
          const i = draw.indices[start + k]!;
          let at = remap.get(i);
          if (at === undefined) remap.set(i, (at = piece.vertices.push(draw.vertices[i]!) - 1));
          piece.indices.push(at);
        }
        start += 3;
      }
      out.push(piece);
    }
  }
  // Triangles in the order that reuses the vertex shader's recent results, vertices in the order the
  // triangles first read them.
  for (const draw of out) {
    const indices = new Uint32Array(draw.indices);
    const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
    const vertices: Vertex[] = new Array(unique);
    draw.vertices.forEach((v, old) => {
      const at = remap[old]!;
      if (at < unique) vertices[at] = v;
    });
    draw.vertices = vertices;
    draw.indices = Array.from(indices);
  }
  // Opaque first, then glass, so a variant's draws are already in their order.
  return out.sort((a, b) => a.blend - b.blend);
}

const triangles = (draws: Draw[]) => draws.reduce((n, d) => n + d.indices.length / 3, 0);

// ---------------------------------------------------------------- the pack

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;
  bytes(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.length;
  }
  align(n: number) {
    const pad = (n - (this.length % n)) % n;
    if (pad) this.bytes(new Uint8Array(pad));
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

function packVertices(vertices: Vertex[]): Uint8Array {
  const out = new ArrayBuffer(vertices.length * 24);
  const v = new DataView(out);
  const s16 = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x)));
  const s8 = (x: number) => Math.max(-127, Math.min(127, Math.round(x * 127)));
  vertices.forEach((x, i) => {
    const o = i * 24;
    v.setInt16(o, s16(x.p[0] * POS_SCALE), true);
    v.setInt16(o + 2, s16(x.p[1] * POS_SCALE), true);
    v.setInt16(o + 4, s16(x.p[2] * POS_SCALE), true);
    v.setInt16(o + 6, 0, true);
    v.setInt8(o + 8, s8(x.n[0]));
    v.setInt8(o + 9, s8(x.n[1]));
    v.setInt8(o + 10, s8(x.n[2]));
    v.setInt8(o + 11, 0);
    for (let c = 0; c < 4; c++) v.setUint8(o + 12 + c, x.color[c]!);
    for (let c = 0; c < 4; c++) v.setUint8(o + 16 + c, x.emit[c]!);
    v.setInt16(o + 20, s16(x.uv[0] * UV_SCALE), true);
    v.setInt16(o + 22, s16(x.uv[1] * UV_SCALE), true);
  });
  return new Uint8Array(out);
}

const tag = (s: string) => s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24);
const rgba32 = (hex: string, a = 255) => {
  const [r, g, b] = rgb(hex);
  return ((r | (g << 8) | (b << 16) | (a << 24)) >>> 0);
};
const KIND = { floor: 0, misc: 1, wall: 2, ceiling: 3, rug: 4 } as const;

/** FNV-1a over the items' ids and the finishes' in order: the interface and the pack name one catalogue. */
export function catalogueHash(items: { id: string }[], finishes: { id: string }[]): number {
  let h = 0x811c9dc5;
  for (const id of [...items.map((i) => i.id), "|", ...finishes.map((f) => f.id)]) {
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
    h = Math.imul(h ^ 0x2c, 0x01000193);
  }
  return h >>> 0;
}

async function cook() {
  const started = Date.now();
  const items = catalog.items as { id: string; kind: keyof typeof KIND; size: [number, number]; variants: unknown[]; switchable?: boolean; light?: { at: [number, number, number]; color: string; intensity: number; distance: number; halo: number }; category: string }[];
  const finishes = catalog.finishes as { id: string; kind: string; span: [number, number]; density: number; width: number; height: number; skirting?: string; cap?: string }[];

  // Per variant: its draws, then the bytes the console reads for it.
  const variantRecords: { offset: number; size: number; firstDraw: number; drawCount: number; min: number[]; max: number[]; triangles: number }[] = [];
  const drawRecords: { vtx: number; vtxCount: number; idx: number; idxCount: number; texture: number; blend: number; cull: number; emits: boolean; house?: boolean }[] = [];
  const mesh = new Writer();
  const itemRecords: { firstVariant: number; variantCount: number }[] = [];
  let total = 0, before = 0, heaviest = { id: "", tris: 0 };
  for (const item of items) {
    const variants = models.items[item.id]!;
    itemRecords.push({ firstVariant: variantRecords.length, variantCount: variants.length });
    for (const parts of variants) {
      before += parts.reduce((n, p) => n + models.geometries[p.geometry]!.indices / 3, 0);
      let error = ERROR;
      let draws = await variantDraws(parts, error);
      // A piece still over the budget is simplified harder until it fits.
      while (triangles(draws) > BUDGET && error < 0.05) {
        error *= 1.6;
        draws = await variantDraws(parts, error);
      }
      const tris = triangles(draws);
      total += tris;
      if (tris > heaviest.tris) heaviest = { id: item.id, tris };
      mesh.align(16);
      const start = mesh.length;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      const firstDraw = drawRecords.length;
      for (const draw of draws) {
        for (const v of draw.vertices) for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, v.p[k]!);
          max[k] = Math.max(max[k]!, v.p[k]!);
        }
        mesh.align(16);
        const vtx = mesh.length - start;
        mesh.bytes(packVertices(draw.vertices));
        mesh.align(16);
        const idx = mesh.length - start;
        mesh.bytes(new Uint8Array(new Uint16Array(draw.indices).buffer));
        drawRecords.push({ vtx, vtxCount: draw.vertices.length, idx, idxCount: draw.indices.length, texture: draw.texture, blend: draw.blend, cull: draw.cull, emits: draw.vertices.some((v) => v.emit[0] + v.emit[1] + v.emit[2] > 0), house: draw.house });
      }
      mesh.align(16);
      variantRecords.push({ offset: start, size: mesh.length - start, firstDraw, drawCount: draws.length, min, max, triangles: tris });
    }
  }

  // The island's models, after the furniture's variants: the ground's chunks simplified less (they
  // fill the screen), the props like furniture.
  const islandFirst = variantRecords.length;
  let islandTriangles = 0;
  const islandBy = { chunks: 0, chunkMax: 0, props: 0, cells: 0, player: 0 };
  // Each model's draws, simplified on its own: the ground's chunks less (they fill the screen), the
  // props to their budget.
  const cooked: Draw[][] = [];
  const tools = new Set(island.things.filter((t) => t.hold).map((t) => t.model));
  for (const [m, im] of island.models.entries()) {
    const parts = models.island[im.name]!;
    before += parts.reduce((n, p) => n + models.geometries[p.geometry]!.indices / 3, 0);
    // A tool is small and seen close, in hand: simplified far less.
    let error = tools.has(m) ? ERROR / 4 : im.flags & 2 ? ERROR * 0.8 : ERROR;
    let draws = await variantDraws(parts, error);
    const budget = im.flags & 6 ? Infinity : im.name === "house" ? BUDGET : PROP_BUDGET;
    while (triangles(draws) > budget && error < 0.12) {
      error *= 1.5;
      draws = await variantDraws(parts, error);
    }
    cooked.push(draws);
    if (process.env.COOK_VERBOSE) console.log(`cook: ${im.name} ${triangles(draws)} [${draws.map((d) => d.indices.length / 3).join(",")}]`);
  }
  // Everything that stands still is drawn with the cell of 4 × 4 tiles it stands in: each prop's
  // draws, turned and moved to where it stands, join the cell's draws that share their picture, blend
  // and culling. A cell is a handful of draws however much grows in it, and small enough that what is
  // out of view is culled with it.
  const CELL = 4;
  const cells = new Map<string, number>();
  const batched = new Set<number>();
  const merged = cooked.map((draws) => draws.map((d) => ({ ...d, vertices: d.vertices.slice(), indices: d.indices.slice() })));
  const placedProps = island.placed.length;
  for (let i = 0; i < placedProps; i++) {
    const p = island.placed[i]!;
    const im = island.models[p.model]!;
    if (im.flags & 6) continue;
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), name = `cell:${ci},${cj}`;
    let at = cells.get(name);
    if (at === undefined) {
      // A model of its own, standing at the cell's middle.
      island.models.push({ name, shadow: 0, flags: 8 });
      cooked.push([]);
      merged.push([]);
      island.placed.push({ model: island.models.length - 1, x: ci * CELL + CELL / 2, y: 0, z: cj * CELL + CELL / 2, yaw: 0 });
      cells.set(name, (at = island.placed.length - 1));
    }
    const home = island.placed[at]!;
    const target = merged[home.model]!;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    for (const d of cooked[p.model]!) {
      let into = target.find((t) => t.texture === d.texture && t.blend === d.blend && t.cull === d.cull && !!t.house === !!d.house && t.vertices.length + d.vertices.length <= 65535);
      if (!into) target.push((into = { texture: d.texture, blend: d.blend, cull: d.cull, house: d.house, vertices: [], indices: [] }));
      const base = into.vertices.length;
      for (const v of d.vertices) {
        into.vertices.push({
          ...v,
          p: [v.p[0] * c + v.p[2] * sn + p.x - home.x, v.p[1] + p.y - home.y, -v.p[0] * sn + v.p[2] * c + p.z - home.z],
          n: [v.n[0] * c + v.n[2] * sn, v.n[1], -v.n[0] * sn + v.n[2] * c],
        });
      }
      for (const k of d.indices) into.indices.push(base + k);
    }
    batched.add(i);
  }
  for (const draws of merged) {
    for (const draw of draws) {
      const indices = new Uint32Array(draw.indices);
      const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
      const vertices: Vertex[] = new Array(unique);
      draw.vertices.forEach((v, old) => {
        const at = remap[old]!;
        if (at < unique) vertices[at] = v;
      });
      draw.vertices = vertices;
      draw.indices = Array.from(indices);
    }
    draws.sort((a, b) => a.blend - b.blend);
  }
  island.models.forEach((im, i) => {
    // A prop's own mesh is not drawn (its chunk draws it): only its bounds are kept, for its shadow.
    const alone = im.flags & 6 || island.placed.every((p, k) => p.model !== i || !batched.has(k));
    const draws = alone ? merged[i]! : [];
    const tris = triangles(draws);
    islandTriangles += tris;
    if (im.flags & 2) {
      islandBy.chunks += tris;
      islandBy.chunkMax = Math.max(islandBy.chunkMax, tris);
    } else if (im.flags & 4) islandBy.player += tris;
    else if (im.flags & 8) islandBy.cells += tris;
    else islandBy.props += triangles(cooked[i]!);
    mesh.align(16);
    const start = mesh.length;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const draw of cooked[i]!.length && !draws.length ? cooked[i]! : draws) {
      for (const v of draw.vertices) for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, v.p[k]!);
        max[k] = Math.max(max[k]!, v.p[k]!);
      }
    }
    const firstDraw = drawRecords.length;
    for (const draw of draws) {
      mesh.align(16);
      const vtx = mesh.length - start;
      mesh.bytes(packVertices(draw.vertices));
      mesh.align(16);
      const idx = mesh.length - start;
      mesh.bytes(new Uint8Array(new Uint16Array(draw.indices).buffer));
      drawRecords.push({ vtx, vtxCount: draw.vertices.length, idx, idxCount: draw.indices.length, texture: draw.texture, blend: draw.blend, cull: draw.cull, emits: draw.vertices.some((v) => v.emit[0] + v.emit[1] + v.emit[2] > 0), house: draw.house });
    }
    mesh.align(16);
    if (min[0] === Infinity) for (let k = 0; k < 3; k++) min[k] = max[k] = 0;
    variantRecords.push({ offset: start, size: mesh.length - start, firstDraw, drawCount: draws.length, min, max, triangles: tris });
  });

  // The finishes: a wallpaper is one tile wide and the wall's height tall; a flooring covers its span.
  const finishRecords: { kind: number; texture: number; span: [number, number]; skirting: number; cap: number }[] = [];
  for (const f of finishes) {
    const across = f.kind === "wallpaper" ? 128 : pow2(64 * f.span[0]);
    const along = f.kind === "wallpaper" ? 256 : pow2(64 * f.span[1]);
    const id = await texture(join(IR, `finish/${f.id}.png`), Math.min(256, across), Math.min(256, along), 256);
    finishRecords.push({ kind: f.kind === "wallpaper" ? 0 : 1, texture: id, span: f.span, skirting: rgba32(f.skirting ?? "#a7744a"), cap: rgba32(f.cap ?? "#6e4a32") });
  }

  await encodeTextures();

  // ---------------------------------------------------------------- sections
  const sections: { tag: string; bytes: Uint8Array; count: number }[] = [];
  const table = (size: number, count: number, write: (v: DataView, o: number, i: number) => void) => {
    const buf = new ArrayBuffer(size * count);
    const v = new DataView(buf);
    for (let i = 0; i < count; i++) write(v, i * size, i);
    return new Uint8Array(buf);
  };
  // ITEM, 48 bytes: first variant, variant count, kind, flags, size, the light.
  sections.push({ tag: "ITEM", count: items.length, bytes: table(48, items.length, (v, o, i) => {
    const it = items[i]!, rec = itemRecords[i]!;
    v.setUint16(o, rec.firstVariant, true);
    v.setUint16(o + 2, rec.variantCount, true);
    v.setUint8(o + 4, KIND[it.kind]);
    v.setUint8(o + 5, (it.switchable || it.light ? 1 : 0) | (it.light ? 2 : 0) | (it.category === "window" ? 4 : 0));
    v.setFloat32(o + 8, it.size[0], true);
    v.setFloat32(o + 12, it.size[1], true);
    const l = it.light;
    v.setFloat32(o + 16, l?.at[0] ?? 0, true);
    v.setFloat32(o + 20, l?.at[1] ?? 0, true);
    v.setFloat32(o + 24, l?.at[2] ?? 0, true);
    v.setUint32(o + 28, l ? rgba32(l.color) : 0, true);
    v.setFloat32(o + 32, l?.intensity ?? 0, true);
    v.setFloat32(o + 36, l?.distance ?? 0, true);
    v.setFloat32(o + 40, l?.halo ?? 0, true);
  }) });
  // VARI, 40 bytes: where its bytes are in MESH, its draws, its bounds.
  sections.push({ tag: "VARI", count: variantRecords.length, bytes: table(40, variantRecords.length, (v, o, i) => {
    const r = variantRecords[i]!;
    v.setUint32(o, r.offset, true);
    v.setUint32(o + 4, r.size, true);
    v.setUint16(o + 8, r.firstDraw, true);
    v.setUint16(o + 10, r.drawCount, true);
    v.setUint32(o + 12, r.triangles, true);
    for (let k = 0; k < 3; k++) {
      v.setFloat32(o + 16 + k * 4, r.min[k]!, true);
      v.setFloat32(o + 28 + k * 4, r.max[k]!, true);
    }
  }) });
  // DRAW, 20 bytes: offsets from the variant's start, the texture, how it blends (1 glass, 2 gives off
  // light, 4 the house's windows, lit by its rooms) and culls.
  sections.push({ tag: "DRAW", count: drawRecords.length, bytes: table(20, drawRecords.length, (v, o, i) => {
    const d = drawRecords[i]!;
    v.setUint32(o, d.vtx, true);
    v.setUint32(o + 4, d.vtxCount, true);
    v.setUint32(o + 8, d.idx, true);
    v.setUint32(o + 12, d.idxCount, true);
    v.setInt16(o + 16, d.texture, true);
    v.setUint8(o + 18, d.blend | (d.emits ? 2 : 0) | (d.house ? 4 : 0));
    v.setUint8(o + 19, d.cull);
  }) });
  sections.push({ tag: "MESH", count: 0, bytes: mesh.done() });
  // TEXT, 16 bytes: where its levels are in TEXD, its size, format and level count.
  const texd = new Writer();
  const texOffsets = texturesOut.map((t) => {
    texd.align(128);
    const at = texd.length;
    texd.bytes(t.bytes);
    return at;
  });
  sections.push({ tag: "TEXT", count: texturesOut.length, bytes: table(16, texturesOut.length, (v, o, i) => {
    const t = texturesOut[i]!;
    v.setUint32(o, texOffsets[i]!, true);
    v.setUint32(o + 4, t.bytes.length, true);
    v.setUint16(o + 8, t.width, true);
    v.setUint16(o + 10, t.height, true);
    v.setUint8(o + 12, t.format);
    v.setUint8(o + 13, t.levels);
  }) });
  sections.push({ tag: "TEXD", count: 0, bytes: texd.done() });
  // FINI, 20 bytes: wallpaper or flooring, its texture, its span, the skirting's and the cut top's colours.
  sections.push({ tag: "FINI", count: finishRecords.length, bytes: table(20, finishRecords.length, (v, o, i) => {
    const f = finishRecords[i]!;
    v.setUint8(o, f.kind);
    v.setInt16(o + 2, f.texture, true);
    v.setFloat32(o + 4, f.span[0], true);
    v.setFloat32(o + 8, f.span[1], true);
    v.setUint32(o + 12, f.skirting, true);
    v.setUint32(o + 16, f.cap, true);
  }) });

  // ISLE, 64 bytes: the map's size, the player's part models, its joints, the island's lamps.
  {
    const v = new DataView(new ArrayBuffer(64));
    v.setUint16(0, island.w, true);
    v.setUint16(2, island.d, true);
    island.parts.forEach((p, k) => v.setUint16(4 + k * 2, p, true));
    const j = island.joints;
    [j.hip!, j.hipX!, j.shoulder!, j.shoulderX!, j.neck!].forEach((x, k) => v.setFloat32(16 + k * 4, x, true));
    v.setFloat32(36, island.lamp.y, true);
    v.setFloat32(40, island.lamp.intensity, true);
    v.setFloat32(44, island.lamp.distance, true);
    v.setUint32(48, rgba32(island.lamp.color), true);
    sections.push({ tag: "ISLE", count: 1, bytes: new Uint8Array(v.buffer) });
  }
  // MODL, 16 bytes: an island model's variant, its shadow's radius, flags, and its bounding radius.
  sections.push({ tag: "MODL", count: island.models.length, bytes: table(16, island.models.length, (v, o, i) => {
    const im = island.models[i]!, r = variantRecords[islandFirst + i]!;
    v.setUint32(o, islandFirst + i, true);
    v.setFloat32(o + 4, im.shadow, true);
    v.setUint32(o + 8, im.flags, true);
    v.setFloat32(o + 12, Math.hypot(...[0, 1, 2].map((k) => Math.max(Math.abs(r.min[k]!), Math.abs(r.max[k]!)))), true);
  }) });
  // THNG, 32 bytes: what the core lists to draw, by its number: the model, its shadow's radius, and a
  // tool's hold in the right hand (the hand's place on the arm, the turn forward, the tip's distance).
  sections.push({ tag: "THNG", count: island.things.length, bytes: table(32, island.things.length, (v, o, i) => {
    const t = island.things[i]!;
    v.setUint16(o, t.code, true);
    v.setUint16(o + 2, t.model, true);
    v.setFloat32(o + 4, t.shadow, true);
    const h = t.hold ?? { at: [0, 0, 0], turn: 0, tip: 0 };
    h.at.forEach((x, k) => v.setFloat32(o + 8 + k * 4, x, true));
    v.setFloat32(o + 20, h.turn, true);
    v.setFloat32(o + 24, h.tip, true);
  }) });
  // INST, 20 bytes: a model standing on the island: which, flags (1: drawn with its chunk), where, turned how.
  sections.push({ tag: "INST", count: island.placed.length, bytes: table(20, island.placed.length, (v, o, i) => {
    const p = island.placed[i]!;
    v.setUint16(o, p.model, true);
    v.setUint16(o + 2, batched.has(i) ? 1 : 0, true);
    v.setFloat32(o + 4, p.x, true);
    v.setFloat32(o + 8, p.y, true);
    v.setFloat32(o + 12, p.z, true);
    v.setFloat32(o + 16, p.yaw, true);
  }) });

  // LOOK, 52 bytes: the light at a look of the day: the room's for each ceiling mode and look (mode x 3
  // + look: warm, cool, off; day, dusk, night), then the island's for each look.
  const looks = [...light.room, ...light.outdoor.map((l, k) => (k === 2 ? { ...l, ...CONSOLE_NIGHT } : l))];
  sections.push({ tag: "LOOK", count: looks.length, bytes: table(52, looks.length, (v, o, i) => {
    const l = looks[i]!;
    [l.key, l.sky, l.ground, l.background, l.window[0], l.window[1]].forEach((c, k) => v.setUint32(o + k * 4, rgba32(c), true));
    [l.keyPower, l.fill, l.env, l.window[3], l.lamp, l.halo].forEach((x, k) => v.setFloat32(o + 24 + k * 4, x, true));
    v.setUint32(o + 48, l.window[2] ? 1 : 0, true);
  }) });
  // SCEN, 72 bytes: the room's shell and doormat, the sea's colour beyond the map, and the fish's
  // shadows and the fishing line (each with its strength in its alpha).
  {
    const v = new DataView(new ArrayBuffer(72));
    const s = light.shell, m = light.doormat, fish = light.fishShadow, line = light.fishingLine;
    [s.wallT, s.slab, s.skirtH, s.skirtD, m.w, m.d, m.h, m.inset, m.border].forEach((x, k) => v.setFloat32(k * 4, x, true));
    [s.slabColor, s.capColor, s.skirtColor, m.borderColor, m.color, light.deepSea].forEach((c, k) => v.setUint32(36 + k * 4, rgba32(c), true));
    v.setUint32(60, rgba32(fish.color, Math.round(fish.opacity * 255)), true);
    v.setUint32(64, rgba32(line.color, Math.round(line.opacity * 255)), true);
    sections.push({ tag: "SCEN", count: 1, bytes: new Uint8Array(v.buffer) });
  }

  // Header, 16 bytes: magic, version, section count, the catalogue's hash. Then 16 bytes a section.
  const hash = catalogueHash(items, finishes);
  const pack = new Writer();
  const head = new DataView(new ArrayBuffer(16 + sections.length * 16));
  head.setUint32(0, tag("PIPK"), true);
  head.setUint32(4, PACK_VERSION, true);
  head.setUint32(8, sections.length, true);
  head.setUint32(12, hash, true);
  let at = 16 + sections.length * 16;
  const offsets: number[] = [];
  for (const s of sections) {
    at = Math.ceil(at / 128) * 128;
    offsets.push(at);
    at += s.bytes.length;
  }
  sections.forEach((s, i) => {
    head.setUint32(16 + i * 16, tag(s.tag), true);
    head.setUint32(20 + i * 16, offsets[i]!, true);
    head.setUint32(24 + i * 16, s.bytes.length, true);
    head.setUint32(28 + i * 16, s.count, true);
  });
  pack.bytes(new Uint8Array(head.buffer));
  sections.forEach((s, i) => {
    pack.bytes(new Uint8Array(offsets[i]! - pack.length));
    pack.bytes(s.bytes);
  });
  mkdirSync(OUT, { recursive: true });
  const bytes = pack.done();
  writeFileSync(join(OUT, "island.pack"), bytes);

  await generateInterface(hash);
  const receipt = {
    pack: { bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), catalogue: hash.toString(16) },
    variants: variantRecords.length, draws: drawRecords.length, textures: texturesOut.length,
    textureBytes: texd.length, meshBytes: mesh.length,
    triangles: { before, after: total, mean: Math.round(total / (variantRecords.length - island.models.length)), heaviest, island: { total: islandTriangles, ...islandBy, batched: batched.size } },
    error: ERROR, seconds: (Date.now() - started) / 1000,
  };
  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(receipt, null, 1) + "\n");
  console.log(`cook: ${JSON.stringify(receipt)}`);
}

// ---------------------------------------------------------------- what the interface compiles from

async function generateInterface(hash: number) {
  rmSync(GENERATED, { recursive: true, force: true });
  mkdirSync(join(GENERATED, "icons"), { recursive: true });
  mkdirSync(join(GENERATED, "ui"), { recursive: true });
  // The build packs an image only when its name is a string in the source: the table below names
  // each one. A pak image is a square of a power of two; these are 16-bit (PSM_4444) and sampled
  // linearly, since the cards draw them smaller than they are stored.
  const images: Record<string, unknown> = {};
  const icons: Record<string, string> = {};
  const add = (key: string, from: string, to: string) => {
    copyFileSync(from, join(GENERATED, to));
    images[`generated/${to}`] = { linear: true, psm: 2 };
    icons[key] = `generated/${to}`;
  };
  for (const item of catalog.items as { id: string; variants: unknown[] }[]) {
    for (let v = 0; v < item.variants.length; v++) add(`${item.id}.${v}`, join(IR, `icons/${item.id}.${v}.png`), `icons/${item.id}.${v}.png`);
  }
  for (const f of catalog.finishes as { id: string }[]) add(`finish:${f.id}`, join(IR, `finish/${f.id}.swatch.png`), `icons/finish-${f.id}.png`);
  for (const file of new Bun.Glob("*.32.png").scanSync(join(IR, "ui"))) add(`ui:${file.replace(".32.png", "")}`, join(IR, "ui", file), `ui/${file}`);
  add("island:map", join(IR, "island/map.png"), "icons/island-map.png");
  for (const file of new Bun.Glob("item.*.png").scanSync(join(IR, "icons"))) add(`item:${file.slice(5, -4)}`, join(IR, "icons", file), `icons/${file}`);
  writeFileSync(join(root, "apps/island-3ds/images.json"), JSON.stringify(images, null, 1) + "\n");
  const { items, finishes, presets, showrooms, series, sizes, categories, limits } = catalog;
  const { w, d, tier, ground, ramps, bridges, house, shop, spawn, props } = island;
  writeFileSync(join(GENERATED, "island.ts"), `// Generated by tools/cook.ts from the export (.pocket-build/ir/island.json). Do not edit.
import type { IslandData } from "../island-types.ts";

/** The island's map as the browser made it (src/core/island.ts): tiers and ground as base64, one byte a tile. */
export const ISLAND: IslandData = ${JSON.stringify({ w, d, tier, ground, ramps, bridges, house, shop, spawn, props })};
`);
  const lean = finishes.map(({ width: _w, height: _h, density: _d, ...f }: Record<string, unknown>) => f);
  writeFileSync(join(GENERATED, "catalog.ts"), `// Generated by tools/cook.ts from the export (.pocket-build/ir/catalog.json). Do not edit.
import type { CatalogData } from "../catalog-types.ts";

/** The pack's catalogue: the renderer refuses a room numbered by another. */
export const CATALOG_HASH = ${hash};

export const DATA: CatalogData = ${JSON.stringify({ items, finishes: lean, presets, showrooms, series, sizes, categories, limits })};

/** Every picture the interface shows, by item and variant ("id.v"), finish ("finish:id") or icon ("ui:name"). */
export const PICTURES: Record<string, string> = {
${Object.entries(icons).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}
};
`);
}

if (!existsSync(join(IR, "summary.json"))) throw new Error(`cook: no export at ${IR}: run \`bun tools/export.ts\` first`);
await cook();
