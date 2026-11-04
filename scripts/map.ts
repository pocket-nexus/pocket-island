// The island's map as a picture, for looking at what the recipe makes.
//
//   bun scripts/map.ts [--scale 8] [--out .shots/island-map.png]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createCanvas } from "../vendor/pocketjs/node_modules/@napi-rs/canvas";
import { makeIsland } from "../src/core/island.ts";
import { drawMap } from "../src/island/map.ts";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1]! : fallback; };
const scale = Number(flag("--scale", "8"));
const out = resolve(flag("--out", ".shots/island-map.png"));

const started = performance.now();
const m = makeIsland();
const made = performance.now() - started;
const canvas = createCanvas(m.w * scale, m.d * scale);
drawMap(canvas.getContext("2d") as unknown as CanvasRenderingContext2D, m, scale);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, canvas.toBuffer("image/png"));
const count = (kind: string) => m.props.filter((p) => p.kind === kind).length;
console.log(JSON.stringify({
  out, ms: Math.round(made), ramps: m.ramps.length, bridges: m.bridges.length,
  props: Object.fromEntries(["tree", "fruit", "cedar", "palm", "bush", "flower", "rock", "lamp", "mailbox", "shell"].map((k) => [k, count(k)])),
}));
