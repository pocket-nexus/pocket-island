#!/usr/bin/env bun
// Pocket Island on the Nintendo 3DS: PocketJS's 3DS product with this
// repository's renderer linked in as its product extension
// (programs/3ds-island), the interface (apps/island-3ds) as its guest, and
// the pack (tools/cook.ts) and each language's glyphs in romfs:/extension.
//
//   bun tools/n3ds.ts build [--export]       → .pocket-build/3ds/dist/pocket-island.3dsx (and .pocket)
//   bun tools/n3ds.ts install [--no-build]   build, send it over the paired wire, start it
//   bun tools/n3ds.ts push                   the interface alone (.pocket), into the running program
//   bun tools/n3ds.ts capture [--out f.png]  both screens from the console
//   bun tools/n3ds.ts ui                     the interface's bundle alone
//   bun tools/n3ds.ts eval "CODE"            run JavaScript in the interface on the console, print the value
//   bun tools/n3ds.ts stats                  the runtime's frame timings and the renderer's numbers
//   bun tools/n3ds.ts perf                   the frame's time at the island's busiest places, by night and by
//                                            day; fails when one is over its budget (a regression check)
//   bun tools/n3ds.ts input "STEPS"          the stylus and the buttons, scripted: tap:X,Y  drag:X0,Y0,X1,Y1
//                                            press:A (A B X Y L R ZL ZR START SELECT UP DOWN LEFT RIGHT,
//                                            joined with +)  hold:A,FRAMES  wait:FRAMES, separated by ";"
//
// `--host ADDRESS` (or POCKET_3DS_HOST) names the console when broadcast
// discovery does not reach it. The console must run a PocketJS program with
// the development connection (this one once installed, or another), paired
// once through ftpd: `bun vendor/pocketjs/tools/3ds-dev.ts pair --host ADDRESS`.
import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readPocketManifest } from "../vendor/pocketjs/framework/src/manifest/load.ts";
import { resolve3dsBuildPlan } from "../vendor/pocketjs/tools/3ds-profile.ts";
import { build3ds } from "./core.ts";
import { bakeLanguages, FONT_FACES, prepareFonts } from "./fonts.ts";

const root = resolve(import.meta.dir, "..");
const pocketjs = join(root, "vendor/pocketjs");
const argv = process.argv.slice(2);
const command = argv[0] ?? "";
const opt = (key: string, fallback: string) => {
  const at = argv.indexOf(key);
  return at < 0 ? fallback : (argv[at + 1] ?? fallback);
};
const host = opt("--host", process.env.POCKET_3DS_HOST ?? "");
const hostArgs = host ? ["--host", host] : [];

const BUILD = join(root, ".pocket-build/3ds");
const GUEST = join(BUILD, "guest");
const DIST = join(BUILD, "dist");
const ROMFS = join(BUILD, "romfs");
const APP = join(root, "apps/island-3ds");
const NAME = "pocket-island";

/** The resolved plan the bundle and the product are both built from. */
function plan(): string {
  const path = join(BUILD, "plan.json");
  mkdirSync(BUILD, { recursive: true });
  const resolved = resolve3dsBuildPlan(readPocketManifest(join(APP, "pocket.app.json")).manifest);
  writeFileSync(path, JSON.stringify(resolved, null, 2) + "\n");
  return path;
}

/** The interface's bundle and pak, in Baloo 2 like the browser's interface. */
async function buildInterface(planPath: string): Promise<void> {
  await prepareFonts();
  mkdirSync(GUEST, { recursive: true });
  await $`bun tools/build.ts --plan=${planPath} --project-root=${root} --outdir=${GUEST}/ --font-regular=${FONT_FACES.latin.regular} --font-bold=${FONT_FACES.latin.bold} --strict-classes`.cwd(pocketjs);
}

async function build(): Promise<void> {
  await build3ds();
  if (argv.includes("--export") || !existsSync(join(root, ".pocket-build/ir/summary.json"))) await $`bun ${join(root, "tools/export.ts")}`;
  await $`bun ${join(root, "tools/cook.ts")}`;
  // The sounds and the music, made by the browser's scripts (src/audio), beside the pack.
  await $`bun ${join(root, "tools/sound.ts")}`;
  const planPath = plan();
  await buildInterface(planPath);
  // The product stages the files at the top of the directory: the fonts stand beside the pack.
  await bakeLanguages(join(GUEST, `${NAME}.styles.ts`), ROMFS);
  await $`bun tools/3ds.ts --plan=${planPath} --project-root=${root} --outdir=${GUEST}/ --package-outdir=${DIST} --extension=${join(root, "programs/3ds-island")} --extension-romfs=${ROMFS} --skip-build`.cwd(pocketjs);
  const bytes = readFileSync(join(DIST, `${NAME}.3dsx`)).length;
  if (bytes > 32 * 1024 * 1024) throw new Error(`the .3dsx is ${bytes} bytes; the wire installs at most 32 MiB`);
  console.log(`3ds: ${join(DIST, `${NAME}.3dsx`)} ${(bytes / 1e6).toFixed(1)} MB`);
}

/** One authenticated connection to the console's development wire, by the pairing key in vendor/pocketjs/.pocket. */
async function connect(): Promise<any> {
  // Right after another client leaves, the first connection can time out.
  let last: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await connectOnce();
    } catch (e) {
      last = e;
      await Bun.sleep(1500);
    }
  }
  throw last;
}

async function connectOnce(): Promise<any> {
  const { discoverPocketRuntimes, parsePocketRuntimeToken, PocketRuntimeClient } = await import(join(pocketjs, "tools/3ds-runtime-client.ts"));
  const { pocketRuntimeDeviceId } = await import(join(pocketjs, "contracts/spec/pocket-runtime-wire.ts"));
  const devices: any[] = await discoverPocketRuntimes(host ? { addresses: [host] } : {});
  const keys = join(pocketjs, ".pocket/3ds/devices");
  for (const device of devices) {
    for (const name of existsSync(keys) ? readdirSync(keys).filter((n) => n.endsWith(".key")) : []) {
      const token = parsePocketRuntimeToken(readFileSync(join(keys, name), "utf8"));
      if (pocketRuntimeDeviceId(token) !== device.deviceId) continue;
      const client = new PocketRuntimeClient({ host: device.address, port: device.port, token, timeoutMs: 20000, heartbeatTimeoutMs: 30000 });
      try {
        await client.connect();
      } catch (e) {
        client.close();
        throw e;
      }
      return client;
    }
  }
  throw new Error(`no paired console answered${host ? ` at ${host}` : ""}`);
}

async function evaluate(code: string): Promise<unknown> {
  const client = await connect();
  try {
    const id = `island-${Date.now()}`;
    const reply = client.waitForCtrl((m: any) => m.t === "evalResult" && m.id === id, 20000);
    await client.sendCtrl({ t: "eval", id, code });
    const result: any = await reply;
    return result.error ?? result.value;
  } finally {
    client.close();
  }
}

const BUTTONS: Record<string, number> = {
  A: 0x2000, B: 0x4000, X: 0x1000, Y: 0x8000, L: 0x100, R: 0x200, ZL: 0x400, ZR: 0x800,
  START: 0x8, SELECT: 0x1, UP: 0x10, RIGHT: 0x20, DOWN: 0x40, LEFT: 0x80,
};

/**
 * Frames of input from a script. A frame is { b: buttons, t: [x, y] on the touch screen, or null }.
 * The console runs them one a frame: `globalThis.frame`, which the runtime looks up every frame, is
 * wrapped so each takes the next one (the hit under the stylus resolved as the host would).
 */
function frames(script: string): { b: number; t: [number, number] | null }[] {
  const out: { b: number; t: [number, number] | null }[] = [];
  const mask = (names: string) => names.split("+").reduce((m, n) => m | (BUTTONS[n.trim().toUpperCase()] ?? 0), 0);
  for (const step of script.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [kind, rest = ""] = step.split(":");
    const n = rest.split(",").map(Number);
    if (kind === "tap") {
      for (let i = 0; i < 3; i++) out.push({ b: 0, t: [n[0]!, n[1]!] });
      for (let i = 0; i < 3; i++) out.push({ b: 0, t: null });
    } else if (kind === "drag") {
      const [x0, y0, x1, y1] = n as [number, number, number, number];
      for (let i = 0; i < 3; i++) out.push({ b: 0, t: [x0, y0] });
      for (let i = 1; i <= 20; i++) out.push({ b: 0, t: [Math.round(x0 + ((x1 - x0) * i) / 20), Math.round(y0 + ((y1 - y0) * i) / 20)] });
      for (let i = 0; i < 4; i++) out.push({ b: 0, t: [x1, y1] });
      for (let i = 0; i < 3; i++) out.push({ b: 0, t: null });
    } else if (kind === "press") {
      for (let i = 0; i < 3; i++) out.push({ b: mask(rest), t: null });
      for (let i = 0; i < 3; i++) out.push({ b: 0, t: null });
    } else if (kind === "hold") {
      const [names, count] = rest.split(",");
      for (let i = 0; i < Number(count ?? 30); i++) out.push({ b: mask(names!), t: null });
      out.push({ b: 0, t: null });
    } else if (kind === "wait") {
      for (let i = 0; i < (n[0] ?? 30); i++) out.push({ b: 0, t: null });
    } else throw new Error(`input: unknown step ${step}`);
  }
  return out;
}

const INJECTOR = `(() => {
  if (!globalThis.__islandInput) {
    const queue = [];
    const real = globalThis.frame;
    globalThis.__islandInput = queue;
    globalThis.frame = function (buttons, analog, touches, hits, surfaces, ...rest) {
      const step = queue.shift();
      if (step) {
        buttons = (buttons | step.b) >>> 0;
        if (step.t) {
          const [x, y] = step.t;
          touches = [((1 << 18) | ((y & 511) << 9) | (x & 511)) >>> 0];
          hits = [globalThis.ui.hitTestBoundsAuxiliary ? globalThis.ui.hitTestBoundsAuxiliary(x, y) : 0];
          surfaces = [1];
        }
      }
      return real.call(this, buttons, analog, touches, hits, surfaces, ...rest);
    };
  }
  return "ready";
})()`;

const dev = (args: string[]) => $`bun tools/3ds-dev.ts ${args} ${hostArgs}`.cwd(pocketjs);

switch (command) {
  case "build":
    await build();
    break;
  case "ui":
    await buildInterface(plan());
    break;
  case "install":
    if (!argv.includes("--no-build")) await build();
    await dev(["install", "--file", join(DIST, `${NAME}.3dsx`), "--name", `${NAME}.3dsx`]);
    break;
  case "push": {
    const planPath = plan();
    await buildInterface(planPath);
    await $`bun tools/3ds.ts --plan=${planPath} --project-root=${root} --outdir=${GUEST}/ --package-outdir=${DIST} --skip-build --pocket-only`.cwd(pocketjs);
    await dev(["push", "--package", join(DIST, `${NAME}.pocket`)]);
    break;
  }
  case "input": {
    const steps = frames(argv[1] ?? "");
    console.log(await evaluate(`${INJECTOR}; globalThis.__islandInput.push(...${JSON.stringify(steps)}); globalThis.__islandInput.length`));
    // Each frame is a sixtieth of a second; the console runs the queue before this returns.
    await Bun.sleep(Math.ceil((steps.length / 60) * 1000) + 600);
    break;
  }
  case "eval":
    console.log(await evaluate(argv[1] ?? "1"));
    break;
  case "perf": {
    // Where the island is heaviest to draw (by the house, among its lamps, trees and flowers; the stall;
    // a bridge), at 23:00 with the lamps lit and at noon (the hour's music changing between). A place's
    // frame must keep to the screen's sixtieth of a second: its tick (the scripts and the wait for the
    // GPU) under BUDGET_MS, and its frames on average under FRAME_MS (a stutter, as a write to the card
    // or a piece's loading was, shows there). The player and the clock are put back as they were.
    const BUDGET_MS = 16.2, FRAME_MS = 18.5;
    const SPOTS: [string, number, number, number][] = [
      ["the door", 35, 45.3, 0], ["by the house", 38.6, 44.95, -0.53], ["behind the house's front", 35, 43, Math.PI],
      ["the house's west", 31, 46, 0], ["the stall", 40, 49.4, Math.PI], ["over the east bridge", 49, 42.5, 0],
    ];
    const was = String(await evaluate(`(()=>{islandCore.pi_game_state();const g=islandCore.out;return [g[1],g[3],g[4]].join(",")})()`)).split(",").map(Number);
    const client = await connect();
    const dev = async () => {
      const reply = client.waitForCtrl((m: any) => m.t === "devStats", 20000);
      await client.sendCtrl({ t: "devStats" });
      return ((await reply) as any).data.timingUs as Record<string, [number, number]>;
    };
    const ask = async (code: string) => {
      const id = `perf-${Date.now()}-${Math.random()}`;
      const reply = client.waitForCtrl((m: any) => m.t === "evalResult" && m.id === id, 20000);
      await client.sendCtrl({ t: "eval", id, code });
      return ((await reply) as any).value;
    };
    let over = 0;
    try {
      for (const hour of [23, 12]) {
        await ask(`__islandDebug.E.clockAt(${hour}), "ok"`);
        for (const [name, x, z, yaw] of SPOTS) {
          await ask(`islandCore.pi_game_restore(${x}, ${z}, ${yaw}, false, 0, 0, 0), "ok"`);
          // The view settles, the things there are drawn and lit, and the frames are counted afresh.
          await Bun.sleep(2500);
          await dev();
          await Bun.sleep(1500);
          const t = await dev();
          const seen = String(await ask(`(()=>{const s=island.stats();return [s.triangles,s.draws,s.lamps].join(" ")})()`)).split(" ");
          const tick = t.js![0] / 1000, frame = t.frame![0] / 1000, ok = tick <= BUDGET_MS && frame <= FRAME_MS;
          if (!ok) over++;
          console.log(`${ok ? "ok  " : "OVER"} ${String(hour).padStart(2, "0")}:00 ${name.padEnd(26)} tick ${tick.toFixed(1)} ms (most ${(t.js![1] / 1000).toFixed(1)}), frame ${frame.toFixed(1)} ms, ${seen[0]} triangles, ${seen[1]} draws, ${seen[2]} lamps`);
        }
      }
    } finally {
      await ask(`islandCore.pi_game_restore(${was[0]}, ${was[1]}, ${was[2]}, false, 0, 0, 0), __islandDebug.E.clockNow(), "ok"`).catch(() => {});
      client.close();
    }
    console.log(over ? `perf: ${over} over ${BUDGET_MS} ms a tick or ${FRAME_MS} ms a frame` : `perf: every place within ${BUDGET_MS} ms a tick and ${FRAME_MS} ms a frame`);
    if (over) process.exit(1);
    break;
  }
  case "stats": {
    const client = await connect();
    try {
      const reply = client.waitForCtrl((m: any) => m.t === "devStats", 20000);
      await client.sendCtrl({ t: "devStats" });
      const { t: _t, ...stats } = (await reply) as Record<string, unknown>;
      console.log(JSON.stringify(stats));
    } finally {
      client.close();
    }
    console.log(await evaluate("JSON.stringify(island.stats())"));
    break;
  }
  case "capture": {
    const out = resolve(opt("--out", join(root, `.pocket-build/validation/3ds/capture-${Date.now()}.png`)));
    mkdirSync(resolve(out, ".."), { recursive: true });
    await dev(["probe", "--out", out]);
    console.log(out);
    break;
  }
  default:
    console.log("usage: bun tools/n3ds.ts <build|install|push|capture|ui|eval|stats|perf|input> [--host ADDRESS]");
    process.exit(command ? 1 : 0);
}
