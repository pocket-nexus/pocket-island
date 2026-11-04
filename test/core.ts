// Loads the island's core for the tests: the module tools/core.ts builds (`bun run check` builds it
// first). A module older than the crate's sources is refused rather than tested.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadCoreSync } from "../src/core/wasm.ts";

const path = join(import.meta.dir, "../src/core/pocket_island_core.wasm");
const crate = join(import.meta.dir, "../crates/island-core/src");
if (!existsSync(path)) throw new Error("the island's core is not built: run `bun tools/core.ts`");
const built = statSync(path).mtimeMs;
const newer = readdirSync(crate).filter((f) => statSync(join(crate, f)).mtimeMs > built);
if (newer.length) throw new Error(`the island's core is older than ${newer.join(", ")}: run \`bun tools/core.ts\``);
loadCoreSync(readFileSync(path));
