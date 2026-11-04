import "@fontsource/zcool-kuaile/chinese-simplified-400.css";
import "@fontsource/zcool-kuaile/latin-400.css";
import "@fontsource-variable/baloo-2/index.css";
import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/700.css";
import "@fontsource/m-plus-rounded-1c/800.css";
import "./ui/style.css";
import * as THREE from "three";
import { App } from "./app.ts";
import { FURNITURE, furniture } from "./furniture/catalog.ts";
import { GLOW_LAYER } from "./scene/materials.ts";
import { instance } from "./scene/view.ts";
import { mountUI } from "./ui/ui.ts";
import { World } from "./world.ts";
import { clock } from "./core/clock.ts";
import { loadCore } from "./core/wasm.ts";
import coreUrl from "./core/pocket_island_core.wasm?url";
import * as i18n from "./i18n/index.ts";
import { game } from "./core/game.ts";
import { shop, things } from "./core/things.ts";

i18n.applyToDocument();
// The island's core (crates/island-core) before anything asks a rule of it.
await loadCore(coreUrl);

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ui = mountUI(document.getElementById("ui")!);
const app = new App(canvas, ui.events);
const world = new World(app, ui.worldEvents);
ui.attach(app, world);
app.stage.start();
(window as unknown as { app: App }).app = app;
(window as unknown as { world: World }).world = world;
(window as unknown as Record<string, unknown>).__clock = clock;
// The player's game and the island's things, for scripted checks (scripts/e2e.ts).
(window as unknown as Record<string, unknown>).__game = game;
(window as unknown as Record<string, unknown>).__things = things;
(window as unknown as Record<string, unknown>).__shop = shop;
(window as unknown as Record<string, unknown>).__i18n = i18n;

// For scripted checks: where a room point or an item is on screen, in CSS pixels.
(window as unknown as Record<string, unknown>).__def = furniture;
(window as unknown as Record<string, unknown>).__screen = (x: number, y: number, z: number) => {
  const s = app.model.state;
  const p = app.stage.project(new THREE.Vector3(x - s.w / 2, y, z - s.d / 2));
  return [Math.round(p.x), Math.round(p.y)];
};
// Where an island point is on screen.
(window as unknown as Record<string, unknown>).__islandScreen = (x: number, y: number, z: number) => {
  const p = app.stage.project(new THREE.Vector3(x, y, z));
  return [Math.round(p.x), Math.round(p.y)];
};
// Lamps with nothing in their model that glows: they would light the room from an invisible source.
(window as unknown as Record<string, unknown>).__glowless = () =>
  FURNITURE.filter((d) => d.light).filter((d) => d.variants.some((_, v) => {
    let glowing = 0;
    instance(d, v).root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.layers.isEnabled(GLOW_LAYER)) glowing++; });
    return glowing === 0;
  })).map((d) => d.id);
(window as unknown as Record<string, unknown>).__screenOf =(uid: string, lift = 0.3) => {
  const e = app.view.entry(uid);
  if (!e) return null;
  const v = e.root.position.clone();
  v.y += lift;
  const p = app.stage.project(v);
  return [Math.round(p.x), Math.round(p.y)];
};

// Ready once a few frames have drawn: the screenshot script waits for this.
let frames = 0;
const off = app.stage.onFrame(() => {
  if (++frames === 8) {
    document.documentElement.dataset.ready = "true";
    off();
  }
});
