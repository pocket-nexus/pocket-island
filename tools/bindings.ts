// The console's bindings of the island's core, written from its C interface
// (crates/island-core/src/ffi.rs): the prototypes in programs/3ds-island/src/core.h (between its
// markers; the constants after them are kept by hand) and every wrapper of
// programs/3ds-island/src/core_js.c, which gives the interface's QuickJS `globalThis.islandCore`, the
// same functions the browser gets from the WebAssembly module (src/core/wasm.ts). The core's buffers
// are typed arrays over its memory, not copies.
//
//   bun tools/bindings.ts            (tools/core.ts runs it before building the console's archive)

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const FFI = join(root, "crates/island-core/src/ffi.rs");
const HEADER = join(root, "programs/3ds-island/src/core.h");
const JS = join(root, "programs/3ds-island/src/core_js.c");

/** The buffers the scripts see as typed arrays: the function that gives one, its length, and its type. */
const BUFFERS: Record<string, { name: string; length: string; type: "FLOAT64" | "FLOAT32" }> = {
  pi_out: { name: "out", length: "32", type: "FLOAT64" },
  pi_path: { name: "path", length: "512", type: "FLOAT64" },
  pi_things_data: { name: "data", length: "pi_things_data_len()", type: "FLOAT32" },
  pi_things_view_data: { name: "view", length: "pi_things_view_len()", type: "FLOAT32" },
  pi_route_data: { name: "dots", length: "pi_route_data_len()", type: "FLOAT64" },
};

type RustType = "f64" | "f32" | "u32" | "i32" | "bool" | "()" | "*mut f64" | "*const f64" | "*mut u8" | "*mut f32";
interface Fn { name: string; params: { name: string; type: RustType }[]; ret: RustType }

const C_TYPE: Record<RustType, string> = {
  f64: "double", f32: "float", u32: "uint32_t", i32: "int32_t", bool: "bool", "()": "void",
  "*mut f64": "double *", "*const f64": "const double *", "*mut u8": "uint8_t *", "*mut f32": "float *",
};

export function functions(source = readFileSync(FFI, "utf8")): Fn[] {
  const out: Fn[] = [];
  const re = /#\[no_mangle\]\s*pub extern "C" fn (pi_\w+)\(([^)]*)\)(?:\s*->\s*([^{]+?))?\s*\{/g;
  for (const m of source.matchAll(re)) {
    const params = m[2]!.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
      const [name, type] = p.split(":").map((x) => x.trim());
      if (!(type! in C_TYPE)) throw new Error(`bindings: ${m[1]}: a parameter of type ${type}`);
      return { name: name!, type: type as RustType };
    });
    const ret = (m[3]?.trim() ?? "()") as RustType;
    if (!(ret in C_TYPE)) throw new Error(`bindings: ${m[1]} returns ${ret}`);
    out.push({ name: m[1]!, params, ret });
  }
  return out;
}

function prototype(f: Fn): string {
  const params = f.params.length ? f.params.map((p) => `${C_TYPE[p.type]} ${p.name}`).join(", ") : "void";
  const ret = C_TYPE[f.ret];
  return `${ret}${ret.endsWith("*") ? "" : " "}${f.name}(${params});`;
}

function argument(p: Fn["params"][number], i: number): string {
  const n = `num(ctx, argc, argv, ${i})`;
  switch (p.type) {
    case "bool": return `${n} != 0`;
    case "u32": return `(uint32_t)${n}`;
    case "i32": return `(int32_t)${n}`;
    case "f32": return `(float)${n}`;
    default: return n;
  }
}

function wrapper(f: Fn): string {
  const call = `${f.name}(${f.params.map(argument).join(", ")})`;
  const body = (() => {
    switch (f.ret) {
      case "bool": return `  return JS_NewInt32(ctx, ${call} ? 1 : 0);`;
      case "u32": return `  return JS_NewInt64(ctx, ${call});`;
      case "i32": return `  return JS_NewInt32(ctx, ${call});`;
      case "f64":
      case "f32": return `  return JS_NewFloat64(ctx, ${call});`;
      default: return `  ${call};\n  return JS_UNDEFINED;`;
    }
  })();
  return `static JSValue js_${f.name}(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {\n  (void)this_val;\n${f.params.length ? "" : "  (void)argc, (void)argv;\n"}${body}\n}\n`;
}

const BEGIN = "/* The core's functions: written by tools/bindings.ts from crates/island-core/src/ffi.rs. */";
const END = "/* End of the written functions; what follows is kept by hand, in step with the core. */";

/** The header and the wrappers as `ffi.rs` makes them, and the files they go in (test/core-mirror.test.ts compares them). */
export function renderBindings(): { header: string; js: string; headerPath: string; jsPath: string; functions: number } {
  const fns = functions();
  const kept = readFileSync(HEADER, "utf8");
  const a = kept.indexOf(BEGIN), b = kept.indexOf(END);
  if (a < 0 || b < a) throw new Error(`bindings: ${HEADER} has lost its markers`);
  const header = kept.slice(0, a) + BEGIN + "\n" + fns.map(prototype).join("\n") + "\n" + kept.slice(b);

  // Wrappers for everything but the buffers and the tiles, which the scripts see as typed arrays.
  const wrapped = fns.filter((f) => !BUFFERS[f.name] && f.name !== "pi_island_tiles" && !f.name.endsWith("_len"));
  const js = `/* \`globalThis.islandCore\`: the island's core (crates/island-core) for the interface's scripts, the
 * same functions the browser gets from the WebAssembly module (src/core/abi.ts). Results in the
 * core's own buffers are typed arrays over them, not copies. Written by tools/bindings.ts from
 * crates/island-core/src/ffi.rs: run it again rather than editing this. */
#include "core_js.h"

#include "core.h"

static double num(JSContext *ctx, int argc, JSValueConst *argv, int i) {
  double d = 0;
  if (i < argc && JS_ToFloat64(ctx, &d, argv[i]) < 0) return 0;
  return d;
}

${wrapped.map(wrapper).join("\n")}
static JSValue view(JSContext *ctx, void *at, uint32_t bytes, uint32_t count, JSTypedArrayEnum type) {
  JSValue buffer = JS_NewArrayBuffer(ctx, (uint8_t *)at, bytes, NULL, NULL, false);
  JSValue args[3] = {buffer, JS_NewInt32(ctx, 0), JS_NewInt32(ctx, (int32_t)count)};
  JSValue array = JS_NewTypedArray(ctx, 3, args, type);
  JS_FreeValue(ctx, buffer);
  return array;
}

static JSValue js_tiles(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  return view(ctx, pi_island_tiles((uint32_t)num(ctx, argc, argv, 0)), 128 * 128, 128 * 128, JS_TYPED_ARRAY_UINT8);
}

static const struct {
  const char *name;
  JSCFunction *fn;
  int length;
} FUNCTIONS[] = {
${wrapped.map((f) => `  {"${f.name}", js_${f.name}, ${f.params.length}},`).join("\n")}
};

void core_install(JSContext *ctx, JSValueConst global) {
  JSValue o = JS_NewObject(ctx);
  for (unsigned i = 0; i < sizeof FUNCTIONS / sizeof FUNCTIONS[0]; i++)
    JS_SetPropertyStr(ctx, o, FUNCTIONS[i].name, JS_NewCFunction(ctx, FUNCTIONS[i].fn, FUNCTIONS[i].name, FUNCTIONS[i].length));
  JS_SetPropertyStr(ctx, o, "tiles", JS_NewCFunction(ctx, js_tiles, "tiles", 1));
${Object.entries(BUFFERS).map(([fn, b]) => `  JS_SetPropertyStr(ctx, o, "${b.name}", view(ctx, ${fn}(), (uint32_t)(${b.length}) * ${b.type === "FLOAT64" ? 8 : 4}, (uint32_t)(${b.length}), JS_TYPED_ARRAY_${b.type}));`).join("\n")}
  JS_SetPropertyStr(ctx, global, "islandCore", o);
}
`;
  return { header, js, headerPath: HEADER, jsPath: JS, functions: wrapped.length };
}

export function writeBindings(): { functions: number } {
  const b = renderBindings();
  writeFileSync(b.headerPath, b.header);
  writeFileSync(b.jsPath, b.js);
  return { functions: b.functions };
}

if (import.meta.main) console.log(`bindings: ${writeBindings().functions} functions`);
