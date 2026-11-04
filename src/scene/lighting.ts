// The room's light. One key light from above the front of the room casts
// the only shadows; a sky-and-floor hemisphere and a soft environment fill
// the rest. Lamps that are switched on take a light from a fixed pool, so
// switching a lamp never changes the number of lights (which would make
// every material recompile).
//
// The ceiling light switches between warm, cool and off, as with the Up
// button on the island; the time of day changes what the windows show and
// how much daylight comes in.

import * as THREE from "three";
import { WALL_HEIGHT } from "../core/rules.ts";
import { paintSky } from "./materials.ts";
import { skyPhase, type Period, type SkyPhase } from "../core/clock.ts";

export type CeilingMode = "warm" | "cool" | "off";

export interface LampSource {
  position: THREE.Vector3;
  color: string;
  intensity: number;
  distance: number;
}

const POOL = 10;
const WHITE = new THREE.Color(1, 1, 1);
/**
 * Where the key comes from: high above the front left, as on the island,
 * so each piece throws a soft shadow back and to the right where the camera
 * can see it. A second, shadowless light from the camera's side lights the
 * fronts.
 */
const KEY_DIRECTION = new THREE.Vector3(-0.5, 1, 0.38).normalize();
const FRONT_DIRECTION = new THREE.Vector3(-0.25, 0.6, 1).normalize();
/** Tangent of the key's apparent half size: how fast its shadows soften with distance. */
const KEY_SOFTNESS = 0.13;

/** A lamp's apparent radius, in tiles: how close a wall can come before its light stops climbing. */
const LAMP_RADIUS = 0.45;
/** About the most light one lamp puts on a surface, however strong it is or however near. */
const LAMP_CEILING = 2.8;

let falloffInstalled = false;

/**
 * Lamps as small soft sources rather than points. A point light's inverse
 * square climbs without limit toward the bulb, so a lamp stood against a
 * wall paints a spot on it many times brighter than white, which bloom then
 * spreads into a blown-out disc. Two changes to three.js's point light keep
 * any lamp, however it is authored or placed, in range:
 *
 * - the falloff is 1 / (d² + r²), the light of a ball of radius r: the same
 *   as before across the room, flat near the lamp instead of a spike;
 * - the light one lamp puts on a surface rolls off softly toward a ceiling.
 */
export function installLampFalloff(): void {
  if (falloffInstalled) return;
  const chunk = THREE.ShaderChunk.lights_pars_begin;
  const falloff = "float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );";
  const apply = "light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );";
  const point = chunk.indexOf("getPointLightInfo");
  const at = point < 0 ? -1 : chunk.indexOf(apply, point);
  if (!chunk.includes(falloff) || at < 0) {
    console.warn("lamp falloff: three.js light chunk has changed; keeping point-light falloff");
    return;
  }
  const r2 = (LAMP_RADIUS * LAMP_RADIUS).toFixed(4);
  const ceiling = LAMP_CEILING.toFixed(4);
  const rolled = `${apply}
		float lampPeak = max( light.color.r, max( light.color.g, light.color.b ) ) / ${ceiling};
		light.color /= sqrt( 1.0 + lampPeak * lampPeak );`;
  (THREE.ShaderChunk as Record<string, string>).lights_pars_begin = (chunk.slice(0, at) + rolled + chunk.slice(at + apply.length))
    .replace(falloff, `float distanceFalloff = 1.0 / ( pow( lightDistance, decayExponent ) + ${r2} );`);
  falloffInstalled = true;
}

/** Everything the light is at one of the day's looks; between two looks it is a mix (`mix`). */
export interface Look {
  key: string;
  keyPower: number;
  /** The front light, as a share of the key's power. */
  front: number;
  sky: string;
  ground: string;
  fill: number;
  env: number;
  background: string;
  window: [string, string, boolean, number];
  lamp: number;
  halo: number;
  bloom: number;
  beamColor: string;
  beam: number;
  /** In the dark a lamp lights a pool around itself rather than the room: its reach is shortened. */
  lampReach: number;
  /** Outdoors: the haze's colour (none indoors). */
  fog: string | null;
}

const WINDOWS: Record<Period, Look["window"]> = {
  day: ["#7ccaf6", "#e9f8ff", false, 1.35],
  dusk: ["#8d76c9", "#ffb06e", false, 1.25],
  night: ["#0f1a44", "#2c3c78", true, 0.9],
};

/** The ceiling's modes and the day's looks in the order the console numbers them (src/export/export.ts light.json). */
export const CEILING_MODES: readonly CeilingMode[] = ["warm", "cool", "off"];
export const PERIODS: readonly Period[] = ["day", "dusk", "night"];

/** The room's light for a ceiling mode at one of the day's looks. */
export function look(mode: CeilingMode, time: Period): Look {
  const base: Look = {
    key: "#fff5ea", keyPower: 2.4, front: 0.36 / 0.92, sky: "#fff6ec", ground: "#a88a72", fill: 0.5, env: 0.34,
    background: "#211812", window: WINDOWS[time], lamp: 1, halo: 0, bloom: 0, beamColor: "#fff3d6", beam: 0, lampReach: 1, fog: null,
  };
  if (mode === "cool") {
    base.key = "#eef4ff";
    base.sky = "#eef3ff";
    base.ground = "#a49a92";
    base.background = "#171a21";
  }
  if (mode === "off") {
    // Only the window's light, and the lamps.
    if (time === "night") {
      base.key = "#7f8fe0";
      base.keyPower = 0.32;
      base.sky = "#3d4c94";
      base.ground = "#1c1730";
      base.fill = 0.32;
      base.env = 0.08;
      base.background = "#0a0b16";
      base.lamp = 1.15;
      base.lampReach = 0.8;
    } else {
      const tint = time === "day" ? "#e4efff" : "#ffc9a1";
      base.key = tint;
      base.keyPower = time === "day" ? 1.5 : 0.95;
      base.sky = tint;
      base.ground = "#8d7a6e";
      base.fill = time === "day" ? 0.6 : 0.45;
      base.env = time === "day" ? 0.35 : 0.25;
      base.background = "#1a1612";
      base.lamp = 1.2;
    }
  } else if (time !== "day") {
    base.keyPower *= time === "dusk" ? 0.92 : 0.8;
    base.fill *= time === "dusk" ? 0.92 : 0.75;
    if (time === "dusk") base.key = mode === "warm" ? "#ffe2c0" : "#f4ecff";
    if (time === "night") base.background = "#120f14";
  }
  // Sunlight on the floor under each window: white by day, amber at dusk, gone at night.
  if (time === "night") [base.beamColor, base.beam] = ["#9fb2ff", mode === "off" ? 0.12 : 0];
  else if (time === "dusk") [base.beamColor, base.beam] = ["#ffb36a", 0.62];
  else base.beam = mode === "off" ? 0.85 : 0.7;
  // How strongly lamp halos show: faint by day, full at night or with the lights off.
  base.halo = time === "night" ? 1 : time === "dusk" ? (mode === "off" ? 0.8 : 0.6) : mode === "off" ? 0.4 : 0.18;
  base.bloom = time === "night" ? 1.15 : time === "dusk" ? 0.95 : mode === "off" ? 0.85 : 0.75;
  // By day a lamp is a soft accent; at night or with the lights off it carries the room.
  base.lamp *= time === "night" ? 1 : time === "dusk" ? 0.7 : mode === "off" ? 0.5 : 0.3;
  return base;
}

/** The island's light at one of the day's looks: the sun or the moon, the sky and the grass. */
export function outdoorLook(time: Period): Look {
  const sky = { day: ["#fff4e2", 2.7, "#d6ecff", "#8fbf6a", 0.85, "#9fd6ee"], dusk: ["#ffb877", 1.9, "#c9a8e0", "#7d8f62", 0.62, "#e9a98f"], night: ["#9db2ff", 0.55, "#41548f", "#24304a", 0.42, "#14203f"] }[time] as [string, number, string, string, number, string];
  return {
    key: sky[0], keyPower: sky[1], front: 0.18, sky: sky[2], ground: sky[3], fill: sky[4], env: time === "night" ? 0.12 : 0.3,
    background: sky[5], fog: sky[5], window: WINDOWS[time],
    lamp: time === "night" ? 1.2 : time === "dusk" ? 0.6 : 0, halo: time === "night" ? 1 : time === "dusk" ? 0.5 : 0, bloom: time === "night" ? 1.1 : 0.7,
    beamColor: "#fff3d6", beam: 0, lampReach: 1,
  };
}

const mixColor = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** Two looks mixed: colours and amounts in proportion, the stars once it is more night than not. */
function mix(a: Look, b: Look, t: number): Look {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    key: mixColor(a.key, b.key, t), keyPower: n(a.keyPower, b.keyPower), front: n(a.front, b.front), sky: mixColor(a.sky, b.sky, t),
    ground: mixColor(a.ground, b.ground, t), fill: n(a.fill, b.fill), env: n(a.env, b.env), background: mixColor(a.background, b.background, t),
    window: [mixColor(a.window[0], b.window[0], t), mixColor(a.window[1], b.window[1], t), t < 0.5 ? a.window[2] : b.window[2], n(a.window[3], b.window[3])],
    lamp: n(a.lamp, b.lamp), halo: n(a.halo, b.halo), bloom: n(a.bloom, b.bloom), beamColor: mixColor(a.beamColor, b.beamColor, t),
    beam: n(a.beam, b.beam), lampReach: n(a.lampReach, b.lampReach), fog: a.fog && b.fog ? mixColor(a.fog, b.fog, t) : a.fog ?? b.fog,
  };
}

/**
 * What shiny things reflect: a warm room with a soft ceiling light and a
 * window of sky. Nothing in it is much brighter than white, so a brass rod
 * or a lacquered top shows a gentle highlight instead of a blown-out spot.
 */
export function softRoom(): THREE.Scene {
  const env = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (color: string, k: number, size: [number, number, number], at: [number, number, number]) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.BackSide });
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(...size);
    mesh.position.set(...at);
    env.add(mesh);
  };
  add("#e8d8bd", 0.8, [12, 7, 12], [0, 2.5, 0]);
  const panel = (color: string, k: number, size: [number, number, number], at: [number, number, number]) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(...size);
    mesh.position.set(...at);
    env.add(mesh);
  };
  panel("#8c6a4c", 0.9, [11.8, 0.1, 11.8], [0, -0.95, 0]);
  panel("#fff4e2", 3.2, [4, 0.1, 4], [0, 5.9, 0]);
  panel("#cfeaff", 2.4, [0.1, 2.5, 3.5], [-5.9, 2.6, -1]);
  panel("#fff1dc", 1.8, [3, 2, 0.1], [1.5, 2.4, 5.9]);
  return env;
}

export class Lighting {
  readonly key = new THREE.DirectionalLight(0xffffff, 2.5);
  readonly fill = new THREE.HemisphereLight(0xffffff, 0x886644, 1);
  readonly front = new THREE.DirectionalLight(0xffffff, 1);
  private pool: THREE.PointLight[] = [];
  private env: THREE.Texture;
  mode: CeilingMode = "warm";
  phase: SkyPhase = skyPhase(12);
  /** A lamp's reach, as a share of its own: shorter in the dark with the light off. */
  lampReach = 1;
  /** Multiplier on lamp light, for the current mode. */
  lampPower = 1;
  haloStrength = 0.35;
  /** How strongly glowing things bloom: gently by day, more once it is dark. */
  bloom = 0.75;
  beam ={ color: "#fff3d6", strength: 0.7 };

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(softRoom(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.env;

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(4096, 4096);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.012;
    this.front.castShadow = false;
    scene.add(this.key, this.key.target, this.fill, this.front, this.front.target);
    for (let i = 0; i < POOL; i++) {
      const p = new THREE.PointLight(0xffd9a0, 0, 3, 2);
      p.castShadow = false;
      this.pool.push(p);
      scene.add(p);
    }
    this.apply(this.mode, this.phase);
  }

  /** Aim the key at a w×d room and fit its shadow camera around it. */
  fit(w: number, d: number): void {
    const centre = new THREE.Vector3(0, WALL_HEIGHT * 0.35, 0);
    const reach = Math.hypot(w, d, WALL_HEIGHT) / 2 + 1;
    this.key.position.copy(centre).addScaledVector(KEY_DIRECTION, reach + 6);
    this.key.target.position.copy(centre);
    this.front.position.copy(centre).addScaledVector(FRONT_DIRECTION, reach + 6);
    this.front.target.position.copy(centre);
    const cam = this.key.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 0.5;
    cam.far = reach * 2 + 7;
    cam.updateProjectionMatrix();
    // Penumbra width in UV per unit of normalised depth.
    this.key.shadow.radius = (KEY_SOFTNESS * (cam.far - cam.near)) / (2 * reach);
    this.key.shadow.needsUpdate = true;
  }

  /** Whether the light is the island's sky rather than the room's. */
  outside = false;
  private shadowReach = 0;

  /**
   * Outdoors: the sun (or the moon) as the key, the sky and the grass as the hemisphere, and the
   * sky's colour behind everything and in the haze, at the clock's phase.
   */
  outdoors(phase: SkyPhase): void {
    this.outside = true;
    this.phase = phase;
    this.show(mix(outdoorLook(phase.a), outdoorLook(phase.b), phase.t));
  }

  private show(l: Look): void {
    this.key.color.set(l.key);
    this.key.intensity = l.keyPower * (this.outside ? 1 : 0.92);
    this.front.color.set(l.key);
    this.front.intensity = l.keyPower * l.front * (this.outside ? 1 : 0.92);
    this.fill.color.set(l.sky);
    this.fill.groundColor.set(l.ground);
    this.fill.intensity = l.fill;
    this.scene.environmentIntensity = l.env;
    this.scene.background = new THREE.Color(l.background);
    this.scene.fog = l.fog ? new THREE.Fog(l.fog, 46, 92) : null;
    paintSky(...l.window);
    this.lampPower = l.lamp;
    this.lampReach = l.lampReach;
    this.beam = { color: l.beamColor, strength: l.beam };
    this.haloStrength = l.halo;
    this.bloom = l.bloom;
  }

  /** Outdoors: keep the sun's shadows on the ground around `centre`, `reach` tiles each way. */
  followShadows(centre: THREE.Vector3, reach = 20): void {
    // Move in whole shadow texels, so standing still or walking the shadows' edges do not crawl.
    const cam = this.key.shadow.camera;
    const texel = (reach * 2) / this.key.shadow.mapSize.x;
    const snapped = new THREE.Vector3(Math.round(centre.x / texel) * texel, 0, Math.round(centre.z / texel) * texel);
    this.key.target.position.copy(snapped);
    this.key.position.copy(snapped).addScaledVector(KEY_DIRECTION, 40);
    this.front.target.position.copy(snapped);
    this.front.position.copy(snapped).addScaledVector(FRONT_DIRECTION, 40);
    if (this.shadowReach !== reach) {
      this.shadowReach = reach;
      cam.left = -reach;
      cam.right = reach;
      cam.top = reach;
      cam.bottom = -reach;
      cam.near = 1;
      cam.far = 90;
      cam.updateProjectionMatrix();
      this.key.shadow.radius = (KEY_SOFTNESS * (cam.far - cam.near)) / (2 * reach);
    }
    this.key.shadow.needsUpdate = true;
  }

  /** The room's light for a ceiling mode at the clock's phase. */
  apply(mode: CeilingMode, phase: SkyPhase): void {
    this.outside = false;
    this.shadowReach = 0;
    this.mode = mode;
    this.phase = phase;
    this.show(mix(look(mode, phase.a), look(mode, phase.b), phase.t));
  }

  /** Light the lamps that are on, brightest first, as far as the pool goes. */
  setLamps(sources: LampSource[]): void {
    const sorted = [...sources].sort((a, b) => b.intensity - a.intensity);
    this.pool.forEach((light, i) => {
      const s = sorted[i];
      if (!s) {
        light.intensity = 0;
        return;
      }
      light.position.copy(s.position);
      // Lamp light leans toward white so a cream wall does not turn pink.
      light.color.set(s.color).lerp(WHITE, 0.35);
      light.intensity = s.intensity * this.lampPower;
      // In the dark a lamp lights a pool around itself rather than the room.
      light.distance = s.distance * this.lampReach;
    });
  }
}
