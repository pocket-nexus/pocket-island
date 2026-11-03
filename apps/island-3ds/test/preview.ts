// The 3DS interface on the host: the compiled bundle (`bun tools/n3ds.ts ui`)
// runs on PocketJS's UI core built for wasm, with a stand-in renderer, and
// each screen it is driven to is written as a picture of both screens.
//
//   bun apps/island-3ds/test/preview.ts [lang] [--backdrop capture.png]
//
// The upper screen is laid over a capture of the console's room when one is
// given; the touch screen over the paper the plan sits on. The glyphs are
// each language's own atlases (tools/fonts.ts), loaded as the console loads them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createCanvas, ImageData, loadImage } from "../../../vendor/pocketjs/node_modules/@napi-rs/canvas";
import { PROP } from "../../../vendor/pocketjs/contracts/spec/spec.ts";
import { createWasmUi } from "../../../vendor/pocketjs/platforms/web/wasm-ops.js";
import { loadCoreSync } from "../../../src/core/wasm.ts";

const root = resolve(import.meta.dir, "../../..");
const argv = process.argv.slice(2);
const lang = argv.find((a) => ["en", "zh", "ja"].includes(a)) ?? "en";
const at = argv.indexOf("--backdrop");
const backdrop = at >= 0 ? argv[at + 1] : join(root, ".pocket-build/validation/3ds/second.png");
const out = join(root, ".pocket-build/preview", lang);
mkdirSync(out, { recursive: true });

const guest = join(root, ".pocket-build/3ds/guest");
const wasm = await createWasmUi(readFileSync(join(root, "vendor/pocketjs/platforms/web/pocketjs.wasm")), { width: 400, height: 240, rasterDensity: 1 });
wasm.createAuxiliarySurface(320, 240);
const ops = wasm.ops as any;
const globals = globalThis as any;

// The renderer: what the extension would be, with the glyphs loaded from the files the console reads.
function loadFonts(code: string): void {
  const path = join(root, ".pocket-build/3ds/romfs", `fonts-${code}.bin`);
  if (!existsSync(path) || !ops.loadFontAtlas) return;
  const bytes = new Uint8Array(readFileSync(path));
  const view = new DataView(bytes.buffer);
  let o = 4;
  for (let i = 0; i < view.getUint32(0, true); i++) {
    const n = view.getUint32(o, true);
    ops.loadFontAtlas(bytes.slice(o + 4, o + 4 + n));
    o += 4 + n;
  }
}
const saved = new Map<string, string>([["room", JSON.stringify({ version: 1, lang })]]);
globals.island = {
  info: () => ({ ok: true, error: "", catalogue: 0, items: 0, finishes: 0, new3ds: true }),
  room() {}, marks() {}, light() {}, camera() {}, plan() {}, options() {}, tune() {},
  fonts: (code: string) => (loadFonts(code), true),
  save: (name: string, text: string) => (saved.set(name, text), true),
  load: (name: string) => saved.get(name) ?? null,
  stats: () => ({ fps: 60, frameMs: 16.7, gpuMs: 9, draws: 120, triangles: 15000, lamps: 2, residentKB: 3000, linearFreeKB: 20000, font: lang }),
};
globals.ui = ops;
// The island's core, as the console's renderer would give it: here its WebAssembly module.
globals.islandCore = loadCoreSync(readFileSync(join(root, "src/core/pocket_island_core.wasm")));
globals.__pak = readFileSync(join(guest, "pocket-island.pak")).buffer;
(0, eval)(readFileSync(join(guest, "pocket-island.js"), "utf8"));

const BTN: Record<string, number> = { A: 0x2000, B: 0x4000, X: 0x1000, Y: 0x8000, L: 0x100, R: 0x200, START: 0x8, SELECT: 0x1, UP: 0x10, DOWN: 0x40, LEFT: 0x80, RIGHT: 0x20 };
function frame(buttons = 0, touch?: [number, number]): void {
  const packed = touch ? [((1 << 18) | ((touch[1] & 511) << 9) | (touch[0] & 511)) >>> 0] : [];
  const hits = touch ? [ops.hitTestBoundsAuxiliary(touch[0], touch[1])] : [];
  globals.frame(buttons, undefined, packed, hits, touch ? [1] : []);
  wasm.tick();
}
const wait = (n: number) => { for (let i = 0; i < n; i++) frame(); };
const press = (name: string) => { frame(BTN[name]); frame(BTN[name]); wait(3); };
const tap = (x: number, y: number) => { for (let i = 0; i < 3; i++) frame(0, [x, y]); wait(3); };

function matte(render: () => Uint8Array, node: number, w: number, h: number) {
  ops.setProp(node, PROP.bgColor, 0xff000000);
  const black = render().slice();
  ops.setProp(node, PROP.bgColor, 0xffffffff);
  const white = render().slice();
  ops.setProp(node, PROP.bgColor, 0);
  const pixels = new Uint8ClampedArray(black.length);
  for (let i = 0; i < black.length; i += 4) {
    const alpha = 255 - (white[i + 1]! - black[i + 1]!);
    pixels[i + 3] = alpha;
    for (let c = 0; c < 3; c++) pixels[i + c] = alpha ? Math.min(255, (black[i + c]! * 255) / alpha) : 0;
  }
  const canvas = createCanvas(w, h);
  canvas.getContext("2d").putImageData(new ImageData(pixels, w, h), 0, 0);
  return canvas;
}

async function shot(name: string): Promise<void> {
  const canvas = createCanvas(400, 480);
  const g = canvas.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 400, 480);
  if (backdrop && existsSync(backdrop)) g.drawImage(await loadImage(backdrop), 0, 0, 400, 240, 0, 0, 400, 240);
  g.drawImage(matte(() => wasm.render(), 1, 400, 240), 0, 0);
  g.fillStyle = "#f8f1dc";
  g.fillRect(40, 240, 320, 240);
  g.drawImage(matte(() => wasm.renderAuxiliary(), ops.__auxiliarySurface.root, 320, 240), 40, 240);
  writeFileSync(join(out, `${name}.png`), canvas.toBuffer("image/png"));
}

// The phone outdoors: its home screen's apps along a row (Map, Clock, Home, Settings, Help).
const app = (i: number): [number, number] => [Math.round(28 + 4 + 51.2 * i + 25.6), 150];
const debug = globals.__islandDebug as { O: { map: { spawn: { x: number; z: number } } } };
wait(10);
await shot("island");
tap(...app(0));
wait(5);
await shot("phone-map");
// A tap on the map walks there: dots march to a ring where the walk ends.
const spawn = debug.O.map.spawn;
tap(28 + 24 + Math.round((spawn.x + 9) * 3), 10 + 25 + Math.round((spawn.z - 6) * 3));
wait(40);
await shot("phone-route");
tap(47, 42);
wait(5);
tap(...app(1));
wait(5);
await shot("phone-clock");
tap(47, 42);
wait(5);
// Home: the app walks to the door and goes in.
tap(...app(2));
wait(420);
await shot("room");
// Inside, the toolbar's last key brings the phone out; B puts it away from its home screen.
tap(296, 222);
wait(5);
await shot("room-phone");
press("B");
tap(160, 120);
await shot("selected");
press("START");
wait(5);
await shot("menu");
press("B");
tap(20, 222);
wait(5);
await shot("catalog");
tap(56, 72);
wait(5);
await shot("catalog-picked");
press("R");
press("R");
press("R");
press("R");
press("R");
wait(5);
await shot("catalog-wallpaper");
press("B");
tap(60, 222);
wait(5);
await shot("storage");
press("B");
tap(100, 222);
wait(5);
await shot("sets");
press("B");
press("START");
for (let i = 0; i < 5; i++) press("DOWN");
wait(20);
await shot("menu-settings");
for (let i = 0; i < 4; i++) press("DOWN");
wait(20);
await shot("menu-time");
press("DOWN");
press("A");
wait(5);
await shot("help");
console.log(`preview: ${out}`);
