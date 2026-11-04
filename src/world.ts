// The player's world: the island outside and the room inside the house,
// one at a time on the stage, and the player walking in whichever it is.
//
// Outdoors the camera follows the player north over the island; walking
// into the door goes inside, where the room is what it always was (the
// editor decorates it) and the player walks between the furniture; walking
// out through the doorway comes back to the island in front of the door.
// The keys walk (WASD or the arrows, Shift to run), a click on the ground
// walks there, and E or Enter goes in at the door.

import * as THREE from "three";
import type { App } from "./app.ts";
import { atDoor, heightAt, islandWorld, makeIsland, type IslandMap } from "./core/island.ts";
import { entrance, nearestFree, outOfDoor, roomWorld } from "./core/indoors.ts";
import { findPath, newWalker, stepWalker, WALKER_RADIUS, type Point, type Walker, type WalkInput, type WalkWorld } from "./core/walk.ts";
import { buildCharacter, type Character } from "./character/model.ts";
import { applyPose, pose } from "./character/pose.ts";
import { catalog } from "./furniture/catalog.ts";
import { IslandView } from "./island/view.ts";
import type { TimeOfDay } from "./scene/lighting.ts";

export type Place = "island" | "house";

export interface WorldEvents {
  /** The player went in or out; the interface changes with it. */
  place(place: Place): void;
  /** Whether the player stands at the door, facing it (the interface offers to go in). */
  door(at: boolean): void;
}

const SAVE_KEY = "pocket-island/world/v1";

interface Saved {
  place: Place;
  island: { x: number; z: number; yaw: number };
  house: { x: number; z: number; yaw: number };
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    return s && (s.place === "island" || s.place === "house") && s.island && s.house ? s : null;
  } catch {
    return null;
  }
}

/** A fade over the stage while the player goes through the door. */
function fader(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fade";
  document.body.appendChild(el);
  return el;
}

export class World {
  readonly map: IslandMap;
  readonly island: IslandView;
  readonly player: Character;
  place: Place = "island";
  walker: Walker;
  private outside: Walker;
  private keys = new Set<string>();
  /** A walk the player was sent on by a click: the corners of its way, and what to do at its end. */
  private goal: { path: Point[]; next: number; stuck: number; enter: boolean } | null = null;
  private atDoorNow = false;
  private moving = false;
  private fade = fader();
  private time: TimeOfDay = "day";
  private ray = new THREE.Raycaster();
  private seconds = 0;
  private houseWorld: WalkWorld | null = null;
  /** Going through the door: nothing else happens until the other side shows. */
  private passing = false;

  constructor(readonly app: App, private events: WorldEvents) {
    this.map = makeIsland();
    this.island = new IslandView(this.map);
    this.player = buildCharacter();
    app.stage.scene.add(this.island.group, this.player.root);
    const spawn = this.map.spawn;
    this.outside = newWalker(spawn.x, spawn.z, heightAt(this.map, spawn.x, spawn.z), spawn.yaw);
    this.walker = this.outside;
    const saved = new URLSearchParams(location.search).has("fresh") ? null : load();
    const params = new URLSearchParams(location.search);
    const start: Place = params.get("place") === "house" ? "house" : params.get("place") === "island" ? "island" : saved?.place ?? "island";
    if (saved) {
      const o = saved.island;
      if (islandWorld(this.map).fits(o.x, o.z, WALKER_RADIUS, heightAt(this.map, o.x, o.z))) this.outside = newWalker(o.x, o.z, heightAt(this.map, o.x, o.z), o.yaw);
    }
    app.model.subscribe(() => { this.houseWorld = null; });
    app.editor.enabled = false;
    if (start === "house") {
      const h = saved?.house;
      this.enter(h ? { x: h.x, z: h.z, yaw: h.yaw } : undefined, true);
    } else this.exit(true);

    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.keys.clear());
    app.stage.canvas.addEventListener("pointerdown", (e) => this.pointer(e));
    app.stage.onFrame((dt) => this.frame(dt / 1000));
    window.addEventListener("beforeunload", () => this.save());
  }

  // ---------------------------------------------------------------- going in and out

  /** Into the house: the room on the stage, the player just inside the door. */
  enter(at?: { x: number; z: number; yaw: number }, instant = false): void {
    this.through(() => {
      this.place = "house";
      this.outside = this.walker === this.outside ? this.walker : this.outside;
      const s = this.app.model.state;
      const spot = at ? nearestFree(s, catalog, at.x, at.z) : entrance(s);
      this.walker = newWalker(spot.x, spot.z, 0, at?.yaw ?? entrance(s).yaw);
      this.island.group.visible = false;
      this.app.setIndoors(true);
      this.events.place("house");
      this.updateDoor(false);
    }, instant);
  }

  /** Out to the island, in front of the door. */
  exit(instant = false): void {
    this.through(() => {
      if (this.place === "house") {
        const door = this.map.house.door;
        this.outside = newWalker(door.x, door.z + 0.75, heightAt(this.map, door.x, door.z + 0.75), 0);
      }
      this.place = "island";
      this.walker = this.outside;
      this.island.group.visible = true;
      this.app.setIndoors(false);
      this.app.stage.rig.setFollow(this.focus(), true);
      this.applyLight();
      this.events.place("island");
    }, instant);
  }

  /** Going through the door: the screen fades, the place changes, the screen comes back. */
  private through(change: () => void, instant: boolean): void {
    if (this.passing) return;
    this.goal = null;
    this.keys.clear();
    if (instant) {
      change();
      this.save();
      return;
    }
    this.passing = true;
    this.fade.classList.add("on");
    setTimeout(() => {
      change();
      this.save();
      this.passing = false;
      setTimeout(() => this.fade.classList.remove("on"), 60);
    }, 280);
  }

  setTime(time: TimeOfDay): void {
    this.time = time;
    if (this.place === "island") this.applyLight();
  }

  private applyLight(): void {
    const l = this.app.stage.lighting;
    l.outdoors(this.time);
    this.island.setNight(this.time === "night" ? 1 : this.time === "dusk" ? 0.55 : 0);
    this.app.stage.setQuality({});
    this.app.stage.refreshAO();
  }

  // ---------------------------------------------------------------- input

  private key(e: KeyboardEvent, down: boolean): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (e.metaKey || e.ctrlKey) return;
    if (!this.walking()) {
      this.keys.clear();
      return;
    }
    const code = e.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(code)) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      if (code.startsWith("Arrow")) e.preventDefault();
      if (down) this.goal = null;
    }
    if (down && (code === "KeyE" || code === "Enter") && this.place === "island" && this.atDoorNow) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.enter();
    }
  }

  /** Whether the player walks now: not while decorating or with a dialog open. */
  walking(): boolean {
    if (this.place === "house" && this.app.editor.mode !== "view") return false;
    return !document.querySelector(".modal-back.open");
  }

  private pointer(e: PointerEvent): void {
    if (this.place !== "island" || e.button !== 0 || !this.walking()) return;
    const r = this.app.stage.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.app.stage.camera);
    const hit = this.ray.intersectObject(this.island.group, true)[0];
    if (!hit) return;
    // A click on the house walks to its door and goes in.
    let house = false;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o.name === "house") house = true;
    if (house) {
      this.walkTo(this.map.house.door.x, this.map.house.door.z + 0.5, true);
      return;
    }
    this.walkTo(hit.point.x, hit.point.z);
  }

  /** Walk to a point in the current place's tiles, round whatever is in the way; `enter` goes in at the end. */
  walkTo(x: number, z: number, enter = false): void {
    const bounds: [number, number, number, number] = this.place === "island" ? [0, 0, this.map.w, this.map.d] : [0, 0, this.app.model.state.w, this.app.model.state.d];
    const path = findPath(this.worldHere(), this.walker, { x, z }, bounds);
    this.goal = path && path.length ? { path, next: 0, stuck: 0, enter } : null;
  }

  private input(): WalkInput {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let z = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    const run = k.has("ShiftLeft") || k.has("ShiftRight");
    if (x || z) {
      // Up on the keys is away from the camera, whichever way it has turned.
      const yaw = this.app.stage.rig.yaw;
      const l = Math.hypot(x, z);
      [x, z] = [(x * Math.cos(yaw) + z * Math.sin(yaw)) / l, (-x * Math.sin(yaw) + z * Math.cos(yaw)) / l];
      return { x, z, run };
    }
    const goal = this.goal;
    if (goal) {
      let p = goal.path[goal.next]!;
      const last = goal.next === goal.path.length - 1;
      let l = Math.hypot(p.x - this.walker.x, p.z - this.walker.z);
      if (l < (last ? 0.12 : 0.3) && !last) {
        goal.next++;
        p = goal.path[goal.next]!;
        l = Math.hypot(p.x - this.walker.x, p.z - this.walker.z);
      }
      if ((last && l < 0.12) || goal.stuck > 0.6) {
        this.goal = null;
        if (goal.enter && this.place === "island" && Math.hypot(this.walker.x - this.map.house.door.x, this.walker.z - this.map.house.door.z) < 1.2) this.enter();
        return { x: 0, z: 0, run: false };
      }
      // A long way is run; the last steps slow down onto the spot.
      let rest = l;
      for (let k = goal.next; k + 1 < goal.path.length; k++) rest += Math.hypot(goal.path[k + 1]!.x - goal.path[k]!.x, goal.path[k + 1]!.z - goal.path[k]!.z);
      const ease = last ? Math.min(1, l * 2.5 + 0.25) : 1;
      return { x: ((p.x - this.walker.x) / l) * ease, z: ((p.z - this.walker.z) / l) * ease, run: rest > 5 };
    }
    return { x: 0, z: 0, run: false };
  }

  // ---------------------------------------------------------------- each frame

  private worldHere(): WalkWorld {
    if (this.place === "island") return islandWorld(this.map);
    return (this.houseWorld ??= roomWorld(this.app.model.state, catalog));
  }

  private frame(dt: number): void {
    this.seconds += dt;
    if (this.place === "island") this.island.frame(this.seconds);
    const visible = this.place === "island" || this.app.editor.mode === "view";
    this.player.root.visible = visible;
    if (!visible) return;
    const input = this.walking() && !this.passing ? this.input() : { x: 0, z: 0, run: false };
    const before = this.walker;
    const next = stepWalker(before, input, Math.min(dt, 0.05), this.worldHere());
    if (this.goal && Math.hypot(next.x - before.x, next.z - before.z) < 0.002 && Math.hypot(input.x, input.z) > 0.1) this.goal.stuck += dt;
    this.walker = next;
    if (this.place === "island") this.outside = next;
    const moved = next.x !== before.x || next.z !== before.z || Math.abs(next.y - before.y) > 1e-5 || next.yaw !== before.yaw;

    // Doors.
    if (this.passing) {
      // Through one already.
    } else if (this.place === "island") {
      const at = atDoor(this.map, next.x, next.z, next.yaw);
      this.updateDoor(at);
      if (at && input.z < -0.5 && this.walking() && !this.goal) this.enter();
    } else if (outOfDoor(this.app.model.state, next.x, next.z)) {
      this.exit();
    }

    // The figure: where the walker is, turned its way, posed by its step.
    const p = this.place === "island"
      ? new THREE.Vector3(next.x, this.island.height(next.x, next.z) + (next.y - heightAt(this.map, next.x, next.z)), next.z)
      : new THREE.Vector3(next.x - this.app.model.state.w / 2, 0, next.z - this.app.model.state.d / 2);
    this.player.root.position.copy(p);
    this.player.root.rotation.y = next.yaw;
    applyPose(this.player, pose(next.phase, next.speed, this.seconds));
    if (this.place === "island") {
      this.app.stage.rig.setFollow(this.focus());
      this.app.stage.lighting.followShadows(this.focus());
      this.app.stage.lighting.setLamps(this.island.lampsNear(p));
    }
    if (moved || next.speed > 0.01 || this.moving) this.app.stage.invalidateShadows();
    this.moving = moved;
  }

  /** Where the camera looks outdoors: the player. */
  private focus(): THREE.Vector3 {
    const w = this.walker;
    return new THREE.Vector3(w.x, this.place === "island" ? this.island.height(w.x, w.z) : 0, w.z);
  }

  private updateDoor(at: boolean): void {
    if (at === this.atDoorNow) return;
    this.atDoorNow = at;
    this.events.door(at);
  }

  /** The player at the door, facing it. */
  get nearDoor(): boolean {
    return this.atDoorNow;
  }

  /** After decorating, the player steps out of whatever now stands where they were. */
  settle(): void {
    if (this.place !== "house") return;
    this.houseWorld = null;
    const s = this.app.model.state;
    const spot = nearestFree(s, catalog, this.walker.x, this.walker.z);
    this.walker = { ...this.walker, x: spot.x, z: spot.z };
  }

  private save(): void {
    try {
      const o = this.outside, h = this.place === "house" ? this.walker : null;
      const data: Saved = {
        place: this.place,
        island: { x: o.x, z: o.z, yaw: o.yaw },
        house: h ? { x: h.x, z: h.z, yaw: h.yaw } : { ...entrance(this.app.model.state) },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* not remembered */
    }
  }
}
