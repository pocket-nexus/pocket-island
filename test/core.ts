// Loads the island's core for the tests: the module tools/core.ts builds.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCoreSync } from "../src/core/wasm.ts";

const path = join(import.meta.dir, "../src/core/pocket_island_core.wasm");
if (!existsSync(path)) throw new Error("the island's core is not built: run `bun tools/core.ts`");
loadCoreSync(readFileSync(path));
