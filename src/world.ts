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
//
// Outdoors the player gathers and catches (src/core/things.ts): Space picks up what is ahead or uses
// the tool in hand (shakes a tree with none, chops with the axe, digs with the shovel, casts and reels
// with the rod), and Tab, or 1 to 4, changes the tool. The island's things come with the date.
//
// In the house, outside the editor, the player handles the furniture as on the island games
// (src/core/game.ts grab, crates/island-core/src/handle.rs): Space held at a piece takes hold of it
// and the keys then push, pull or turn it; a tap of Space switches a lamp; F picks up what is ahead
// into the pockets, and the pockets put a piece back down (`putDown`). What that does to the room is
// done to the editor's (src/core/edits.ts handled).

import * as THREE from "three";
import type { App } from "./app.ts";
import { EVENTS, game, type GameState, type Place } from "./core/game.ts";
import { applyHandled, switches } from "./core/edits.ts";
import { furnitureOf } from "./furniture/codes.ts";
import { doorFront, heightAt, makeIsland, type IslandMap } from "./core/island.ts";
import { buildCharacter, type Character } from "./character/model.ts";
import { applyPose } from "./character/pose.ts";
import { catalog, furniture } from "./furniture/catalog.ts";
import { IslandView } from "./island/view.ts";
import { RouteMarker } from "./scene/route.ts";
import { ITEM, LINE_POINTS, OUTCOME, things, type Slot } from "./core/things.ts";
import { FISHING_LINE, ThingsView } from "./island/things.ts";
import { HOLD, itemModel } from "./items/models.ts";
import { itemDef, TOOLS } from "./items/items.ts";
import { clock } from "./core/clock.ts";
import { skyPhase, weights, type SkyPhase } from "./core/clock.ts";
import { Mods } from "./mods/api.ts";
import { MODS } from "./mods/index.ts";
import { t, type MessageKey } from "./i18n/index.ts";
import { audio } from "./audio/player.ts";
import { Cues } from "./audio/cues.ts";
import { pieceAt } from "./audio/names.ts";
import { talk } from "./npc/talk.ts";
import { hear, sound } from "./audio/hear.ts";
import { keep, kept } from "./kept.ts";

export type { Place };

export interface WorldEvents {
  /** The player went in or out; the interface changes with it. */
  place(place: Place): void;
  /** Whether the player stands at the door, facing it (the interface offers to go in). */
  door(at: boolean): void;
  /** Something to tell the player (a mod's words). */
  say(text: string): void;
  /** What an action came to (src/core/things.ts OUTCOME flags), and what it brought. */
  outcome(flags: number, got: Slot): void;
  /** A piece from the pockets was not put down, and why (src/core/game.ts put). */
  refused(why: number): void;
  /** Whether a dialog is open over the world (the player stands still, the music is lower). */
  dialog(): boolean;
}


interface Saved {
  place: Place;
  island: { x: number; z: number; yaw: number };
  /** Where in the house, when the player is in it (the core brings them in at the door otherwise). */
  house: { x: number; z: number; yaw: number } | null;
  /** The island's things and the pockets (src/core/things.ts save). */
  things?: number[];
}

function load(): Saved | null {
  try {
    const raw = kept("world/v1");
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    return s && (s.place === "island" || s.place === "house") && s.island ? s : null;
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
  /** The island's things. */
  readonly things = new ThingsView();
  /** The tool in the player's hand, and which it is. */
  private tool: THREE.Object3D | null = null;
  private toolHeld = 0;
  private line: THREE.Line;
  private day = 0;
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
  /** A click on the stall: on the way to its counter (1), the last step up to it (2), then A. */
  private toShop = 0;
  /** What the frames sound like (src/audio/cues.ts). */
  private cues = new Cues();
  /** In the house, whether Space is down (the core has hold of a piece while it is, GameState.hold). */
  private grabbing = false;

  constructor(readonly app: App, private events: WorldEvents) {
    this.map = makeIsland();
    this.island = new IslandView(this.map);
    this.player = buildCharacter();
    this.island.group.add(this.things.group);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: LINE_POINTS }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: FISHING_LINE.color, transparent: true, opacity: FISHING_LINE.opacity }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    app.stage.scene.add(this.island.group, this.player.root, this.route.group, this.line);
    game.room(app.model.state, catalog);
    app.model.subscribe((next) => game.room(next, catalog));
    const params = new URLSearchParams(location.search);
    const saved = params.has("fresh") ? null : load();
    const start: Place = params.get("place") === "house" ? "house" : params.get("place") === "island" ? "island" : saved?.place ?? "island";
    const spawn = this.map.spawn;
    game.restore(this.map, saved?.island ?? spawn, start === "house" ? saved?.house ?? null : null);
    if (start === "house" && !saved?.house) game.enter(true);
    // The pockets and the island's things as kept, or a first run's; then today's.
    if (!saved?.things || !things.load(saved.things)) things.reset();
    this.day = clock.day();
    things.day(this.day);
    this.now = game.state();
    this.mods = new Mods(MODS, {
      say: (key: MessageKey, params) => this.events.say(t(key, params)),
      save: keep,
      load: kept,
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
      this.grab(false);
      return;
    }
    const code = e.code;
    if (this.place === "house" && (code === "Space" || code === "KeyF")) {
      e.preventDefault();
      if (code === "Space" && !e.repeat) this.grab(down);
      else if (code === "KeyF" && down && !e.repeat) this.pickUp();
      return;
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(code)) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      this.toShop = 0;
      if (code.startsWith("Arrow")) e.preventDefault();
    }
    if (down && (code === "KeyE" || code === "Enter") && this.place === "island" && this.nearDoor) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.enter();
    }
    if (!down || this.place !== "island") return;
    if (code === "Space" && !e.repeat) {
      e.preventDefault();
      this.act();
    } else if (code === "Tab") {
      e.preventDefault();
      things.cycle(e.shiftKey ? -1 : 1);
      sound("tool", 0.6);
    } else if (/^Digit[1-4]$/.test(code)) {
      // 1 empty hands, then the tools in the core's order.
      this.holdTool([0, ...TOOLS.map((d) => d.id)][Number(code.slice(5)) - 1] ?? 0);
    }
  }

  /** Whether the player walks now: not while decorating or with a dialog open. */
  walking(): boolean {
    if (this.place === "house" && this.app.editor.mode !== "view") return false;
    return !this.events.dialog();
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
    // A click on the stall walks up to its counter and speaks to the keeper.
    const [sx0, sz0, sx1, sz1] = this.map.shop.rect;
    const stall = hit.point.x > sx0 - 0.3 && hit.point.x < sx1 + 0.3 && hit.point.z > sz0 - 0.6 && hit.point.z < sz1 + 0.5;
    this.toShop = 0;
    if (house) {
      const d = doorFront(this.map);
      this.walkTo(d.x, d.z, true);
    }
    else if (stall) {
      this.toShop = 1;
      this.walkTo(this.map.shop.keeper.x, sz1 + 1.3);
    } else this.walkTo(hit.point.x, hit.point.z);
  }

  /** Walk to a point in the current place's tiles, round whatever is in the way; `enter` goes in at the end. */
  walkTo(x: number, z: number, enter = false): void {
    game.walkTo(x, z, enter);
  }

  /** A press of A: picking up, shaking, chopping, digging, casting, reeling in, or going in at the door. */
  act(): void {
    if (this.place !== "island" || !this.walking()) return;
    const flags = game.act();
    this.hear(flags);
    if (flags >= OUTCOME.got) this.events.outcome(flags, things.slots().got);
  }

  /** In the house: Space down takes hold of the piece ahead; up lets go, and a tap switches the lamp or television ahead. */
  private grab(on: boolean): void {
    if (on) {
      this.grabbing = true;
      game.grab(true);
      return;
    }
    if (!this.grabbing) return;
    this.grabbing = false;
    const k = game.grab(false);
    const p = k >= 0 ? this.app.model.state.items[k] : undefined;
    if (p && switches(furniture(p.item))) this.app.editor.toggle(p.uid);
  }

  /** In the house: what is ahead into the pockets. */
  private pickUp(): void {
    const flags = game.act("pick");
    this.hear(flags);
    this.handled();
    if (flags >= OUTCOME.got) this.events.outcome(flags, things.slots().got);
  }

  /** The piece of furniture in pocket `slot` put down in front of the player (the pockets' Place): whether it was; why not is said. */
  putDown(slot: number): boolean {
    const s = things.slots().pockets[slot];
    const piece = s && furnitureOf(s.item);
    if (!s || !piece || !furniture(piece.id)) return false;
    const why = game.put(slot, s.item, catalog);
    if (why) {
      this.events.refused(why);
      return false;
    }
    this.hear(EVENTS.room);
    this.handled(piece);
    return true;
  }

  /** What the player last did to the room by hand, done to the editor's (edits.ts applyHandled), and the pockets kept when they changed. */
  private handled(piece?: { id: string; variant: number }): void {
    const c = game.change();
    if (c && applyHandled(this.app.model, c, piece)) this.save();
  }

  /** The sounds of what happened. */
  private hear(events: number): void {
    for (const c of this.cues.frame(events, game.state(), game.surface(), this.app.model.state.flooring)) hear.play(c);
  }

  /** The tool `id` in hand (0: empty hands), if it is in the pockets. */
  holdTool(id: number): void {
    const s = things.slots();
    if (id === 0) {
      if (s.held) things.hold(s.pockets.findIndex((p) => p.item === s.held));
      return;
    }
    const slot = s.pockets.findIndex((p) => p.item === id);
    if (slot >= 0 && s.held !== id) things.hold(slot);
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
    this.hear(events);
    audio.music(pieceAt(clock.hour()), now.place === "house", talk.open || this.events.dialog());
    if (events & EVENTS.place) {
      this.show(now.place);
      this.mods.emit("place", now.place);
    }
    if (events & EVENTS.door) {
      this.events.door(now.nearDoor);
      this.mods.emit("door", now.nearDoor);
    }
    if (events & EVENTS.arrived) {
      this.mods.emit("arrived", undefined);
      // Up to the counter from in front of it, so as to face the keeper, then A.
      if (this.toShop === 1) {
        this.toShop = 2;
        game.walkTo(this.map.shop.keeper.x, this.map.shop.rect[3] + 0.6);
      } else if (this.toShop === 2) {
        this.toShop = 0;
        this.act();
      }
    }
    if (events >= OUTCOME.got) this.events.outcome(events, things.slots().got);
    if (events & EVENTS.moved) this.handled();
    this.mods.emit("frame", dt);
    // A new day (the clock moved past midnight, or was moved): the island's things for it.
    const day = clock.day();
    if (day !== this.day) {
      this.day = day;
      things.day(day);
    }
    things.hour(clock.hour());
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
    this.showTool(now.place === "island" ? now.held : 0);
    if (now.place === "island") {
      const view = things.view();
      if (this.things.update(view.n, view.data, (x, z, f) => this.island.sway(x, z, f), () => this.island.still())) this.app.stage.invalidateShadows();
      this.showLine();
    } else this.line.visible = false;
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

  /** The tool in the right hand, as HOLD holds it (src/items/models.ts). */
  private showTool(id: number): void {
    if (id === this.toolHeld) return;
    this.toolHeld = id;
    this.tool?.removeFromParent();
    this.tool = null;
    const def = itemDef(id);
    const hold = def && HOLD[def.key];
    if (!def || !hold) return;
    const tool = itemModel(id).clone();
    tool.position.set(...hold.at);
    tool.rotation.x = hold.turn;
    tool.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.player.parts.armR.add(tool);
    this.tool = tool;
  }

  /** The fishing line, from the rod's tip to the float, as the core lays it (things.line). */
  private showLine(): void {
    this.line.visible = !!this.tool && this.toolHeld === ITEM.rod;
    if (!this.line.visible || !this.tool) return;
    this.tool.updateWorldMatrix(true, false);
    const tip = new THREE.Vector3(...HOLD.rod!.tip).applyMatrix4(this.tool.matrixWorld);
    const { n, points } = things.line(tip.x, tip.y, tip.z);
    if (n < LINE_POINTS) {
      this.line.visible = false;
      return;
    }
    const p = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < n; k++) p.setXYZ(k, points[k * 3]!, points[k * 3 + 1]!, points[k * 3 + 2]!);
    p.needsUpdate = true;
  }

  /** Where the camera looks outdoors: the player. */
  private focus(): THREE.Vector3 {
    const n = this.now;
    return new THREE.Vector3(n.x, this.place === "island" ? this.island.height(n.x, n.z) : 0, n.z);
  }

  /** Keep where the player is and what they carry, now (after the pockets or the box change). */
  keep(): void {
    this.save();
  }

  private save(): void {
    const n = this.now;
    this.lastSaved = n.seconds;
    const data: Saved = {
      place: n.place,
      island: n.outside,
      house: n.place === "house" ? { x: n.x, z: n.z, yaw: n.yaw } : null,
      things: things.save(),
    };
    keep("world/v1", JSON.stringify(data));
  }
}
