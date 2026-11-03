// The player's world: the island outside and the room inside the house, one at a time on the
// stage, and the player walking in whichever it is. The game itself is the island's core
// (src/core/game.ts): it walks the player by the stick, finds the way to a click, watches the
// door and runs the fade; this hands it the keys and the clicks and draws what it says.
//
// Outdoors the camera follows the player north over the island; walking into the door goes
// inside, where the room is what it always was (the editor decorates it) and the player walks
// between the furniture; walking out through the doorway comes back to the island in front of the
// door. The keys walk (WASD or the arrows, Shift to run), a click on the ground walks there (with
// dots marching to a ring where the walk ends, src/scene/route.ts), and E or Enter goes in at the door.

import * as THREE from "three";
import type { App } from "./app.ts";
import { EVENTS, game, type GameState, type Place } from "./core/game.ts";
import { heightAt, makeIsland, type IslandMap } from "./core/island.ts";
import { buildCharacter, type Character } from "./character/model.ts";
import { applyPose } from "./character/pose.ts";
import { catalog } from "./furniture/catalog.ts";
import { IslandView } from "./island/view.ts";
import { RouteMarker } from "./scene/route.ts";
import { skyPhase, weights, type SkyPhase } from "./core/clock.ts";
import { Mods } from "./mods/api.ts";
import { MODS } from "./mods/index.ts";
import { t, type MessageKey } from "./i18n/index.ts";

export type { Place };

export interface WorldEvents {
  /** The player went in or out; the interface changes with it. */
  place(place: Place): void;
  /** Whether the player stands at the door, facing it (the interface offers to go in). */
  door(at: boolean): void;
  /** Something to tell the player (a mod's words). */
  say(text: string): void;
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
  /** Where a click sent the player. */
  readonly route = new RouteMarker();
  /** The game as of the last frame. */
  now: GameState;
  private shown: Place | null = null;
  private keys = new Set<string>();
  private fade = fader();
  private phase: SkyPhase = skyPhase(12);
  private ray = new THREE.Raycaster();
  private moving = false;
  private lastSaved = 0;
  private mods: Mods;
  /** A point on the island to walk to once out of the door (the phone's map, from inside the house). */
  private outThere: { x: number; z: number; enter: boolean } | null = null;

  constructor(readonly app: App, private events: WorldEvents) {
    this.map = makeIsland();
    this.island = new IslandView(this.map);
    this.player = buildCharacter();
    app.stage.scene.add(this.island.group, this.player.root, this.route.group);
    game.room(app.model.state, catalog);
    app.model.subscribe((next) => game.room(next, catalog));
    const params = new URLSearchParams(location.search);
    const saved = params.has("fresh") ? null : load();
    const start: Place = params.get("place") === "house" ? "house" : params.get("place") === "island" ? "island" : saved?.place ?? "island";
    const spawn = this.map.spawn;
    game.restore(this.map, saved?.island ?? spawn, start === "house" ? saved?.house ?? null : null);
    if (start === "house" && !saved?.house) game.enter(true);
    this.now = game.state();
    this.mods = new Mods(MODS, {
      say: (key: MessageKey, params) => this.events.say(t(key, params)),
      save: (key, value) => {
        try {
          if (value === null) localStorage.removeItem(`pocket-island/${key}`);
          else localStorage.setItem(`pocket-island/${key}`, value);
        } catch {
          /* not kept */
        }
      },
      load: (key) => {
        try {
          return localStorage.getItem(`pocket-island/${key}`);
        } catch {
          return null;
        }
      },
    });
    this.show(this.now.place);

    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.keys.clear());
    app.stage.canvas.addEventListener("pointerdown", (e) => this.pointer(e));
    app.stage.onFrame((dt) => this.frame(dt / 1000));
    window.addEventListener("beforeunload", () => this.save());
  }

  get place(): Place {
    return this.now.place;
  }

  get nearDoor(): boolean {
    return this.now.nearDoor;
  }

  /** Where the player stands and faces, in the place's tiles. */
  get walker(): { x: number; z: number; yaw: number } {
    return { x: this.now.x, z: this.now.z, yaw: this.now.yaw };
  }

  // ---------------------------------------------------------------- going in and out

  /** Into the house (through the fade). */
  enter(): void {
    game.enter();
  }

  /** Out to the island, in front of the door. */
  exit(): void {
    game.exit();
  }

  /** The stage shows `place`: the island and the camera that follows, or the room. */
  private show(place: Place): void {
    if (this.shown === place) return;
    this.shown = place;
    this.keys.clear();
    this.island.group.visible = place === "island";
    this.app.setIndoors(place === "house");
    if (place === "island") {
      this.app.stage.rig.setFollow(this.focus(), true);
      this.applyLight();
    }
    this.events.place(place);
    this.save();
  }

  /** The clock's phase: the light outdoors follows it. */
  setPhase(phase: SkyPhase): void {
    this.phase = phase;
    if (this.place === "island") this.applyLight();
  }

  private applyLight(): void {
    this.app.stage.lighting.outdoors(this.phase);
    const w = weights(this.phase);
    // The windows and lanterns light up as it darkens, the windows as the rooms inside are lit.
    this.island.setNight(w.night + w.dusk * 0.55, this.app.houseLight());
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
    }
    if (down && (code === "KeyE" || code === "Enter") && this.place === "island" && this.nearDoor) {
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
    if (house) this.walkTo(this.map.house.door.x, this.map.house.door.z + 0.5, true);
    else this.walkTo(hit.point.x, hit.point.z);
  }

  /** Walk to a point in the current place's tiles, round whatever is in the way; `enter` goes in at the end. */
  walkTo(x: number, z: number, enter = false): void {
    game.walkTo(x, z, enter);
  }

  /** Walk to a point on the island (the phone's map): from inside the house, out of the door first. */
  walkOnIsland(x: number, z: number, enter = false): void {
    if (this.place === "house") {
      this.outThere = { x, z, enter };
      this.exit();
      return;
    }
    game.walkTo(x, z, enter);
  }

  /** The keys as the stick: up the screen is away from the camera, however it has turned. */
  private stick(): { x: number; z: number; run: boolean } {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let z = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    const run = k.has("ShiftLeft") || k.has("ShiftRight");
    if (!x && !z) return { x: 0, z: 0, run };
    const yaw = this.app.stage.rig.yaw;
    const l = Math.hypot(x, z);
    [x, z] = [(x * Math.cos(yaw) + z * Math.sin(yaw)) / l, (-x * Math.sin(yaw) + z * Math.cos(yaw)) / l];
    return { x, z, run };
  }

  // ---------------------------------------------------------------- each frame

  private frame(dt: number): void {
    const before = this.now;
    const stick = this.stick();
    const events = game.step(stick.x, stick.z, stick.run, !this.walking(), Math.min(dt, 0.05));
    const now = (this.now = game.state());
    if (events & EVENTS.place) {
      this.show(now.place);
      this.mods.emit("place", now.place);
    }
    if (events & EVENTS.door) {
      this.events.door(now.nearDoor);
      this.mods.emit("door", now.nearDoor);
    }
    if (events & EVENTS.arrived) this.mods.emit("arrived", undefined);
    this.mods.emit("frame", dt);
    this.fade.style.opacity = String(now.fade);
    if (now.place === "island") this.island.frame(now.seconds);
    // Out of the door with somewhere to go: there, once the fade is over.
    if (this.outThere && now.place === "island" && now.fade === 0) {
      game.walkTo(this.outThere.x, this.outThere.z, this.outThere.enter);
      this.outThere = null;
    }
    if (this.outThere && now.place === "house" && now.fade === 0 && !(events & EVENTS.fading)) this.outThere = null;
    const w = this.app.model.state.w, d = this.app.model.state.d;
    this.route.update(now, now.walking ? game.goal() : [], now.seconds,
      now.place === "island" ? (x, z) => this.island.height(x, z) : () => 0.02,
      now.place === "island" ? 0 : -w / 2, now.place === "island" ? 0 : -d / 2);

    const visible = now.place === "island" || this.app.editor.mode === "view";
    this.player.root.visible = visible;
    if (!visible) return;
    // The figure: where the walker is, turned its way, posed by the core.
    const p = now.place === "island"
      ? new THREE.Vector3(now.x, this.island.height(now.x, now.z) + (now.y - heightAt(this.map, now.x, now.z)), now.z)
      : new THREE.Vector3(now.x - this.app.model.state.w / 2, 0, now.z - this.app.model.state.d / 2);
    this.player.root.position.copy(p);
    this.player.root.rotation.y = now.yaw;
    applyPose(this.player, game.pose());
    if (now.place === "island") {
      this.app.stage.rig.setFollow(this.focus());
      this.app.stage.lighting.followShadows(this.focus());
      this.app.stage.lighting.setLamps(this.island.lampsNear(p));
    }
    const moved = now.x !== before.x || now.z !== before.z || now.yaw !== before.yaw || Math.abs(now.y - before.y) > 1e-5;
    if (moved || now.speed > 0.01 || this.moving) this.app.stage.invalidateShadows();
    this.moving = moved;
    if (now.seconds - this.lastSaved > 5) this.save();
  }

  /** Where the camera looks outdoors: the player. */
  private focus(): THREE.Vector3 {
    const n = this.now;
    return new THREE.Vector3(n.x, this.place === "island" ? this.island.height(n.x, n.z) : 0, n.z);
  }

  private save(): void {
    const n = this.now;
    this.lastSaved = n.seconds;
    try {
      const data: Saved = {
        place: n.place,
        island: n.outside,
        house: n.place === "house" ? { x: n.x, z: n.z, yaw: n.yaw } : { x: this.app.model.state.w / 2, z: this.app.model.state.d - 0.45, yaw: Math.PI },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* not remembered */
    }
  }
}
