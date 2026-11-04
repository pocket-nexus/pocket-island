// The player: a small round-headed figure in the island's soft style, about
// a tile tall, its head nearly half of it. It is built from the kit's soft
// shapes as separate parts, each turning about its own joint, so a walk is a
// few rotations a frame (src/character/pose.ts):
//
//   body   at the hips, carries the torso and everything above
//   head   at the neck
//   armL, armR at the shoulders; legL, legR at the hips
//
// It faces +z, like the furniture, and stands on y = 0.

import * as THREE from "three";
import * as K from "../scene/kit.ts";
import * as M from "../scene/materials.ts";

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  shorts: string;
  shoes: string;
  eyes: string;
  cheeks: string;
}

const DEFAULT_LOOK: Look = {
  skin: "#ffdcc0", hair: "#7a4b2e", shirt: "#7cc8ec", shorts: "#fff1d0", shoes: "#ef6f5e", eyes: "#3a2a22", cheeks: "#ffa9a0",
};

export { JOINTS, PART_NAMES, type PartName } from "./joints.ts";
import { JOINTS, type PartName } from "./joints.ts";

export interface Character {
  root: THREE.Group;
  parts: Record<PartName, THREE.Group>;
}

/** Each part's model in its own joint's frame, so the console can draw it the same way. */
export function partModels(look: Look = DEFAULT_LOOK): Record<PartName, THREE.Group> {
  const skin = M.paint(look.skin, 0.7);
  const hair = M.paint(look.hair, 0.62);
  const shirt = M.fabric(look.shirt, 0.4);
  const shorts = M.fabric(look.shorts, 0.4);
  const shoes = M.paint(look.shoes, 0.5);
  const eye = M.gloss(look.eyes, 0.25);
  const white = M.paint("#ffffff", 0.3);
  const cheek = M.paint(look.cheeks, 0.8);
  const R = JOINTS.headRadius, C = JOINTS.headCentre;

  // The body, from the hips: shorts, then the shirt up to the neck.
  const body = K.group([
    K.part(K.soft(0.3, 0.14, 0.24, 0.55, 0.1, 22), shorts, { p: [0, 0.0, 0] }),
    K.part(K.lathe([[0.135, -0.02], [0.15, 0.03], [0.15, 0.12], [0.13, 0.22], [0.09, 0.29], [0, 0.31]], 22), shirt, { p: [0, 0.0, 0] }),
    K.part(K.puck(0.055, 0.06, 0.02, 12), skin, { p: [0, JOINTS.neck - JOINTS.hip - 0.03, 0] }),
  ]);

  // The head, from the neck: a big round face with hair over its crown and back.
  const head = K.group([
    K.part(K.soft(R * 2, R * 1.86, R * 1.86, 0.92, 0, 32), skin, { p: [0, C, 0] }),
    // Hair: a cap over the crown and the back of the head, and a fringe.
    K.part(new THREE.SphereGeometry(R * 1.06, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, { p: [0, C + 0.012, -0.012], r: [-0.28, 0, 0] }),
    K.part(K.soft(R * 1.7, R * 0.5, R * 0.7, 0.7, 0, 20), hair, { p: [0, C + R * 0.58, R * 0.52], r: [0.4, 0, 0] }),
    K.part(K.soft(R * 0.6, R * 0.7, R * 0.5, 0.8, 0, 16), hair, { p: [-R * 0.82, C + R * 0.1, R * 0.1], r: [0, 0, 0.15] }),
    K.part(K.soft(R * 0.6, R * 0.7, R * 0.5, 0.8, 0, 16), hair, { p: [R * 0.82, C + R * 0.1, R * 0.1], r: [0, 0, -0.15] }),
    // Eyes with a glint, cheeks, a small smile.
    K.part(K.soft(0.06, 0.085, 0.04, 0.9, 0, 16), eye, { p: [-0.095, C - 0.01, R * 0.9] }),
    K.part(K.soft(0.06, 0.085, 0.04, 0.9, 0, 16), eye, { p: [0.095, C - 0.01, R * 0.9] }),
    K.part(new THREE.SphereGeometry(0.013, 8, 6), white, { p: [-0.083, C + 0.015, R * 0.93] }),
    K.part(new THREE.SphereGeometry(0.013, 8, 6), white, { p: [0.107, C + 0.015, R * 0.93] }),
    K.part(K.soft(0.07, 0.04, 0.02, 0.9, 0, 12), cheek, { p: [-0.16, C - 0.075, R * 0.8], r: [0, -0.5, 0] }),
    K.part(K.soft(0.07, 0.04, 0.02, 0.9, 0, 12), cheek, { p: [0.16, C - 0.075, R * 0.8], r: [0, 0.5, 0] }),
    K.part(K.tube([[-0.03, C - 0.085, R * 0.9], [0, C - 0.1, R * 0.92], [0.03, C - 0.085, R * 0.9]], 0.008, 10, 6), eye),
    K.part(new THREE.SphereGeometry(0.018, 10, 8), skin, { p: [0, C - 0.045, R * 0.96] }),
  ]);

  // An arm hangs from its shoulder: a sleeve, then the arm and a round hand.
  const arm = (side: number) => K.group([
    K.part(K.soft(0.1, 0.12, 0.1, 0.8, 0, 14), shirt, { p: [side * 0.012, -0.04, 0] }),
    K.part(K.rod([side * 0.015, -0.06, 0], [side * 0.03, -0.17, 0.01], 0.033, 10), skin),
    K.part(new THREE.SphereGeometry(0.045, 12, 10), skin, { p: [side * 0.032, -0.2, 0.012] }),
  ]);

  // A leg from its hip: a short leg and a rounded shoe.
  const leg = () => K.group([
    K.part(K.rod([0, -0.04, 0], [0, -0.22, 0], 0.04, 10), skin),
    K.part(K.soft(0.1, 0.085, 0.15, 0.6, 0.1, 16), shoes, { p: [0, -0.255, 0.02] }),
  ]);

  return { body, head, armL: arm(1), armR: arm(-1), legL: leg(), legR: leg() };
}

/** The player as a hierarchy of joints, built once. */
export function buildCharacter(look: Look = DEFAULT_LOOK): Character {
  const models = partModels(look);
  const joint = (name: PartName, x: number, y: number) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, 0);
    g.add(models[name]);
    return g;
  };
  const body = joint("body", 0, JOINTS.hip);
  const head = joint("head", 0, JOINTS.neck - JOINTS.hip);
  const armL = joint("armL", JOINTS.shoulderX, JOINTS.shoulder - JOINTS.hip);
  const armR = joint("armR", -JOINTS.shoulderX, JOINTS.shoulder - JOINTS.hip);
  const legL = joint("legL", JOINTS.hipX, JOINTS.hip);
  const legR = joint("legR", -JOINTS.hipX, JOINTS.hip);
  body.add(head, armL, armR);
  const root = new THREE.Group();
  root.name = "player";
  root.add(body, legL, legR);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, parts: { body, head, armL, armR, legL, legR } };
}
