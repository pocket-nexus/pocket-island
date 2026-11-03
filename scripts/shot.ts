// bun scripts/shot.ts [url] [--size 1600x1000] [--scale 1] [--do "<steps>"]
//
// Steps are separated by ";;": "wait:<ms>", "shot:<file>", "ready",
// "move:x,y", "down:x,y", "up", "click:x,y", "rclick:x,y", "drag:x0,y0,x1,y1", "rdrag:x0,y0,x1,y1",
// "wheel:x,y,dy", "key:<code>" ("key:KeyZ+meta" for modifiers);
// anything else is evaluated in the page and its value printed.
import { resolve } from "node:path";
import { openPage } from "./chrome.ts";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1]! : fallback; };
const url = argv[0] && !argv[0].startsWith("--") ? argv[0] : "http://127.0.0.1:5317/?fresh";
const [width, height] = flag("--size", "1600x1000").split("x").map(Number) as [number, number];
const scale = Number(flag("--scale", "1"));
const steps = flag("--do", "ready;;wait:2500;;shot:.shots/shot.png").split(";;").map((s) => s.trim()).filter(Boolean);
const MODS: Record<string, number> = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

const page = await openPage(url, width, height, scale);
let held = false;
let last: [number, number] = [0, 0];
try {
  const results: unknown[] = [];
  for (const step of steps) {
    const [kind, arg = ""] = step.split(/:(.*)/s) as [string, string?];
    const nums = () => arg.split(",").map(Number);
    if (kind === "wait") await Bun.sleep(Number(arg));
    else if (step === "ready") await page.ready();
    else if (kind === "move") {
      // While a button is held, glide there in steps so the page sees a drag.
      const [x, y] = nums();
      if (held) {
        for (let i = 1; i <= 10; i++) { await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: last[0] + ((x! - last[0]) * i) / 10, y: last[1] + ((y! - last[1]) * i) / 10, button: "left", buttons: 1 }); await Bun.sleep(16); }
      } else await page.mouse("mouseMoved", x!, y!);
      last = [x!, y!];
    } else if (kind === "down") { const [x, y] = nums(); await page.mouse("mouseMoved", x!, y!); await page.mouse("mousePressed", x!, y!); held = true; last = [x!, y!]; }
    else if (kind === "up") { await page.mouse("mouseReleased", last[0], last[1]); held = false; }
    else if (kind === "click" || kind === "rclick") {
      const [x, y] = nums(); const b = kind === "click" ? "left" : "right";
      await page.mouse("mouseMoved", x!, y!); await page.mouse("mousePressed", x!, y!, b); await Bun.sleep(50); await page.mouse("mouseReleased", x!, y!, b);
    } else if (kind === "drag" || kind === "rdrag") {
      const [x0, y0, x1, y1] = nums(); const b = kind === "drag" ? "left" : "right";
      await page.mouse("mouseMoved", x0!, y0!); await page.mouse("mousePressed", x0!, y0!, b);
      for (let i = 1; i <= 12; i++) { await page.mouse("mouseMoved", x0! + ((x1! - x0!) * i) / 12, y0! + ((y1! - y0!) * i) / 12, b); await Bun.sleep(16); }
      await Bun.sleep(80); await page.mouse("mouseReleased", x1!, y1!, b);
    } else if (kind === "wheel") { const [x, y, dy] = nums(); await page.wheel(x!, y!, dy!); }
    else if (kind === "key") { const [code, ...mods] = arg.split("+"); await page.key(code!, mods.reduce((m, k) => m | (MODS[k] ?? 0), 0)); }
    else if (kind === "shot") { await page.screenshot(arg); results.push({ shot: resolve(arg) }); }
    else results.push(await page.evaluate(step));
  }
  console.log(JSON.stringify({ url, results, problems: page.problems }, null, 1));
} finally {
  await page.close();
}
process.exit(0);
