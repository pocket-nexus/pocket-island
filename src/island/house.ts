// The player's house from outside: a cream cottage on a stone footing
// under a coral roof, a wooden door in the middle of its front with a little
// awning and a step, a shuttered window either side and a chimney. It
// covers the map's house rectangle (4 × 3 tiles), its front toward +z; the
// windows light up after dark.

import * as THREE from "three";
import * as K from "../scene/kit.ts";
import * as M from "../scene/materials.ts";
import type { V3 } from "../scene/kit.ts";
import { HOUSE_WINDOW } from "./windows.ts";

const W = 4, D = 3;
const FOOT = 0.24;
const WALL_H = 1.95;

const pane = new THREE.MeshStandardMaterial({ color: "#bfe3f2", emissive: HOUSE_WINDOW.warm, emissiveIntensity: 0, roughness: 0.18 });
pane.name = "house:pane";
// How brightly the panes glow once lit (the console reads it; the browser sets the glow itself), and
// that they are lit by the rooms inside: the console lights them as the room is lit, apart from the lamps.
pane.userData.glow = HOUSE_WINDOW.glow;
pane.userData.house = true;

/** The windows after dark (`night`, 0 by day to 1), lit as the rooms inside are. */
export function setHouseGlow(night: number, inside: { glow: number; cool: boolean } = { glow: 1, cool: false }): void {
  const glow = night * inside.glow;
  pane.emissiveIntensity = glow * HOUSE_WINDOW.glow;
  pane.emissive.set(inside.cool ? HOUSE_WINDOW.cool : HOUSE_WINDOW.warm);
  pane.color.set(night > 0.5 ? "#6d6a5a" : "#bfe3f2");
}

function windowAt(x: number, y: number, z: number, shutter: THREE.Material): THREE.Object3D[] {
  const frame = M.paint("#fffaf0", 0.5);
  const w = 0.72, h = 0.68;
  return [
    K.part(K.rbox(w + 0.1, h + 0.1, 0.07, 0.025, 2), frame, { p: [x, y, z + 0.02] }),
    K.part(K.rbox(w - 0.06, h - 0.06, 0.03, 0.01, 1), pane, { p: [x, y, z + 0.05] }),
    K.part(K.rbox(0.04, h - 0.06, 0.04, 0.01, 1), frame, { p: [x, y, z + 0.07] }),
    K.part(K.rbox(w - 0.06, 0.04, 0.04, 0.01, 1), frame, { p: [x, y, z + 0.07] }),
    K.part(K.rbox(0.24, h + 0.06, 0.05, 0.02, 2), shutter, { p: [x - w / 2 - 0.17, y, z + 0.03] }),
    K.part(K.rbox(0.24, h + 0.06, 0.05, 0.02, 2), shutter, { p: [x + w / 2 + 0.17, y, z + 0.03] }),
    K.part(K.rbox(w + 0.3, 0.16, 0.24, 0.04, 2), M.wood("#a8703f", "fine"), { p: [x, y - h / 2 - 0.12, z + 0.12] }),
  ];
}

export function buildHouse(): THREE.Group {
  const plaster = M.paint("#fbf0d9", 0.8);
  const timber = M.wood("#8f5f3a", "fine", 0.6);
  const stone = M.paint("#cdbfa6", 0.85);
  const roof = M.paint("#e2715a", 0.62);
  const trim = M.paint("#c25a46", 0.62);
  const shutter = M.paint("#79b98e", 0.6);
  const parts: THREE.Object3D[] = [];
  parts.push(K.part(K.rbox(W + 0.12, FOOT, D + 0.12, 0.06, 2), stone, { p: [0, FOOT / 2, 0] }));
  parts.push(K.part(K.rbox(W - 0.1, WALL_H, D - 0.1, 0.05, 2), plaster, { p: [0, FOOT + WALL_H / 2, 0] }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(K.part(K.rbox(0.17, WALL_H, 0.17, 0.04, 2, "y"), timber, { p: [x * (W / 2 - 0.08), FOOT + WALL_H / 2, z * (D / 2 - 0.08)] }));
  }
  parts.push(K.part(K.rbox(W - 0.1, 0.12, 0.08, 0.03, 2), timber, { p: [0, FOOT + WALL_H - 0.06, D / 2 - 0.03] }));

  // The roof: two slopes meeting in a ridge along x, overhanging all round, with a gable at each end.
  const top = FOOT + WALL_H;
  const rise = 1.2, half = D / 2 + 0.32, slope = Math.hypot(half, rise), tilt = Math.atan2(rise, half);
  for (const side of [-1, 1]) {
    parts.push(K.part(K.rbox(W + 0.55, 0.2, slope + 0.1, 0.09, 3), roof, {
      p: [0, top + rise / 2 + 0.02, side * half / 2], r: [side * tilt, 0, 0],
    }));
    // Rows of tiles down the slope, each a rounded strip standing a little proud of the one above.
    for (let row = 1; row <= 4; row++) {
      const t = row / 5;
      parts.push(K.part(K.rbox(W + 0.5, 0.06, 0.12, 0.03, 2), trim, {
        p: [0, top + rise * (1 - t) + 0.13 * Math.cos(tilt), side * half * t], r: [side * tilt, 0, 0],
      }));
    }
    parts.push(K.part(K.rbox(W + 0.6, 0.12, 0.16, 0.05, 2), trim, {
      p: [0, top - 0.06 + 0.01, side * (half + 0.02)], r: [side * tilt, 0, 0],
    }));
  }
  parts.push(K.part(K.rod([-(W + 0.5) / 2, top + rise + 0.1, 0], [(W + 0.5) / 2, top + rise + 0.1, 0], 0.1, 12), trim));
  const gable = new THREE.Shape();
  gable.moveTo(-(D / 2 - 0.05), 0);
  gable.lineTo(D / 2 - 0.05, 0);
  gable.lineTo(0, rise - 0.05);
  gable.closePath();
  for (const side of [-1, 1]) {
    const g = K.part(K.extrude(gable, 0.08, 0.01, 4), plaster, { p: [side * (W / 2 - 0.09), top, 0], r: [0, Math.PI / 2, 0] });
    parts.push(g);
    parts.push(K.part(new THREE.CircleGeometry(0.17, 20), pane, { p: [side * (W / 2 - 0.04), top + 0.42, 0], r: [0, side * Math.PI / 2, 0] }));
  }
  parts.push(K.part(K.rbox(0.42, 0.85, 0.42, 0.06, 2, "y"), stone, { p: [1.15, top + rise * 0.75, -0.55] }));
  parts.push(K.part(K.rbox(0.5, 0.1, 0.5, 0.04, 2), M.paint("#a99a84"), { p: [1.15, top + rise * 0.75 + 0.45, -0.55] }));

  // The door, its frame, awning and step.
  const front = D / 2 - 0.05;
  const doorWood = M.wood("#a8703f", "bold", 0.6);
  const doorH = 1.32;
  parts.push(K.part(K.rbox(0.96, doorH + 0.12, 0.08, 0.03, 2), timber, { p: [0, FOOT + (doorH + 0.12) / 2, front + 0.02] }));
  parts.push(K.part(K.rbox(0.8, doorH, 0.08, 0.03, 2), doorWood, { p: [0, FOOT + doorH / 2, front + 0.06] }));
  parts.push(K.part(new THREE.CircleGeometry(0.12, 18), pane, { p: [0, FOOT + doorH * 0.72, front + 0.105] }));
  parts.push(K.part(new THREE.SphereGeometry(0.04, 10, 8), M.metal("#d9b24c", 0.35), { p: [0.27, FOOT + doorH * 0.45, front + 0.12] }));
  parts.push(K.part(K.rbox(1.3, 0.09, 0.55, 0.04, 2), roof, { p: [0, FOOT + doorH + 0.32, front + 0.26], r: [0.32, 0, 0] }));
  for (const x of [-0.55, 0.55]) parts.push(K.part(K.rod([x, FOOT + doorH + 0.28, front + 0.06], [x, FOOT + doorH + 0.1, front + 0.48], 0.025, 6), timber));
  parts.push(K.part(K.rbox(1.1, 0.12, 0.5, 0.04, 2), stone, { p: [0, 0.06, D / 2 + 0.25] }));

  for (const x of [-1.25, 1.25]) parts.push(...windowAt(x, FOOT + 1.12, front, shutter));
  // Window boxes' flowers.
  const blooms = [M.paint("#ff9bc0"), M.paint("#fff6e6"), M.paint("#ffd23f")];
  for (const x of [-1.25, 1.25]) {
    for (let k = 0; k < 5; k++) {
      const p: V3 = [x - 0.36 + k * 0.18, FOOT + 1.12 - 0.34 + 0.12, front + 0.13];
      parts.push(K.part(new THREE.SphereGeometry(0.06, 10, 8), blooms[(k + (x > 0 ? 1 : 0)) % 3]!, { p }));
    }
  }
  return K.group(parts);
}
