// The items' models, built like the island's props from the kit's soft shapes: what lies about to be
// picked up (a branch, wood, weeds, shells, fruit), what is caught or dug (fish, fossils), the tools
// as the player holds them, and the marks of things on the island (a mound where a fossil is
// buried, the rod's float, a tied bundle for anything dropped). The console draws the same models,
// lowered by the export (src/export/export.ts) and tools/cook.ts.
//
// A model lying down stands on y = 0 at its centre. A tool is modelled in its holder's hand: the grip
// at the origin, the tool along -y (as an arm hangs); `HOLD` turns it forward from the arm.

import * as THREE from "three";
import * as K from "../scene/kit.ts";
import * as M from "../scene/materials.ts";
import type { V3 } from "../scene/kit.ts";
import { itemDef, ITEMS, type ItemDef } from "./items.ts";

const BARK = "#8d5f3d";
const STEEL = "#a9b4bf";
const HANDLE = "#c48d58";

/** How each tool sits in the right hand: the hand's place on the arm (src/character/model.ts), the
 * turn forward from the arm about x (negative is forward), and the tool's tip in its own frame (where
 * a line leaves the rod). */
export const HOLD: Record<string, { at: V3; turn: number; tip: V3 }> = {
  shovel: { at: [-0.032, -0.2, 0.012], turn: -0.6, tip: [0, -0.42, 0] },
  axe: { at: [-0.032, -0.2, 0.012], turn: -0.5, tip: [0, -0.34, 0] },
  rod: { at: [-0.032, -0.2, 0.012], turn: -1.5, tip: [0, -0.86, 0] },
};

// ---------------------------------------------------------------- tools, in the hand

function shovel(): THREE.Group {
  const wood = M.wood(HANDLE, "fine", 0.6);
  const steel = M.metal(STEEL, 0.38);
  // A blade: a rounded spade, flat, a little dished.
  const blade = K.soft(0.18, 0.2, 0.045, 0.55, 0, 20);
  return K.group([
    K.part(K.rod([0, 0.1, 0], [0, -0.22, 0], 0.026, 10), wood),
    K.part(K.rbox(0.1, 0.035, 0.045, 0.015, 2), wood, { p: [0, 0.12, 0] }),
    K.part(K.rod([0, -0.2, 0], [0, -0.25, 0], 0.034, 10), steel),
    K.part(blade, steel, { p: [0, -0.34, 0.004] }),
  ]);
}

function axe(): THREE.Group {
  const wood = M.wood(HANDLE, "fine", 0.6);
  const steel = M.metal(STEEL, 0.36);
  return K.group([
    K.part(K.rod([0, 0.09, 0], [0, -0.32, 0], 0.026, 10), wood),
    // The head across the handle's end, its edge forward (+z when the arm hangs and turns forward).
    K.part(K.rbox(0.075, 0.11, 0.18, 0.02, 2), steel, { p: [0, -0.28, 0.05] }),
    K.part(K.rbox(0.02, 0.13, 0.04, 0.008, 1), M.metal("#dfe6ec", 0.3), { p: [0, -0.28, 0.15] }),
  ]);
}

function rod(): THREE.Group {
  const cork = M.paint("#d9b98c", 0.8);
  const cane = M.wood("#c9945a", "fine", 0.45);
  return K.group([
    K.part(K.rod([0, 0.07, 0], [0, -0.12, 0], 0.028, 10), cork),
    K.part(K.rod([0, -0.1, 0], [0, -0.86, 0], 0.014, 8), cane),
    K.part(K.puck(0.045, 0.035, 0.01, 16), M.metal("#7d8895", 0.4), { p: [0.04, -0.03, 0], r: [0, 0, Math.PI / 2] }),
    K.part(K.rod([0, -0.86, 0], [0, -0.88, 0], 0.017, 6), M.paint("#e8473f")),
  ]);
}

// ---------------------------------------------------------------- what lies about

function branch(): THREE.Group {
  const bark = M.wood(BARK, "bold", 0.8);
  return K.group([
    K.part(K.tube([[-0.19, 0.03, 0.02], [-0.05, 0.035, -0.01], [0.08, 0.032, 0.01], [0.2, 0.03, -0.02]], 0.021, 16, 8), bark),
    K.part(K.tube([[0.02, 0.034, 0.0], [0.07, 0.04, 0.08], [0.1, 0.045, 0.13]], 0.011, 8, 6), bark),
    K.part(K.leafGeometry(0.09, 0.05, 0.2, 0.2), M.leaf("#6dc25a"), { p: [0.1, 0.05, 0.14], r: [-1.2, 0.4, 0] }),
  ]);
}

function wood(): THREE.Group {
  const bark = M.wood(BARK, "bold", 0.8);
  const cut = M.wood("#e6c08e", "fine", 0.7);
  const log = K.puck(0.075, 0.24, 0.02, 18);
  log.translate(0, -0.12, 0);
  return K.group([
    K.part(log, bark, { p: [0, 0.075, 0], r: [0, 0, Math.PI / 2] }),
    K.part(new THREE.CircleGeometry(0.062, 18), cut, { p: [0.121, 0.075, 0], r: [0, Math.PI / 2, 0] }),
    K.part(new THREE.CircleGeometry(0.062, 18), cut, { p: [-0.121, 0.075, 0], r: [0, -Math.PI / 2, 0] }),
  ]);
}

function weed(): THREE.Group {
  const green = M.leaf("#7cbf4a");
  const dark = M.leaf("#5ea83a");
  const blades: THREE.Object3D[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const len = 0.13 + (k % 3) * 0.03;
    blades.push(K.part(K.leafGeometry(len, 0.04, 0.3, 0.5, "long"), k % 2 ? green : dark, { p: [Math.sin(a) * 0.02, 0.005, Math.cos(a) * 0.02], r: [-0.5 - (k % 2) * 0.2, a, 0] }));
  }
  return K.group(blades);
}

function scallop(color: string): THREE.Group {
  const shell = M.paint(color, 0.5);
  const fan = new THREE.SphereGeometry(0.1, 18, 8, -Math.PI * 0.45, Math.PI * 0.9, 0, Math.PI / 2);
  fan.scale(1, 0.32, 1);
  const ribs = Array.from({ length: 5 }, (_, k) => {
    const a = -0.9 + k * 0.45;
    return K.part(K.rod([0, 0.006, 0], [Math.sin(a) * 0.09, 0.022, Math.cos(a) * 0.09], 0.006, 5), M.paint(new THREE.Color(color).multiplyScalar(0.9).getStyle(), 0.5));
  });
  return K.group([K.part(fan, shell, { p: [0, 0, -0.04] }), ...ribs.map((r) => K.place(r, { p: [0, 0, -0.04] })), K.part(K.rbox(0.05, 0.02, 0.03, 0.008, 2), shell, { p: [0, 0.008, -0.045] })]);
}

function cowrie(color: string): THREE.Group {
  return K.group([
    K.part(K.soft(0.13, 0.06, 0.085, 0.75, 0, 18), M.gloss(color, 0.25), { p: [0, 0.03, 0] }),
    K.part(K.rbox(0.09, 0.006, 0.01, 0.003, 1), M.paint("#a8785a"), { p: [0, 0.003, 0] }),
    ...[-0.03, 0, 0.03].map((x) => K.part(new THREE.SphereGeometry(0.009, 6, 4), M.paint("#c79a72"), { p: [x, 0.05, 0.015] })),
  ]);
}

function conch(color: string): THREE.Group {
  const geo = K.lathe([[0, 0], [0.04, 0.02], [0.065, 0.06], [0.06, 0.1], [0.035, 0.15], [0.012, 0.19], [0, 0.2]], 18);
  return K.group([
    K.part(geo, M.paint(color, 0.45), { p: [-0.09, 0.055, 0], r: [0, 0, -Math.PI / 2 + 0.15] }),
    K.part(K.soft(0.07, 0.05, 0.06, 0.7, 0, 12), M.paint("#ffb0a0", 0.4), { p: [-0.07, 0.045, 0.02] }),
  ]);
}

function fruit(def: ItemDef): THREE.Group {
  const skin = M.gloss(def.color, 0.42);
  const leaf = M.leaf("#5fb64d");
  const stem = M.paint("#5b3a22");
  const r = 0.1;
  const parts: THREE.Object3D[] = [];
  if (def.key === "apple") parts.push(K.part(K.soft(r * 2.1, r * 1.85, r * 2.1, 0.85, 0.05, 18), skin, { p: [0, r * 0.95, 0] }));
  else if (def.key === "peach") {
    parts.push(K.part(K.soft(r * 2.05, r * 2.05, r * 2.0, 0.9, 0, 18), skin, { p: [0, r, 0] }));
    parts.push(K.part(K.tube([[0, r * 1.95, -r * 0.2], [0, r * 1.5, r * 0.9], [0, r * 0.6, r * 1.02]], 0.006, 8, 5), M.paint("#ef9580", 0.5)));
  } else parts.push(K.part(K.soft(r * 2.05, r * 1.95, r * 2.05, 0.92, 0, 18), skin, { p: [0, r, 0] }));
  parts.push(K.part(K.rod([0, r * 1.9, 0], [0.005, r * 2.25, 0], 0.008, 5), stem));
  parts.push(K.part(K.leafGeometry(0.07, 0.035, 0.2, 0.2), leaf, { p: [0.02, r * 2.15, 0], r: [-0.5, 0.6, -0.4] }));
  return K.group(parts);
}

// ---------------------------------------------------------------- caught and dug

function fish(def: ItemDef): THREE.Group {
  const len = (def.length ?? 0.4) * 0.55;
  const body = M.gloss(def.color, 0.35);
  const fin = M.paint(new THREE.Color(def.color).multiplyScalar(0.82).getStyle(), 0.5);
  const flat = def.key === "flounder";
  const round = def.key === "pufferfish";
  const tail = new THREE.Shape();
  tail.moveTo(0, 0);
  tail.lineTo(-len * 0.32, len * 0.2);
  tail.lineTo(-len * 0.26, 0);
  tail.lineTo(-len * 0.32, -len * 0.2);
  tail.closePath();
  const h = round ? len * 0.8 : flat ? len * 0.15 : len * 0.36;
  const w = round ? len * 0.8 : flat ? len * 0.6 : len * 0.2;
  const parts: THREE.Object3D[] = [
    K.part(K.soft(len, h, w, 0.8, 0, 18), body, { p: [0, h / 2 + 0.01, 0], r: [0, Math.PI / 2, 0] }),
    K.part(K.extrude(tail, 0.01, 0.003), fin, { p: [0, h / 2 + 0.01, -len * 0.42], r: [0, Math.PI / 2, 0] }),
    K.part(new THREE.SphereGeometry(len * 0.045, 8, 6), M.paint("#2b2420"), { p: [w * 0.38, h * 0.62 + 0.01, len * 0.3] }),
    K.part(new THREE.SphereGeometry(len * 0.045, 8, 6), M.paint("#2b2420"), { p: [-w * 0.38, h * 0.62 + 0.01, len * 0.3] }),
  ];
  if (!round) parts.push(K.part(K.soft(len * 0.3, len * 0.12, 0.008, 0.6, 0, 8), fin, { p: [0, h + 0.01, -len * 0.02] }));
  if (def.key === "koi") parts.push(K.part(K.soft(len * 0.35, h * 0.5, w * 1.02, 0.8, 0, 12), M.gloss("#ef5a3a", 0.35), { p: [0, h * 0.62 + 0.01, len * 0.12], r: [0, Math.PI / 2, 0] }));
  return K.group(parts);
}

function fossil(def: ItemDef): THREE.Group {
  const stone = M.paint(def.color, 0.85);
  const dark = M.paint(new THREE.Color(def.color).multiplyScalar(0.72).getStyle(), 0.85);
  switch (def.key) {
    case "ammonite": {
      const coil: V3[] = [];
      for (let k = 0; k <= 30; k++) {
        const a = (k / 30) * Math.PI * 4.2;
        const r = 0.015 + (k / 30) * 0.075;
        coil.push([Math.cos(a) * r, 0.045, Math.sin(a) * r]);
      }
      return K.group([K.part(K.puck(0.1, 0.04, 0.015, 24), stone), K.part(K.tube(coil, 0.009, 60, 6), dark)]);
    }
    case "trilobite":
      return K.group([
        K.part(K.soft(0.16, 0.04, 0.2, 0.7, 0, 16), stone, { p: [0, 0.02, 0] }),
        ...[-0.06, -0.03, 0, 0.03, 0.06].map((z) => K.part(K.rbox(0.13, 0.012, 0.012, 0.005, 1), dark, { p: [0, 0.042, z] })),
        K.part(K.rbox(0.02, 0.02, 0.17, 0.008, 2), dark, { p: [0, 0.045, 0] }),
      ]);
    case "shark-tooth": {
      const s = new THREE.Shape();
      s.moveTo(-0.06, 0);
      s.quadraticCurveTo(-0.02, 0.06, 0, 0.14);
      s.quadraticCurveTo(0.02, 0.06, 0.06, 0);
      s.closePath();
      return K.group([K.part(K.extrude(s, 0.03, 0.008), stone, { p: [0, 0.015, 0.06], r: [-Math.PI / 2, 0, 0] }), K.part(K.rbox(0.13, 0.03, 0.03, 0.01, 2), dark, { p: [0, 0.015, 0.06] })]);
    }
    default:
      return K.group([
        K.part(K.rbox(0.2, 0.035, 0.15, 0.015, 3), stone, { p: [0, 0.018, 0] }),
        K.part(K.leafGeometry(0.15, 0.06, 0.05, 0.1, "long"), dark, { p: [-0.07, 0.037, 0], r: [-Math.PI / 2, 0, -Math.PI / 2 + 0.3] }),
      ]);
  }
}

// ---------------------------------------------------------------- marks on the island

/** Where a fossil is buried: a little mound of loose earth with cracks across it. */
function buried(): THREE.Group {
  const earth = M.paint("#a77b52", 0.95);
  const crack = M.paint("#6a4a2e", 0.95);
  return K.group([
    K.part(K.soft(0.36, 0.07, 0.32, 0.8, 0, 20), earth, { p: [0, 0.012, 0] }),
    K.part(K.rbox(0.2, 0.012, 0.02, 0.006, 1), crack, { p: [0, 0.046, 0], r: [0, 0.5, 0] }),
    K.part(K.rbox(0.14, 0.012, 0.02, 0.006, 1), crack, { p: [0.02, 0.046, 0.01], r: [0, -0.9, 0] }),
    ...[[0.14, 0.12], [-0.15, 0.06], [0.06, -0.15]].map(([x, z]) => K.part(new THREE.SphereGeometry(0.022, 6, 4), earth, { p: [x!, 0.012, z!] })),
  ]);
}

/** The rod's float: red over white. */
function float(): THREE.Group {
  const top = new THREE.SphereGeometry(0.045, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const bottom = new THREE.SphereGeometry(0.045, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  return K.group([
    K.part(top, M.gloss("#e8473f", 0.35), { p: [0, 0.01, 0] }),
    K.part(bottom, M.gloss("#fffbee", 0.35), { p: [0, 0.01, 0] }),
    K.part(K.rod([0, 0.05, 0], [0, 0.08, 0], 0.006, 5), M.paint("#2b2420")),
  ]);
}

/** Anything dropped that has no look of its own lying down: a cloth bundle tied at the top. */
function bundle(): THREE.Group {
  const cloth = M.fabric("#e9d9b6", 0.5);
  const tie = M.paint("#c0704f", 0.6);
  return K.group([
    K.part(K.soft(0.22, 0.16, 0.22, 0.75, 0, 18), cloth, { p: [0, 0.08, 0] }),
    K.part(K.soft(0.08, 0.06, 0.08, 0.7, 0, 10), cloth, { p: [0, 0.18, 0] }),
    K.part(K.puck(0.04, 0.02, 0.006, 12), tie, { p: [0, 0.15, 0] }),
  ]);
}

// ---------------------------------------------------------------- by number

const built = new Map<string, THREE.Group>();
function once(key: string, make: () => THREE.Group): THREE.Group {
  let g = built.get(key);
  if (!g) {
    g = make();
    g.name = key;
    built.set(key, g);
  }
  return g;
}

/** An item's model, lying on the ground (or, for a tool, in the hand). */
export function itemModel(id: number): THREE.Group {
  const def = itemDef(id);
  if (!def) return bundleModel();
  return once(`item:${def.key}`, () => {
    switch (def.kind) {
      case "tool": return def.key === "shovel" ? shovel() : def.key === "axe" ? axe() : rod();
      case "material": return def.key === "branch" ? branch() : def.key === "wood" ? wood() : weed();
      case "shell": return def.key === "scallop" ? scallop(def.color) : def.key === "cowrie" ? cowrie(def.color) : conch(def.color);
      case "fruit": return fruit(def);
      case "fish": return fish(def);
      case "fossil": return fossil(def);
    }
  });
}

export const buriedModel = () => once("mark:buried", buried);
export const floatModel = () => once("mark:float", float);
export const bundleModel = () => once("mark:bundle", bundle);

/** Every item with its model, for the export and the icons. */
export const ITEM_MODELS = ITEMS.map((d) => d.id);
