// The core as WebAssembly, for the browser and the tests: `bun tools/core.ts` builds
// crates/island-core for wasm32 into src/core/pocket_island_core.wasm. The module needs nothing
// from its host; its memory holds the core's fixed storage.

import { setCore, type CoreAbi } from "./abi.ts";

type Exports = Record<string, (...args: number[]) => number> & { memory: WebAssembly.Memory };

function wrap(instance: WebAssembly.Instance): CoreAbi {
  const e = instance.exports as unknown as Exports;
  const memory = e.memory;
  // The memory never grows (the core takes nothing from a heap), so the views stay valid.
  const out = new Float64Array(memory.buffer, e.pi_out!(), 32);
  const path = new Float64Array(memory.buffer, e.pi_path!(), 512);
  const data = new Float32Array(memory.buffer, e.pi_things_data!(), e.pi_things_data_len!());
  const view = new Float32Array(memory.buffer, e.pi_things_view_data!(), e.pi_things_view_len!());
  const abi = { out, path, data, view, tiles: (which: 0 | 1) => new Uint8Array(memory.buffer, e.pi_island_tiles!(which), 128 * 128) } as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(e)) if (name.startsWith("pi_") && typeof value === "function") abi[name] = value;
  return abi as unknown as CoreAbi;
}

/** Load the core from its module's bytes, at once (Bun, workers; a page's main thread must not). */
export function loadCoreSync(bytes: BufferSource): CoreAbi {
  const core = wrap(new WebAssembly.Instance(new WebAssembly.Module(bytes), {}));
  setCore(core);
  return core;
}

/** Load the core from its module's URL (a page). */
export async function loadCore(url: string | URL): Promise<CoreAbi> {
  const { instance } = await WebAssembly.instantiateStreaming(fetch(url), {});
  const core = wrap(instance);
  setCore(core);
  return core;
}
