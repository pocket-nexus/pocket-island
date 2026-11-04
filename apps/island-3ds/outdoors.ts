// The player on the console: walking on the island and in the house, going
// through the door, and the pose the renderer draws them in. The rules are
// the browser's (src/core/island.ts, walk.ts, indoors.ts) and so is the pose
// (src/character/pose.ts); the island's map is the export's
// (generated/island.ts).
//
//   Circle Pad      walk; B held, run
//   A               go in, standing at the door
//   the stylus      on the island's map, walk there (or to the door, on the house)
//
// Outdoors the upper screen follows the player and the touch screen is the
// island's map; in the house the room is as it was, and the player walks
// between its furniture while the stylus decorates.
import { createSignal } from "solid-js";
import { atDoor, heightAt, islandWorld, type IslandMap } from "../../src/core/island.ts";
import { entrance, nearestFree, outOfDoor, roomWorld } from "../../src/core/indoors.ts";
import { findPath, newWalker, stepWalker, type Point, type Walker, type WalkInput, type WalkWorld } from "../../src/core/walk.ts";
import { pose } from "../../src/character/pose.ts";
import { catalog } from "./catalog.ts";
import * as E from "./editor.ts";
import { ISLAND } from "./generated/island.ts";
import { island, PLACE, PLAYER_FIELDS } from "./host.ts";

// ---------------------------------------------------------------- the map

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Base64 to bytes (the console's JavaScript has no atob). */
export function bytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, value = 0, at = 0;
  for (let i = 0; i < clean.length; i++) {
    value = (value << 6) | B64.indexOf(clean[i]!);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 255;
    }
  }
  return out;
}

export const map: IslandMap = {
  w: ISLAND.w, d: ISLAND.d, tier: bytes(ISLAND.tier), ground: bytes(ISLAND.ground), seaDistance: new Float32Array(0),
  ramps: ISLAND.ramps, bridges: ISLAND.bridges, house: ISLAND.house, props: ISLAND.props, spawn: ISLAND.spawn,
};
const outdoors = islandWorld(map);

// ---------------------------------------------------------------- where the player is

export type Place = "island" | "house";
const [place, setPlace] = createSignal<Place>("island");
const [nearDoor, setNearDoor] = createSignal(false);
/** Where the player is on the island's map, for its marker: updated a few times a second. */
const [marker, setMarker] = createSignal<{ x: number; z: number; yaw: number }>({ x: map.spawn.x, z: map.spawn.z, yaw: 0 });
/** 0..1 while going through the door: the screens fade to the paper's colour and back. */
const [fade, setFade] = createSignal(0);
export { fade, marker, nearDoor, place };

let walker: Walker = newWalker(map.spawn.x, map.spawn.z, heightAt(map, map.spawn.x, map.spawn.z), map.spawn.yaw);
/** Where the player stands on the island while they are in the house. */
let outside: Walker = walker;
let goal: { path: Point[]; next: number; stuck: number; enter: boolean } | null = null;
/** Going through the door: frames into the fade, and what happens at its middle. */
let passing: { frame: number; change: () => void } | null = null;
let seconds = 0;
let roomSeen: unknown = null;
let houseWorld: WalkWorld | null = null;
const poseOut = new Float32Array(PLAYER_FIELDS);

const FADE = 14;

function worldHere(): WalkWorld {
  if (place() === "island") return outdoors;
  const state = E.room();
  if (state !== roomSeen || !houseWorld) {
    roomSeen = state;
    houseWorld = roomWorld(state, catalog);
    // Something may now stand where the player does: they step aside.
    const spot = nearestFree(state, catalog, walker.x, walker.z);
    if (spot.x !== walker.x || spot.z !== walker.z) walker = { ...walker, x: spot.x, z: spot.z };
  }
  return houseWorld;
}

/** Through the door: the screens fade, the place changes in the middle, and come back. */
function through(change: () => void, instant = false): void {
  if (passing) return;
  goal = null;
  if (instant) {
    change();
    return;
  }
  passing = { frame: 0, change };
}

export function enter(instant = false, at?: { x: number; z: number; yaw: number }): void {
  through(() => {
    if (place() === "island") outside = walker;
    const s = E.room();
    const spot = at ? nearestFree(s, catalog, at.x, at.z) : entrance(s);
    walker = newWalker(spot.x, spot.z, 0, at?.yaw ?? entrance(s).yaw);
    setPlace("house");
    setNearDoor(false);
    island.place(PLACE.room);
    E.setOutdoors(false);
    E.camera(0, 0, 0, true);
    persist();
  }, instant);
}

export function exit(instant = false): void {
  through(() => {
    if (place() === "house") {
      const door = map.house.door;
      outside = newWalker(door.x, door.z + 0.75, heightAt(map, door.x, door.z + 0.75), 0);
    }
    walker = outside;
    setPlace("island");
    E.clearSelection();
    island.place(PLACE.island);
    island.follow(walker.x, walker.y, walker.z, 1);
    E.setOutdoors(true);
    E.camera(0, 0, 0, true);
    persist();
  }, instant);
}

/** Walk to a point in the place's tiles, round what is in the way; `enter` goes in at the door at the end. */
export function walkTo(x: number, z: number, go = false): void {
  const bounds: [number, number, number, number] = place() === "island" ? [0, 0, map.w, map.d] : [0, 0, E.room().w, E.room().d];
  const path = findPath(worldHere(), walker, { x, z }, bounds);
  goal = path && path.length ? { path, next: 0, stuck: 0, enter: go } : null;
}

/** Walk to the door and go in. */
export function goHome(): void {
  if (place() !== "island") return;
  walkTo(map.house.door.x, map.house.door.z + 0.5, true);
}

function stickInput(lx: number, ly: number, run: boolean): WalkInput {
  if (Math.hypot(lx, ly) > 0.15) {
    goal = null;
    return { x: lx, z: ly, run };
  }
  if (!goal) return { x: 0, z: 0, run: false };
  let p = goal.path[goal.next]!;
  const last = goal.next === goal.path.length - 1;
  let l = Math.hypot(p.x - walker.x, p.z - walker.z);
  if (l < 0.3 && !last) {
    goal.next++;
    p = goal.path[goal.next]!;
    l = Math.hypot(p.x - walker.x, p.z - walker.z);
  }
  if ((last && l < 0.12) || goal.stuck > 0.6) {
    const done = goal;
    goal = null;
    if (done.enter && place() === "island" && Math.hypot(walker.x - map.house.door.x, walker.z - map.house.door.z) < 1.2) enter();
    return { x: 0, z: 0, run: false };
  }
  let rest = l;
  for (let k = goal.next; k + 1 < goal.path.length; k++) rest += Math.hypot(goal.path[k + 1]!.x - goal.path[k]!.x, goal.path[k + 1]!.z - goal.path[k]!.z);
  const ease = last ? Math.min(1, l * 2.5 + 0.25) : 1;
  return { x: ((p.x - walker.x) / l) * ease, z: ((p.z - walker.z) / l) * ease, run: run || rest > 5 };
}

/** Each frame: the stick walks the player (`run` while B is held), the door is watched, and the renderer gets the pose. */
export function frame(run: boolean, lx: number, ly: number, dt = 1 / 60): void {
  seconds += dt;
  if (passing) {
    passing.frame++;
    if (passing.frame === FADE) passing.change();
    setFade(passing.frame <= FADE ? passing.frame / FADE : Math.max(0, 2 - passing.frame / FADE));
    if (passing.frame >= FADE * 2) {
      passing = null;
      setFade(0);
    }
  }
  const busy = !!(E.sheet() || E.confirmation() || passing);
  const input = busy ? { x: 0, z: 0, run: false } : stickInput(lx, ly, run);
  const before = walker;
  walker = stepWalker(before, input, dt, worldHere());
  if (goal && Math.hypot(walker.x - before.x, walker.z - before.z) < 0.002 && Math.hypot(input.x, input.z) > 0.1) goal.stuck += dt;
  if (place() === "island") {
    outside = walker;
    const at = atDoor(map, walker.x, walker.z, walker.yaw);
    if (at !== nearDoor()) setNearDoor(at);
    if (at && input.z < -0.5 && !goal && !busy) enter();
    if (Math.floor(seconds * 8) !== Math.floor((seconds - dt) * 8)) setMarker({ x: walker.x, z: walker.z, yaw: walker.yaw });
  } else if (!passing && outOfDoor(E.room(), walker.x, walker.z)) {
    exit();
  }
  send();
}

/** A press of A: in at the door, when the player stands there. */
export function pressA(): boolean {
  if (place() !== "island" || !nearDoor()) return false;
  enter();
  return true;
}

function send(): void {
  const p = pose(walker.phase, walker.speed, seconds);
  const s = E.room();
  const out = place() === "island";
  const x = out ? walker.x : walker.x - s.w / 2, z = out ? walker.z : walker.z - s.d / 2;
  poseOut.set([x, out ? walker.y : 0, z, walker.yaw, p.bob, p.lean, p.head, p.armL, p.armR, p.armOut, p.legL, p.legR, p.breath, 1]);
  island.player(poseOut);
  if (out) island.follow(walker.x, walker.y, walker.z, 0);
}

// ---------------------------------------------------------------- what is kept

interface KeptWorld {
  version: 1;
  place: Place;
  island: { x: number; z: number; yaw: number };
  house: { x: number; z: number; yaw: number };
}

function persist(): void {
  const o = outside, h = place() === "house" ? walker : null;
  const kept: KeptWorld = { version: 1, place: place(), island: { x: o.x, z: o.z, yaw: o.yaw }, house: h ? { x: h.x, z: h.z, yaw: h.yaw } : entrance(E.room()) };
  island.save("world", JSON.stringify(kept));
}

let lastKept = 0;
/** Now and then while walking, where the player is is kept. */
export function keepNow(): void {
  if (seconds - lastKept < 5) return;
  lastKept = seconds;
  persist();
}

/** At start: where the player was. A first run starts on the island, at the door. */
export function restoreWorld(): void {
  let kept: Partial<KeptWorld> | null = null;
  try {
    const text = island.load("world");
    kept = text ? (JSON.parse(text) as Partial<KeptWorld>) : null;
  } catch {
    kept = null;
  }
  const o = kept?.island;
  if (o && outdoors.fits(o.x, o.z, 0.28, heightAt(map, o.x, o.z))) outside = newWalker(o.x, o.z, heightAt(map, o.x, o.z), o.yaw);
  walker = outside;
  if (kept?.place === "house") enter(true, kept.house);
  else exit(true);
}
