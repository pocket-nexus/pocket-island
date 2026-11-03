// Headless Chrome over the DevTools Protocol, for looking at the room the
// way a visitor does (after Pocket Studio's scripts/chrome.ts). Chrome runs
// with the GPU through ANGLE on Metal, so the picture is the real one.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

export interface Page {
  problems: string[];
  send(method: string, params?: object): Promise<any>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  ready(timeoutMs?: number): Promise<void>;
  mouse(type: "mouseMoved" | "mousePressed" | "mouseReleased", x: number, y: number, button?: "left" | "right", modifiers?: number): Promise<void>;
  wheel(x: number, y: number, deltaY: number): Promise<void>;
  key(code: string, modifiers?: number): Promise<void>;
  screenshot(path: string): Promise<void>;
  close(): Promise<void>;
}

export async function openPage(url: string, width: number, height: number, scale = 1): Promise<Page> {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "acnh-room-chrome-"));
  const gpu = process.env.SWIFTSHADER ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
  const chrome: ChildProcess = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", ...gpu,
    `--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`, "about:blank",
  ], { detached: true, stdio: "ignore" });
  const pid = chrome.pid!;
  const kill = () => { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } } };
  process.on("exit", () => { kill(); rmSync(profile, { recursive: true, force: true }); });
  chrome.unref();

  let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = [];
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch { /* not up yet */ }
    await Bun.sleep(100);
  }
  const target = targets.find((t) => t.type === "page");
  if (!target) throw new Error("Chrome did not open a page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((done, fail) => { ws.onopen = () => done(); ws.onerror = () => fail(new Error("no DevTools socket")); });
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const problems: string[] = [];
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data as string);
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result ?? m.error); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    else if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) problems.push(m.params.type + ": " + m.params.args.map((a: any) => a.value ?? a.description ?? "").join(" "));
    else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") problems.push("log: " + m.params.entry.text);
  };
  const send = (method: string, params: object = {}) => new Promise<any>((done) => { pending.set(++id, done); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value as T;
  };
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  await send("Page.navigate", { url });
  return {
    problems, send, evaluate,
    async ready(timeoutMs = 60_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const state = await evaluate<string>("document.documentElement.dataset.ready || ''").catch(() => "");
        if (state === "true") return;
        if (Date.now() > deadline) throw new Error("page never became ready");
        await Bun.sleep(200);
      }
    },
    async mouse(type, x, y, button = "left", modifiers = 0) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : button, buttons: type === "mouseReleased" ? 0 : type === "mousePressed" ? (button === "left" ? 1 : 2) : 0, clickCount: 1, modifiers });
    },
    async wheel(x, y, deltaY) {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY });
    },
    async key(code, modifiers = 0) {
      const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
      await send("Input.dispatchKeyEvent", { type: "keyDown", code, key, modifiers, windowsVirtualKeyCode: code.startsWith("Key") ? code.charCodeAt(3) : code === "Escape" ? 27 : code === "Delete" ? 46 : 0 });
      await Bun.sleep(40);
      await send("Input.dispatchKeyEvent", { type: "keyUp", code, key, modifiers });
    },
    async screenshot(path) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      await Bun.write(resolve(path), Buffer.from(shot.data, "base64"));
    },
    async close() { ws.close(); kill(); rmSync(profile, { recursive: true, force: true }); },
  };
}
