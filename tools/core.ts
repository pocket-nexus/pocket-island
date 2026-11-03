#!/usr/bin/env bun
// Builds the island's core (crates/island-core):
//
//   bun tools/core.ts            the browser's module → src/core/pocket_island_core.wasm
//   bun tools/core.ts --3ds      the console's archive → programs/3ds-island/lib/libpocket_island_core.a
//
// The console's archive is built with PocketJS's pinned nightly (build-std, armv6k-nintendo-3ds),
// and its symbols are made weak: the program it is linked into has its own Rust runtime (PocketJS's
// core archive), whose panic handler and runtime symbols then win, while the island's functions,
// defined only here, still link.
import { $ } from "bun";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const WASM_OUT = join(root, "src/core/pocket_island_core.wasm");

export async function buildWasm(): Promise<string> {
  await $`cargo rustc --release --target wasm32-unknown-unknown --lib --crate-type cdylib -p pocket-island-core -q`.cwd(root);
  const built = join(root, "target/wasm32-unknown-unknown/release/pocket_island_core.wasm");
  copyFileSync(built, WASM_OUT);
  return WASM_OUT;
}

export async function build3ds(): Promise<string> {
  // The interface's bindings of it, written from its C interface.
  const { writeBindings } = await import("./bindings.ts");
  writeBindings();
  const { THREE_DS_CONTAINER_IMAGE } = await import("../vendor/pocketjs/tools/build/toolchains/3ds.ts");
  const { RUST_TOOLCHAINS } = await import("../vendor/pocketjs/tools/build/toolchains/rust.ts");
  const toolchain = RUST_TOOLCHAINS.threeDs;
  const target = join(root, "target");
  await $`rustup run ${toolchain} cargo rustc --release -p pocket-island-core --lib --crate-type staticlib --target armv6k-nintendo-3ds -Zbuild-std=core,compiler_builtins -Zbuild-std-features=compiler-builtins-mem -q`
    .cwd(root).env({ ...process.env, CARGO_TARGET_DIR: target, CARGO_PROFILE_RELEASE_PANIC: "abort" });
  const built = join(target, "armv6k-nintendo-3ds/release/libpocket_island_core.a");
  const outDir = join(root, "programs/3ds-island/lib");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "libpocket_island_core.a");
  copyFileSync(built, out);
  // Weak symbols: the program's own Rust runtime wins wherever both define one.
  await $`docker run --rm --network=none -v ${outDir}:/core ${THREE_DS_CONTAINER_IMAGE} bash -c ${"/opt/devkitpro/devkitARM/bin/arm-none-eabi-objcopy --weaken /core/libpocket_island_core.a"}`.quiet();
  return out;
}

if (import.meta.main) {
  const started = Date.now();
  const out = process.argv.includes("--3ds") ? await build3ds() : await buildWasm();
  console.log(`core: ${out} ${(statSync(out).size / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

/** The browser's module, built if it is missing. */
export async function ensureWasm(): Promise<void> {
  if (!existsSync(WASM_OUT)) await buildWasm();
}
