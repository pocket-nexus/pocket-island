// The app icon is Pocket3D's. This repository holds no icon file, and the
// 3DS build gives smdhtool the two files PocketJS publishes.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { strict as assert } from "node:assert";
import { POCKET3D_ICON } from "../vendor/pocketjs/tools/pocket3d-icon.ts";
const root = resolve(import.meta.dir, "..");
const tracked = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
assert.equal(tracked.exitCode, 0, "git ls-files failed");
const own = tracked.stdout.toString().split("\0").filter((path) => path && !path.startsWith("vendor/"));
const iconDirs = new Set(["assets", "3ds", "n3ds"]);
const strays = own.filter((path) => {
  const parts = path.toLowerCase().split("/");
  const name = parts.pop()!;
  return /^icon.*\.png$/.test(name) && parts.some((part) => iconDirs.has(part));
});
assert.deepEqual(strays, [], "the icon comes from vendor/pocketjs/engine/pocket3d/icon; delete these files");
const makefile = readFileSync(`${root}/3ds/Makefile`, "utf8");
const sizes = [[POCKET3D_ICON.n3ds, "ICON", 48], [POCKET3D_ICON.n3dsSmall, "SMALL_ICON", 24]] as const;
for (const [file, variable, side] of sizes) {
  const path = relative(root, file);
  assert(path.startsWith("vendor/pocketjs/engine/pocket3d/icon/"), `${path} is outside the Pocket3D icon directory`);
  assert(makefile.includes(`${variable} := /repo/${path}\n`), `3ds/Makefile must set ${variable} to /repo/${path}`);
  const png = readFileSync(file);
  assert.equal(png.toString("latin1", 12, 16), "IHDR", `${path} is not a PNG`);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [side, side], `${path} must be ${side} x ${side}`);
}
// With one icon smdhtool halves the large one; the recipe passes both.
const recipe = makefile.split("\n").find((line) => line.includes("smdhtool --create"));
assert(recipe?.trimEnd().endsWith("$(ICON) $@ $(SMALL_ICON)"), "the smdhtool recipe must pass $(ICON) and $(SMALL_ICON)");
console.log("PASS: no icon file of Island's own; smdhtool reads the 48 x 48 and 24 x 24 Pocket3D icons");
