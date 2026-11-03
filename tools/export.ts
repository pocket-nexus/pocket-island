#!/usr/bin/env bun
// Runs the export page (export.html, src/export/export.ts) in headless
// Chrome and writes what it hands over to .pocket-build/ir: the catalogue,
// every model's parts, the textures and pictures. tools/cook.ts lowers that
// for the 3DS.
//
//   bun tools/export.ts [--out .pocket-build/ir]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import { freePort, openPage } from "../scripts/chrome.ts";

const root = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);
const at = argv.indexOf("--out");
const out = resolve(at >= 0 ? argv[at + 1]! : join(root, ".pocket-build/ir"));

export async function exportCatalogue(directory = out): Promise<void> {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const started = Date.now();
  let written = 0, bytes = 0;
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "*" };
  const sink = Bun.serve({
    port: await freePort(),
    hostname: "127.0.0.1",
    async fetch(request) {
      if (request.method === "OPTIONS") return new Response(null, { headers: cors });
      const url = new URL(request.url);
      const path = url.searchParams.get("path") ?? "";
      if (url.pathname !== "/put" || !path || path.includes("..")) return new Response("no", { status: 400, headers: cors });
      const data = new Uint8Array(await request.arrayBuffer());
      const target = join(directory, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      written++;
      bytes += data.length;
      return new Response("ok", { headers: cors });
    },
  });
  const vite = await createServer({ root, logLevel: "error", server: { port: await freePort(), strictPort: true, host: "127.0.0.1" } });
  await vite.listen();
  const port = vite.config.server.port;
  const page = await openPage(`http://127.0.0.1:${port}/export.html?sink=http://127.0.0.1:${sink.port}`, 400, 400);
  try {
    let last = "";
    for (;;) {
      const state = (await page.evaluate<string | undefined>("window.__export")) ?? "";
      if (state !== last) {
        console.log(`export: ${state || "loading"}`);
        last = state;
      }
      if (state === "done") break;
      if (state.startsWith("error")) throw new Error(state);
      if (Date.now() - started > 10 * 60_000) throw new Error("export: timed out");
      await Bun.sleep(250);
    }
    const problems = page.problems.filter((p) => !p.includes("GPU stall"));
    if (problems.length) console.log(problems.slice(0, 10).join("\n"));
    const summary = await Bun.file(join(directory, "summary.json")).json();
    console.log(`export: ${written} files, ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s → ${directory}`);
    console.log(`export: ${JSON.stringify(summary)}`);
  } finally {
    await page.close();
    sink.stop(true);
    // Closing the server can wait on its watcher for good; the process exits after the export anyway.
    void vite.close();
  }
}

if (import.meta.main) {
  // Vite keeps a watcher open after close: the process ends here, written or not.
  try {
    await exportCatalogue();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
