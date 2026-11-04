// The player on the console. The game is the island's core (src/core/game.ts over
// crates/island-core), linked into the renderer, which reads the player's place, position and
// pose from it each frame: the interface hands the core the island, the room and the stick, and
// changes the screens when the place changes.
//
//   Circle Pad      walk; B held, run
//   A               go in, standing at the door; else use the tool in hand (src/core/things.ts):
//                   shake a tree, chop, dig, cast and reel in; at the stall's counter, the shop
//   Y               pick up, or pull, what is at the player's feet
//   +Control Pad    left and right, the tool in hand
//   the stylus      on the phone's map, walk there (or to the door, on the house); from inside
//                   the house, out of the door and there
import { createSignal } from "solid-js";
import { EVENTS, game, type GameState, type Place } from "../../src/core/game.ts";
import { OUTCOME, things, type Hint, type Slot, type Slots } from "../../src/core/things.ts";
import { clock } from "../../src/core/clock.ts";
import { itemDef } from "../../src/items/items.ts";
import { doorFront, heightAt, type IslandMap } from "../../src/core/island.ts";
import { catalog } from "./catalog.ts";
import * as E from "./editor.ts";
import { ISLAND } from "./generated/island.ts";
import { island } from "./host.ts";
import { Mods } from "../../src/mods/api.ts";
import { MODS } from "../../src/mods/index.ts";
import { heard, music } from "./sound.ts";
import { sound } from "../../src/audio/hear.ts";
import { talk } from "../../src/npc/talk.ts";

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
  ramps: ISLAND.ramps, bridges: ISLAND.bridges, house: ISLAND.house, shop: ISLAND.shop, props: ISLAND.props, spawn: ISLAND.spawn,
};

// ---------------------------------------------------------------- where the player is

export type { Place };
const [place, setPlace] = createSignal<Place>("island");
const [nearDoor, setNearDoor] = createSignal(false);
/** Where the player is on the island's map, for its marker, and the game's clock: updated a few times a second. */
const [marker, setMarker] = createSignal<{ x: number; z: number; yaw: number; t: number }>({ x: map.spawn.x, z: map.spawn.z, yaw: 0, t: 0 });
/** The corners still ahead on a walk to a point outdoors, the last where it ends (island tiles); empty when there is none. */
const [route, setRoute] = createSignal<{ x: number; z: number }[]>([]);
/** 0..1 while going through the door: the screens fade to the paper's colour and back. */
const [fade, setFade] = createSignal(0);
/** What A would do now, and the tool in hand: for the legend and the upper screen's chip. */
const [hint, setHint] = createSignal<Hint>("");
/** What Y would pick up or pull now (A never picks up here, as on the handheld island games). */
const [pickHint, setPickHint] = createSignal<Hint>("");
const [held, setHeld] = createSignal(0);
/** The pockets and the box, as last read (after anything that changes them). */
const [slots, setSlots] = createSignal<Slots>({ held: 0, got: { item: 0, count: 0, wear: 0 }, broke: 0, pockets: [], box: [] });
export { fade, held, hint, marker, nearDoor, pickHint, place, route, slots };

let day = 0;

/** The pockets read again, and kept. */
export function refreshSlots(): void {
  setSlots(things.slots());
  setHeld(game.state().held);
}

/** What an action came to, said on the upper screen. */
function said(flags: number, got: Slot): void {
  // A at the counter: the shop takes the touch screen.
  if (flags & OUTCOME.shop) E.openSheet("shop");
  if (flags & OUTCOME.broke) {
    const tool = itemDef(things.slots().broke);
    if (tool) E.say(E.tr("got.broke", { name: E.pocketNameOf(tool) }), "warn", "broke");
    refreshSlots();
    persist();
  }
  const def = itemDef(got.item);
  const name = def ? E.pocketNameOf(def) : "";
  if (flags & OUTCOME.caught) E.say(flags & OUTCOME.new ? `${E.tr("got.caught", { name })} ${E.tr("got.new")}` : E.tr("got.caught", { name }), "good", "caught");
  else if (flags & OUTCOME.new && def) E.say(`${E.tr("got.item", { name })} ${E.tr("got.new")}`, "good", "new");
  else if (flags & OUTCOME.full) E.say(E.tr("got.full"), "warn", "full");
  else if (flags & OUTCOME.got && def) E.say(got.count > 1 ? E.tr("got.items", { name, n: got.count }) : E.tr("got.item", { name }), "info", "got");
  else if (flags & OUTCOME.escaped) E.say(E.tr("got.escaped"), "warn", "escaped");
  if (flags & (OUTCOME.got | OUTCOME.caught)) {
    refreshSlots();
    persist();
  }
}

let now: GameState | null = null;

// The mods, in the console's QuickJS: what they keep is one file on the SD card.
let modsKept: Record<string, string> = {};
let mods: Mods | null = null;
function startMods(): Mods {
  try {
    modsKept = JSON.parse(island.load("mods") ?? "{}") as Record<string, string>;
  } catch {
    modsKept = {};
  }
  return new Mods(MODS, {
    say: (key, params) => E.say(E.tr(key, params)),
    save: (key, value) => {
      if (value === null) delete modsKept[key];
      else modsKept[key] = value;
      island.save("mods", JSON.stringify(modsKept));
    },
    load: (key) => modsKept[key] ?? null,
  });
}
let roomSeen: unknown = null;
let lastMarker = -1;

/** The screens for `p` (the renderer reads the place from the core): the plan or the map, the camera put back. */
function show(p: Place): void {
  setPlace(p);
  setNearDoor(false);
  E.setOutdoors(p === "island");
  E.camera(0, 0, 0, true);
  if (p === "island") E.clearSelection();
  persist();
}

export function exit(): void {
  game.exit();
}

/** A point on the island to walk to once out of the door (a tap on the map from inside the house). */
let outThere: { x: number; z: number; go: boolean } | null = null;

/** Walk to a point on the island, round what is in the way; `go` goes in at the door at the end. From
 * inside the house the player goes out first. */
export function walkTo(x: number, z: number, go = false): void {
  if (place() === "house") {
    outThere = { x, z, go };
    game.exit();
    return;
  }
  game.walkTo(x, z, go);
}

/** Walk to the door and go in. */
export function goHome(): void {
  if (place() !== "island") return;
  const d = doorFront(map);
  walkTo(d.x, d.z, true);
}

/** Each frame: the stick walks the player (`run` while B is held); the place, the door and the fade follow the core. */
export function frame(run: boolean, lx: number, ly: number, dt = 1 / 60): void {
  // The room the player walks, whenever it has changed (the player steps aside from a piece put where they stand).
  const room = E.room();
  if (room !== roomSeen) {
    roomSeen = room;
    game.room(room, catalog);
  }
  const busy = !!(E.sheet() || E.confirmation());
  const events = game.step(lx, ly, run, busy, dt);
  now = game.state();
  heard(events, now, game.surface(), E.room().flooring);
  music(clock.hour(), now.place === "house", talk.open || E.sheet() === "shop");
  if (events & EVENTS.place) {
    show(now.place);
    mods?.emit("place", now.place);
  }
  if (events & EVENTS.door) {
    setNearDoor(now.nearDoor);
    mods?.emit("door", now.nearDoor);
  }
  if (events & EVENTS.arrived) mods?.emit("arrived", undefined);
  if (events >= OUTCOME.got) said(events, things.slots().got);
  mods?.emit("frame", dt);
  if (now.fade !== fade()) setFade(now.fade);
  if (now.held !== held()) setHeld(now.held);
  // A new day (past midnight, or the clock moved): the island's things for it, checked a few times a second.
  if (Math.floor(now.seconds * 4) !== Math.floor((now.seconds - dt) * 4)) {
    const today = clock.day();
    if (today !== day) {
      day = today;
      things.day(today);
    }
    things.hour(clock.hour());
    const h = now.place === "island" ? things.hint("use") : "";
    if (h !== hint()) setHint(h);
    const p = now.place === "island" ? things.hint("pick") : "";
    if (p !== pickHint()) setPickHint(p);
  }
  // Out of the door with somewhere to go: there, once the fade is over.
  if (outThere && now.place === "island" && now.fade === 0) {
    game.walkTo(outThere.x, outThere.z, outThere.go);
    outThere = null;
  }
  if (outThere && now.place === "house" && !now.fade && !(events & EVENTS.fading)) outThere = null;
  if (now.place === "island" && Math.floor(now.seconds * 8) !== lastMarker) {
    lastMarker = Math.floor(now.seconds * 8);
    setMarker({ x: now.x, z: now.z, yaw: now.yaw, t: now.seconds });
    const ahead = now.walking ? game.goal() : [];
    if (ahead.length || route().length) setRoute(ahead);
  }
}

/** A press of A outdoors: in at the door when standing there, else using what is in hand (or talking, or shaking a tree); never picking up. */
export function pressA(): boolean {
  if (place() !== "island") return false;
  const flags = game.act("use");
  heard(flags, game.state(), "", E.room().flooring);
  if (flags >= OUTCOME.got) said(flags, things.slots().got);
  return true;
}

/** Y outdoors: picking up (or pulling) what is at the player's feet, and nothing else. */
export function pickUp(): void {
  if (place() !== "island") return;
  const flags = game.act("pick");
  heard(flags, game.state(), "", E.room().flooring);
  if (flags >= OUTCOME.got) said(flags, things.slots().got);
}

/** The next tool in hand (`dir` 1) or the one before (-1), empty hands among them. */
export function cycleTool(dir: number): void {
  things.cycle(dir);
  sound("tool", 0.6);
  refreshSlots();
}

/** Down on the +Control Pad: the tool in hand put away. */
export function putAwayTool(): void {
  const s = things.slots();
  if (!s.held) return;
  things.hold(s.pockets.findIndex((p) => p.item === s.held));
  refreshSlots();
}

/** Pocket `slot` into the box (in the house), the box's into the pockets, a pocket dropped (outdoors), a tool held. */
export function pocket(action: "store" | "take" | "drop" | "hold", slot: number): void {
  if (action === "store") things.store(slot);
  else if (action === "take") things.take(slot);
  else if (action === "drop") things.drop(slot);
  else things.hold(slot);
  refreshSlots();
  persist();
}

// ---------------------------------------------------------------- what is kept

interface KeptWorld {
  version: 1;
  place: Place;
  island: { x: number; z: number; yaw: number };
  /** Where in the house, when the player is in it (the core brings them in at the door otherwise). */
  house: { x: number; z: number; yaw: number } | null;
  /** The island's things and the pockets (src/core/things.ts save), as runs before "things" was kept on its own kept them. */
  things?: number[];
}

/** Where the player is, kept: a few numbers (what they carry and what lies about is `keepThings`). */
function keepPlace(): void {
  const n = now ?? game.state();
  const kept: KeptWorld = {
    version: 1, place: n.place, island: n.outside,
    house: n.place === "house" ? { x: n.x, z: n.z, yaw: n.yaw } : null,
  };
  island.save("world", JSON.stringify(kept));
  keptAt = { place: n.place, x: n.x, z: n.z };
}

let keptThings: number[] = [];
/**
 * The island's things, the pockets, the coins and the field guide, kept when they have changed since
 * they last were (some thousand numbers, a write the card takes 55 ms over): after a catch, a sale,
 * a pocket moved, a tool broken, the door.
 */
export function keepThings(): void {
  const data = things.save();
  if (data.length === keptThings.length && data.every((v, i) => v === keptThings[i])) return;
  keptThings = data;
  island.save("things", JSON.stringify(data));
}

function persist(): void {
  keepPlace();
  keepThings();
}

let lastKept = 0;
let keptAt: { place: Place; x: number; z: number } | null = null;
/** Now and then, where the player is is kept, when they have moved since. */
export function keepNow(): void {
  if (!now || now.seconds - lastKept < 5) return;
  lastKept = now.seconds;
  if (keptAt && keptAt.place === now.place && Math.hypot(now.x - keptAt.x, now.z - keptAt.z) < 0.25) return;
  keepPlace();
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
  roomSeen = E.room();
  game.room(E.room(), catalog);
  const o = kept?.island;
  const at = o && heightAt(map, o.x, o.z) > -0.1 ? o : map.spawn;
  game.restore(map, at, kept?.place === "house" ? kept.house ?? null : null);
  // The pockets and the island's things as kept, or a first run's; then today's.
  // What they carry and what lies about: kept on its own, or (from before) with the place.
  let saved: number[] | undefined = kept?.things;
  try {
    const text = island.load("things");
    if (text) saved = JSON.parse(text) as number[];
  } catch {
    /* the place's, or none */
  }
  if (!saved || !things.load(saved)) things.reset();
  else keptThings = saved;
  day = clock.day();
  things.day(day);
  refreshSlots();
  now = game.state();
  mods = startMods();
  show(now.place);
}
