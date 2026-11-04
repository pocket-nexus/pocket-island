// The island's ground, built from its map (src/core/island.ts): one height
// field over the whole island, four samples a tile, in chunks of 12 × 12
// tiles. Each tier is a soft step whose edge follows the tiles: a beach that
// slopes gently into the sea, a bank up to the island's floor, and cliffs
// that rise steeply with a rounded lip, the way island cliffs are drawn. The
// river and the pond are dug into it; an incline is a slope cut into its
// cliff. The ground's colour is in its vertices: grass by tier, rock on the
// cliff faces in layers, sand, wet sand at the water, worn paths.
//
// The water is separate: the sea is one large plane whose colour and foam
// follow the distance to land; the river and pond are flat sheets at their
// level, with falls where the river drops a tier.

import * as THREE from "three";
import {
  GROUND, SEA_LEVEL, TIER_Y, WATER_DROP, distanceField, groundAt, isWet, rampRise, tierAt, waterLevel, type IslandMap, type Ramp,
} from "../core/island.ts";
import { canvas, toTexture } from "../scene/textures.ts";

/** Samples a tile. */
export const SAMPLES = 4;
/** Tiles a chunk, each way. */
export const CHUNK = 12;

/** Heights and the masks the colours are made from, at the sample grid's corners. */
export interface Field {
  /** Corners across (w × SAMPLES + 1) and down. */
  nx: number;
  nz: number;
  height: Float32Array;
  /** 0..1 weights per corner. */
  sand: Float32Array;
  path: Float32Array;
  wet: Float32Array;
  tier: Float32Array;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A pixel grid's signed distance to where `inside` holds, in tiles: positive inside. */
function signed(px: number, pz: number, inside: (a: number, b: number) => boolean): Float32Array {
  const din = distanceField(px, pz, (a, b) => !inside(a, b));
  const dout = distanceField(px, pz, inside);
  const out = new Float32Array(px * pz);
  for (let k = 0; k < out.length; k++) {
    const a = k % px, b = (k / px) | 0;
    out[k] = (inside(a, b) ? din[k]! - 0.5 : -(dout[k]! - 0.5)) / SAMPLES;
  }
  return out;
}

/** A little wobble along a cliff's face, so its edge is not ruled. */
const wobble = (x: number, z: number) =>
  0.055 * Math.sin(x * 2.1 + z * 0.7) + 0.04 * Math.sin(z * 2.9 - x * 1.3 + 1.1) + 0.025 * Math.sin((x + z) * 5.3);

/** The ground's height at an incline's point, or -Infinity off it (sides reach a little past its edges). */
function rampHeight(r: Ramp, x: number, z: number): number {
  const [x0, z0, x1, z1] = r.rect;
  const side = r.up === "n" || r.up === "s" ? [x0, x1, x] : [z0, z1, z];
  const along = r.up === "n" || r.up === "s" ? [z0, z1, z] : [x0, x1, x];
  if (side[2]! < side[0]! - 0.05 || side[2]! > side[1]! + 0.05) return -Infinity;
  if (along[2]! < along[0]! - 0.001 || along[2]! > along[1]! + 0.001) return -Infinity;
  return r.low + (r.high - r.low) * rampRise(r, Math.min(x1, Math.max(x0, x)), Math.min(z1, Math.max(z0, z)));
}

export function buildField(m: IslandMap): Field {
  const px = m.w * SAMPLES, pz = m.d * SAMPLES;
  const tileOf = (a: number, b: number): [number, number] => [Math.floor(a / SAMPLES), Math.floor(b / SAMPLES)];
  const land = (a: number, b: number) => {
    const [i, j] = tileOf(a, b);
    return groundAt(m, i, j) !== GROUND.sea;
  };
  const dLand = signed(px, pz, land);
  const dTier = [1, 2, 3].map((t) => signed(px, pz, (a, b) => {
    const [i, j] = tileOf(a, b);
    return groundAt(m, i, j) !== GROUND.sea && tierAt(m, i, j) >= t;
  }));
  const dWet = signed(px, pz, (a, b) => {
    const [i, j] = tileOf(a, b);
    return groundAt(m, i, j) === GROUND.water;
  });
  const dPath = signed(px, pz, (a, b) => {
    const [i, j] = tileOf(a, b);
    return groundAt(m, i, j) === GROUND.path;
  });
  // Pixel heights, then each corner the mean of the four pixels around it.
  const pixel = new Float32Array(px * pz);
  const STEPS = [TIER_Y[1] - TIER_Y[0], TIER_Y[2] - TIER_Y[1], TIER_Y[3] - TIER_Y[2]];
  const WIDTH = [0.42, 0.11, 0.11];
  for (let b = 0; b < pz; b++) for (let a = 0; a < px; a++) {
    const k = b * px + a;
    const x = (a + 0.5) / SAMPLES, z = (b + 0.5) / SAMPLES;
    const shore = dLand[k]!;
    // The sea floor drops away from the beach.
    let h = shore >= 0 ? 0 : -0.32 - 0.9 * smoothstep(0, 4, -shore);
    h *= 1 - smoothstep(-0.9, 0.45, shore);
    for (let t = 0; t < 3; t++) {
      const d = dTier[t]! [k]! + (t > 0 ? wobble(x, z) : 0.05 * Math.sin(x * 1.3 + z * 0.9));
      h += STEPS[t]! * smoothstep(-WIDTH[t]!, WIDTH[t]!, d);
    }
    // River and pond beds, below their water.
    h -= (WATER_DROP + 0.3) * smoothstep(-0.12, 0.55, dWet[k]!);
    pixel[k] = h;
  }
  const nx = px + 1, nz = pz + 1;
  const corner = (src: Float32Array, map: (v: number) => number = (v) => v) => {
    const out = new Float32Array(nx * nz);
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      let sum = 0, n = 0;
      for (const [da, db] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const ia = Math.min(px - 1, Math.max(0, a + da)), ib = Math.min(pz - 1, Math.max(0, b + db));
        sum += map(src[ib * px + ia]!);
        n++;
      }
      out[b * nx + a] = sum / n;
    }
    return out;
  };
  const height = corner(pixel);
  // Inclines: the slope, with the cliff walls rising beside it.
  for (const r of m.ramps) {
    for (let b = Math.floor(r.rect[1] * SAMPLES) - 1; b <= Math.ceil(r.rect[3] * SAMPLES) + 1; b++) {
      for (let a = Math.floor(r.rect[0] * SAMPLES) - 1; a <= Math.ceil(r.rect[2] * SAMPLES) + 1; a++) {
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const rh = rampHeight(r, a / SAMPLES, b / SAMPLES);
        if (rh > -Infinity) height[b * nx + a] = rh;
      }
    }
  }
  return {
    nx, nz, height,
    sand: corner(dLand, () => 0).map((_, k) => {
      const a = k % nx, b = (k / nx) | 0;
      return 1 - smoothstep(-0.35, 0.35, sampleSigned(dTier[0]!, px, pz, a, b));
    }),
    path: corner(dPath, (v) => smoothstep(-0.3, 0.25, v)),
    wet: corner(dWet, (v) => smoothstep(-0.7, -0.05, v)),
    tier: corner(dTier[0]!, () => 0).map((_, k) => {
      const a = k % nx, b = (k / nx) | 0;
      return smoothstep(-0.2, 0.2, sampleSigned(dTier[1]!, px, pz, a, b)) + smoothstep(-0.2, 0.2, sampleSigned(dTier[2]!, px, pz, a, b));
    }),
  };
}

/** A signed field at a corner: the mean of its four pixels. */
function sampleSigned(src: Float32Array, px: number, pz: number, a: number, b: number): number {
  let sum = 0;
  for (const [da, db] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
    const ia = Math.min(px - 1, Math.max(0, a + da)), ib = Math.min(pz - 1, Math.max(0, b + db));
    sum += src[ib * px + ia]!;
  }
  return sum / 4;
}

/** The ground's height anywhere, from the field (between corners, bilinear). */
export function fieldHeight(f: Field, x: number, z: number): number {
  const fx = Math.min(f.nx - 1.001, Math.max(0, x * SAMPLES)), fz = Math.min(f.nz - 1.001, Math.max(0, z * SAMPLES));
  const a = Math.floor(fx), b = Math.floor(fz), u = fx - a, v = fz - b;
  const h = (i: number, j: number) => f.height[j * f.nx + i]!;
  return (h(a, b) * (1 - u) + h(a + 1, b) * u) * (1 - v) + (h(a, b + 1) * (1 - u) + h(a + 1, b + 1) * u) * v;
}

// ---------------------------------------------------------------- colour

const C = (hex: string) => new THREE.Color(hex);
const PALETTE = {
  grass: [C("#8cc468"), C("#80b95f"), C("#75ae56")],
  grassLight: C("#a0cf76"),
  grassDark: C("#69a24d"),
  rock: [C("#9b8165"), C("#87705a"), C("#a98f72")],
  rockDark: C("#6a5644"),
  sand: C("#f3e0b1"),
  sandWet: C("#d8c08f"),
  path: C("#dcc18b"),
  pathDark: C("#ccae78"),
  bed: C("#b8b48c"),
  seaBed: C("#e3cf9c"),
};

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A smooth value noise, for patches of lighter and darker grass. */
function patches(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function groundColor(f: Field, k: number, x: number, z: number, y: number, ny: number, out: THREE.Color): THREE.Color {
  const tier = f.tier[k]!;
  const grass = PALETTE.grass[Math.min(2, Math.round(tier))]!.clone();
  const n = patches(x * 0.45, z * 0.45) * 0.6 + patches(x * 1.7, z * 1.7) * 0.4;
  grass.lerp(n > 0.5 ? PALETTE.grassLight : PALETTE.grassDark, Math.abs(n - 0.5) * 0.7);
  out.copy(grass);
  // Worn paths.
  const path = f.path[k]!;
  if (path > 0) out.lerp(hash(x * 3, z * 3) > 0.5 ? PALETTE.path : PALETTE.pathDark, path * 0.95);
  // The beach, and wet sand at the water's edge.
  const sand = f.sand[k]!;
  if (sand > 0) {
    const s = PALETTE.sand.clone().lerp(PALETTE.sandWet, smoothstep(0.15, -0.35, y));
    if (y < SEA_LEVEL - 0.05) s.lerp(PALETTE.seaBed, 0.5);
    out.lerp(s, sand);
  }
  // A river's bed and its banks.
  const wet = f.wet[k]!;
  if (wet > 0) out.lerp(PALETTE.bed, wet * 0.8);
  // Cliff faces: rock in layers, wherever the ground stands steep.
  const steep = smoothstep(0.82, 0.5, ny);
  if (steep > 0) {
    const band = Math.floor(y * 5 + 0.15 * Math.sin(x * 1.7 + z * 1.3));
    const rock = PALETTE.rock[((band % 3) + 3) % 3]!.clone().lerp(PALETTE.rockDark, smoothstep(0.35, 0.0, (y % 1 + 1) % 1) * 0.35);
    out.lerp(rock, steep);
  }
  return out;
}

// ---------------------------------------------------------------- the ground's meshes

let grassMap: THREE.Texture | null = null;
/** A faint texture of blades and specks, nearly white, multiplied over the ground's colours. */
export function grassTexture(): THREE.Texture {
  if (grassMap) return grassMap;
  const size = 256;
  const [c, g] = canvas(size, size);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 900; i++) {
    const x = r() * size, y = r() * size, l = 3 + r() * 5;
    g.strokeStyle = r() > 0.5 ? "rgba(70,110,40,0.16)" : "rgba(255,255,230,0.25)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 2, y - l);
    g.stroke();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r() > 0.5 ? "rgba(80,70,40,0.08)" : "rgba(255,255,255,0.18)";
    g.fillRect(r() * size, r() * size, 2, 2);
  }
  grassMap = toTexture(c);
  grassMap.name = "drawn:grass";
  return grassMap;
}

export const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
groundMaterial.name = "ground";
// The grass's blades only on ground that lies flat: on a cliff's face they would streak.
groundMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying float vGroundUp;")
    .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvGroundUp = objectNormal.y;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vGroundUp;")
    .replace("#include <map_fragment>", `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, smoothstep( 0.6, 0.9, vGroundUp ) );
#endif`);
};

/** One chunk's mesh: its corners from the field, positioned at the chunk's corner. */
export function chunkMesh(f: Field, ci: number, cj: number): THREE.Mesh {
  const a0 = ci * CHUNK * SAMPLES, b0 = cj * CHUNK * SAMPLES;
  const a1 = Math.min(f.nx - 1, a0 + CHUNK * SAMPLES), b1 = Math.min(f.nz - 1, b0 + CHUNK * SAMPLES);
  const cols = a1 - a0 + 1, rows = b1 - b0 + 1;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const ox = a0 / SAMPLES, oz = b0 / SAMPLES;
  const h = (a: number, b: number) => f.height[Math.min(f.nz - 1, Math.max(0, b)) * f.nx + Math.min(f.nx - 1, Math.max(0, a))]!;
  const color = new THREE.Color();
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
    const v = (b - b0) * cols + (a - a0);
    const x = a / SAMPLES, z = b / SAMPLES, y = h(a, b);
    positions.set([x - ox, y, z - oz], v * 3);
    // The normal from the field's slope, the same on both sides of a chunk's edge.
    const nxv = (h(a - 1, b) - h(a + 1, b)) * SAMPLES / 2, nzv = (h(a, b - 1) - h(a, b + 1)) * SAMPLES / 2;
    const l = Math.hypot(nxv, 1, nzv);
    normals.set([nxv / l, 1 / l, nzv / l], v * 3);
    groundColor(f, b * f.nx + a, x, z, y, 1 / l, color);
    colors.set([color.r, color.g, color.b], v * 3);
    uvs.set([x * 0.5, z * 0.5], v * 2);
  }
  const index: number[] = [];
  for (let b = 0; b < rows - 1; b++) for (let a = 0; a < cols - 1; a++) {
    const p = b * cols + a, q = p + 1, r = p + cols, s = r + 1;
    // Split each square along the diagonal that bends less.
    const ha = positions[p * 3 + 1]!, hb = positions[q * 3 + 1]!, hc = positions[r * 3 + 1]!, hd = positions[s * 3 + 1]!;
    if (Math.abs(ha - hd) < Math.abs(hb - hc)) index.push(p, r, s, p, s, q);
    else index.push(p, r, q, q, r, s);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, groundMaterial);
  mesh.position.set(ox, 0, oz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `ground:${ci},${cj}`;
  return mesh;
}

export function buildGround(m: IslandMap, f: Field): THREE.Group {
  if (!groundMaterial.map) {
    groundMaterial.map = grassTexture();
    groundMaterial.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.name = "ground";
  for (let cj = 0; cj * CHUNK < m.d; cj++) for (let ci = 0; ci * CHUNK < m.w; ci++) group.add(chunkMesh(f, ci, cj));
  return group;
}

// ---------------------------------------------------------------- water

/** Distance to dry land, four samples a tile: 0 at the shore, 1 six tiles out or more. */
export interface Shore {
  px: number;
  pz: number;
  d: Float32Array;
}

export function shoreField(m: IslandMap): Shore {
  const S = 4, px = m.w * S, pz = m.d * S;
  const dry = (a: number, b: number) => !isWet(groundAt(m, Math.floor(a / S), Math.floor(b / S)));
  const dist = distanceField(px, pz, dry);
  return { px, pz, d: dist.map((v) => Math.min(1, v / S / 6)) };
}

/** The shore's distance at a point, between samples. */
function shoreAt(s: Shore, x: number, z: number): number {
  const fx = Math.min(s.px - 1.001, Math.max(0, x * 4 - 0.5)), fz = Math.min(s.pz - 1.001, Math.max(0, z * 4 - 0.5));
  const a = Math.floor(fx), b = Math.floor(fz), u = fx - a, v = fz - b;
  const d = (i: number, j: number) => s.d[j * s.px + i]!;
  return (d(a, b) * (1 - u) + d(a + 1, b) * u) * (1 - v) + (d(a, b + 1) * (1 - u) + d(a + 1, b + 1) * u) * v;
}

/** The sea's colours: shallow over the sand, deeper out, and the foam's. */
export const SEA = { shallow: [0.30, 0.80, 0.82], mid: [0.13, 0.58, 0.76], deep: [0.08, 0.40, 0.66], foam: [0.93, 0.99, 1.0] } as const;
const glsl = (c: readonly number[]) => `vec3(${c.map((v) => v.toFixed(3)).join(", ")})`;

/** The sea's colour and opacity at shore distance `d`, as its shader paints it between waves; `foam` widens the line at the shore. */
function seaColor(d: number, foam = 0.035): [number, number, number, number] {
  const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, k) => v + (b[k]! - v) * t);
  let c = mix(SEA.shallow, SEA.mid, smoothstep(0, 0.25, d));
  c = mix(c, SEA.deep, smoothstep(0.25, 0.8, d));
  const f = 1 - smoothstep(0, foam, d);
  c = mix(c, SEA.foam, f * 0.85);
  return [c[0]!, c[1]!, c[2]!, Math.min(1, 0.5 + 0.44 * smoothstep(0, 0.35, d) + f * 0.4)];
}

function shoreTexture(m: IslandMap): THREE.DataTexture {
  const shore = shoreField(m);
  const px = shore.px, pz = shore.pz;
  const data = new Uint8Array(px * pz * 4);
  for (let k = 0; k < px * pz; k++) {
    data[k * 4] = Math.round(shore.d[k]! * 255);
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, px, pz, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const waterTime = { value: 0 };

/** The sea: one plane far past the island, coloured by the distance to land, with foam at the shore. */
export function buildSea(m: IslandMap): THREE.Mesh {
  const shore = shoreTexture(m);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, transparent: true });
  material.name = "sea";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.shoreMap = { value: shore };
    shader.uniforms.mapSize = { value: new THREE.Vector2(m.w, m.d) };
    shader.uniforms.time = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSeaWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vSeaWorld;
uniform sampler2D shoreMap;
uniform vec2 mapSize;
uniform float time;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float d = texture2D(shoreMap, vSeaWorld.xz / mapSize).r;
  vec3 shallow = ${glsl(SEA.shallow)};
  vec3 mid = ${glsl(SEA.mid)};
  vec3 deep = ${glsl(SEA.deep)};
  vec3 c = mix(shallow, mid, smoothstep(0.0, 0.25, d));
  c = mix(c, deep, smoothstep(0.25, 0.8, d));
  // Waves rolling in to the shore, and the foam where they break.
  float wave = sin(d * 70.0 - time * 1.6 + sin(vSeaWorld.x * 0.35) * 1.5);
  float foam = smoothstep(0.86, 1.0, wave) * (1.0 - smoothstep(0.02, 0.16, d));
  foam = max(foam, 1.0 - smoothstep(0.0, 0.035, d));
  c = mix(c, ${glsl(SEA.foam)}, clamp(foam * 0.85, 0.0, 1.0));
  diffuseColor.rgb = c;
  diffuseColor.a = mix(0.5, 0.94, smoothstep(0.0, 0.35, d)) + foam * 0.4;
}`);
  };
  const geo = new THREE.PlaneGeometry(m.w + 240, m.d + 240, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(m.w / 2, SEA_LEVEL, m.d / 2);
  mesh.receiveShadow = true;
  mesh.name = "sea";
  return mesh;
}

/**
 * One chunk of the sea as a mesh, for the console: a grid every half tile at the sea's level, its
 * colours and opacity in its vertices. Positioned at the chunk's corner; null where the chunk has
 * no sea.
 */
export function seaChunk(m: IslandMap, shore: Shore, ci: number, cj: number): THREE.Mesh | null {
  const x0 = ci * CHUNK, z0 = cj * CHUNK, x1 = Math.min(m.w, x0 + CHUNK), z1 = Math.min(m.d, z0 + CHUNK);
  let any = false;
  for (let j = z0; j < z1 && !any; j++) for (let i = x0; i < x1 && !any; i++) if (groundAt(m, i, j) === GROUND.sea) any = true;
  if (!any) return null;
  const step = 0.5, cols = Math.round((x1 - x0) / step) + 1, rows = Math.round((z1 - z0) / step) + 1;
  const positions: number[] = [], colors: number[] = [], normals: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) {
    const x = x0 + a * step, z = z0 + b * step;
    positions.push(x - x0, SEA_LEVEL, z - z0);
    normals.push(0, 1, 0);
    uvs.push(0, 0);
    // The shader's colours are in linear light, as a vertex colour is.
    const [cr, cg, cb, ca] = seaColor(shoreAt(shore, x, z), 0.06);
    colors.push(cr, cg, cb, ca);
  }
  for (let b = 0; b < rows - 1; b++) for (let a = 0; a < cols - 1; a++) {
    const p = b * cols + a;
    // Only squares over the sea (or touching it), not under the island.
    const cx = x0 + (a + 0.5) * step, cz = z0 + (b + 0.5) * step;
    if (!isWet(groundAt(m, Math.floor(cx), Math.floor(cz))) && fieldless(m, cx, cz)) continue;
    index.push(p, p + cols, p + cols + 1, p, p + cols + 1, p + 1);
  }
  if (!index.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geo.setIndex(index);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.98, roughness: 0.2 });
  mat.name = "sea:console";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x0, 0, z0);
  return mesh;
}

/** Dry land more than a tile from any sea: no sea surface is wanted over it. */
function fieldless(m: IslandMap, x: number, z: number): boolean {
  const i = Math.floor(x), j = Math.floor(z);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (groundAt(m, i + di, j + dj) === GROUND.sea) return false;
  return true;
}

let rippleMap: THREE.Texture | null = null;
function rippleTexture(): THREE.Texture {
  if (rippleMap) return rippleMap;
  const size = 128;
  const [c, g] = canvas(size, size);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  let s = 3;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const x = r() * size, y = r() * size, l = 10 + r() * 22;
    g.strokeStyle = `rgba(190,240,255,${0.5 + r() * 0.4})`;
    g.lineWidth = 2;
    for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + l / 2, y + dy - 3, x + dx + l, y + dy);
      g.stroke();
    }
  }
  rippleMap = toTexture(c);
  rippleMap.name = "drawn:ripple";
  return rippleMap;
}

export const riverMaterial = new THREE.MeshStandardMaterial({ color: "#56b9da", roughness: 0.14, metalness: 0, transparent: true, opacity: 0.8 });
riverMaterial.name = "river";
export const fallMaterial = new THREE.MeshStandardMaterial({ color: "#cdf2ff", roughness: 0.3, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
fallMaterial.name = "waterfall";

/**
 * The river and the pond: a sheet on each wet tile at its level, falls where it drops a tier. With
 * `chunk`, only that chunk's tiles, relative to its corner (for the console).
 */
export function buildRiver(m: IslandMap, chunk?: [number, number]): THREE.Group {
  riverMaterial.map = rippleTexture();
  const ox = chunk ? chunk[0] * CHUNK : 0, oz = chunk ? chunk[1] * CHUNK : 0;
  const sheet: number[] = [], sheetUv: number[] = [];
  const fall: number[] = [], fallUv: number[] = [];
  const quad = (out: number[], uv: number[], p: number[][], t: number[][]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      out.push(...p[k]!);
      uv.push(...t[k]!);
    }
  };
  for (let j = 0; j < m.d; j++) for (let i = 0; i < m.w; i++) {
    if (groundAt(m, i, j) !== GROUND.water || tierAt(m, i, j) === 0) continue;
    if (chunk && (Math.floor(i / CHUNK) !== chunk[0] || Math.floor(j / CHUNK) !== chunk[1])) continue;
    const y = waterLevel(m, i, j);
    // Past each dry edge the sheet runs under the bank a little.
    const reach = (di: number, dj: number) => {
      const g = groundAt(m, i + di, j + dj);
      return isWet(g) ? 0 : 0.18;
    };
    const x0 = i - reach(-1, 0), x1 = i + 1 + reach(1, 0), z0 = j - reach(0, -1), z1 = j + 1 + reach(0, 1);
    quad(sheet, sheetUv, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [[x0 / 2, z1 / 2], [x1 / 2, z1 / 2], [x1 / 2, z0 / 2], [x0 / 2, z0 / 2]]);
    // A fall at each edge where the next tile's water is lower.
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!isWet(groundAt(m, i + di, j + dj))) continue;
      const low = waterLevel(m, i + di, j + dj);
      if (low > y - 0.05) continue;
      // Just past the edge, on the lower side, from the upper sheet down to the lower one.
      const ex = di === 1 ? i + 1.06 : i - 0.06, ez = dj === 1 ? j + 1.06 : j - 0.06;
      const p = di
        ? [[ex, low, j], [ex, low, j + 1], [ex, y, j + 1], [ex, y, j]]
        : [[i, low, ez], [i + 1, low, ez], [i + 1, y, ez], [i, y, ez]];
      quad(fall, fallUv, p, [[0, 0], [1, 0], [1, (y - low) * 2], [0, (y - low) * 2]]);
    }
  }
  const mk = (pos: number[], uv: number[], mat: THREE.Material, name: string) => {
    const geo = new THREE.BufferGeometry();
    for (let k = 0; k < pos.length; k += 3) {
      pos[k] -= ox;
      pos[k + 2] -= oz;
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  };
  const group = new THREE.Group();
  group.name = "river";
  if (sheet.length) group.add(mk(sheet, sheetUv, riverMaterial, "river:sheet"));
  if (fall.length) group.add(mk(fall, fallUv, fallMaterial, "river:falls"));
  return group;
}

/** Each frame: the water moves. */
export function animateWater(seconds: number): void {
  waterTime.value = seconds;
  if (riverMaterial.map) riverMaterial.map.offset.set(seconds * 0.03, -seconds * 0.11);
}
