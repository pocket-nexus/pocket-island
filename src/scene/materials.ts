// Materials shared by every model. Each factory caches by its arguments, so
// a hundred chairs of one colour share one material and one shader.
//
// The look follows the island: matte, softly lit surfaces with a faint
// texture, lacquer with a gentle highlight, cloth with a sheen at its rim.

import * as THREE from "three";
import { grainTexture, mottleTexture, pileBump, rattanTexture, weaveBump } from "./textures.ts";

const cache = new Map<string, THREE.Material>();

function memo<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = key;
    cache.set(key, m);
  }
  return m;
}

const color = (c: string) => new THREE.Color(c);

/** Matte paint with a faint mottle. */
export function paint(c: string, roughness = 0.62): THREE.MeshStandardMaterial {
  return memo(`paint:${c}:${roughness}`, () => new THREE.MeshStandardMaterial({ color: color(c), roughness, map: mottleTexture() }));
}

/** Lacquer: paint under a clear coat. */
export function gloss(c: string, roughness = 0.4): THREE.MeshPhysicalMaterial {
  return memo(`gloss:${c}:${roughness}`, () => new THREE.MeshPhysicalMaterial({
    color: color(c), roughness, clearcoat: 0.55, clearcoatRoughness: 0.28, map: mottleTexture(),
  }));
}

/** Wood with its grain along the texture's U. `bold` for rustic logs and planks. */
export function wood(c: string, kind: "fine" | "bold" = "fine", roughness = 0.58): THREE.MeshPhysicalMaterial {
  return memo(`wood:${c}:${kind}:${roughness}`, () => new THREE.MeshPhysicalMaterial({
    color: color(c), roughness, map: grainTexture(kind), clearcoat: 0.18, clearcoatRoughness: 0.5,
  }));
}

/** Woven cloth: upholstery, bedding, curtains. */
export function fabric(c: string, sheen = 0.6): THREE.MeshPhysicalMaterial {
  return memo(`fabric:${c}:${sheen}`, () => {
    const base = color(c);
    const tex = weaveBump().clone();
    tex.repeat.set(3, 3);
    tex.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({
      color: base, roughness: 0.88, sheen, sheenRoughness: 0.55,
      sheenColor: base.clone().lerp(new THREE.Color(1, 1, 1), 0.55),
      bumpMap: tex, bumpScale: 0.6,
    });
  });
}

/** Deep pile: plush toys, shaggy rugs, bean bags. */
export function plush(c: string): THREE.MeshPhysicalMaterial {
  return memo(`plush:${c}`, () => {
    const base = color(c);
    return new THREE.MeshPhysicalMaterial({
      color: base, roughness: 1, sheen: 1, sheenRoughness: 0.35,
      sheenColor: base.clone().lerp(new THREE.Color(1, 1, 1), 0.6),
      bumpMap: pileBump(), bumpScale: 1.2,
    });
  });
}

/** Cloth printed with a picture: rugs, cushions with a motif, bedding. */
export function printedCloth(key: string, texture: THREE.Texture, pile = true): THREE.MeshPhysicalMaterial {
  return memo(`cloth:${key}`, () => new THREE.MeshPhysicalMaterial({
    map: texture, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.9, 0.9, 0.9),
    bumpMap: pile ? pileBump() : weaveBump(), bumpScale: pile ? 1.4 : 0.6,
  }));
}

/** Glazed ceramic and porcelain. */
export function ceramic(c: string): THREE.MeshPhysicalMaterial {
  return memo(`ceramic:${c}`, () => new THREE.MeshPhysicalMaterial({ color: color(c), roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 }));
}

/** Plastic toys and appliances. */
export function plastic(c: string, roughness = 0.42): THREE.MeshStandardMaterial {
  return memo(`plastic:${c}:${roughness}`, () => new THREE.MeshStandardMaterial({ color: color(c), roughness }));
}

export function metal(c: string, roughness = 0.45): THREE.MeshStandardMaterial {
  return memo(`metal:${c}:${roughness}`, () => new THREE.MeshStandardMaterial({ color: color(c), roughness, metalness: 1, envMapIntensity: 1.3 }));
}

export function glass(c = "#dff4ff", opacity = 0.35): THREE.MeshPhysicalMaterial {
  return memo(`glass:${c}:${opacity}`, () => new THREE.MeshPhysicalMaterial({
    color: color(c), roughness: 0.05, metalness: 0, transparent: true, opacity, clearcoat: 1, depthWrite: false,
  }));
}

export function leaf(c: string): THREE.MeshStandardMaterial {
  return memo(`leaf:${c}`, () => new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.5, side: THREE.DoubleSide, map: mottleTexture() }));
}

export function rattan(c: string): THREE.MeshStandardMaterial {
  return memo(`rattan:${c}`, () => {
    const { map, bump } = rattanTexture();
    const m = map.clone();
    m.repeat.set(4, 4);
    m.needsUpdate = true;
    const b = bump.clone();
    b.repeat.set(4, 4);
    b.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.7, map: m, bumpMap: b, bumpScale: 2 });
  });
}

/** A printed picture or a screen showing `texture`, matte. */
export function printed(key: string, texture: THREE.Texture, roughness = 0.6): THREE.MeshStandardMaterial {
  return memo(`print:${key}`, () => new THREE.MeshStandardMaterial({ map: texture, roughness }));
}

/**
 * The layer of everything that gives off light. Bloom is taken from these
 * surfaces only, so a wall lit brightly by a lamp beside it never blooms.
 */
export const GLOW_LAYER = 11;

/** Whether a material gives off light of its own: an emissive colour or map. */
export function isEmissive(material: THREE.Material | THREE.Material[]): boolean {
  const list = Array.isArray(material) ? material : [material];
  return list.some((m) => {
    const e = (m as THREE.MeshStandardMaterial).emissive as THREE.Color | undefined;
    return !!e && (e.r + e.g + e.b > 0 || !!(m as THREE.MeshStandardMaterial).emissiveMap);
  });
}

/**
 * A surface that gives off light while its lamp is on: a shade, a bulb, a
 * screen. Never cached: each placed lamp switches its own copy. The view
 * finds these by `userData.glow` and sets their emissive intensity.
 */
export function glow(c: string, base = "#fff6e0", strength = 1.6, roughness = 0.5): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: color(base), emissive: color(c), emissiveIntensity: strength, roughness });
  m.userData.glow = strength;
  return m;
}

/**
 * The sky seen through every window. One material, repainted by the
 * lighting when the time of day changes.
 */
let sky: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshStandardMaterial } | null = null;

function skyParts() {
  if (!sky) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.25, roughness: 0.15 });
    material.name = "sky";
    sky = { canvas, texture, material };
  }
  return sky;
}

export function skyPane(): THREE.MeshStandardMaterial {
  return skyParts().material;
}

export function paintSky(top: string, bottom: string, stars: boolean, strength: number): void {
  const { canvas, texture, material } = skyParts();
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (stars) {
    g.fillStyle = "#fff8dc";
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % 64, y = (i * 53) % 90;
      g.fillRect(x, y, 1.5, 1.5);
    }
  }
  texture.needsUpdate = true;
  material.emissiveIntensity = strength;
}

/** A screen image that lights up with the device. */
export function screen(texture: THREE.Texture, strength = 1.1): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: strength, roughness: 0.25 });
  m.userData.glow = strength;
  return m;
}
