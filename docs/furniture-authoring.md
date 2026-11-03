# Authoring furniture

Every item is a `FurnitureDef` (`src/furniture/types.ts`) in its series file
(`src/furniture/<series>.ts`, exported as an array that `catalog.ts` already
imports). Read `src/furniture/wooden.ts` and `src/furniture/basic.ts` first:
they are the reference for style, density and conventions.

## Units and frames

- One tile is one world unit; Y is up; the item's front faces +Z.
- **Floor / misc / rug items**: stand on y = 0, centred on their footprint.
  `size: [w, d]` in tiles (multiples of 0.5). Keep every part inside
  x ∈ [-w/2, w/2], z ∈ [-d/2, d/2] with ~0.03 to spare, so neighbours placed
  edge to edge never intersect.
- **Wall items**: `size: [w, h]`, the model centred on its wall rectangle with
  its back on z = 0, standing out toward +Z (depth ≤ 0.3). Keep inside
  [-w/2, w/2] × [-h/2, h/2]. `hang` is the default centre height (0..3, the
  wall is 3 tiles tall); choose it so (hang - h/2) is a multiple of 0.5.
- **Ceiling items**: hang from y = 0 downward (negative y); lowest point no
  lower than about -1.0 so they do not hide the room. Inside the footprint.
- `kind`: "floor" (housewares), "misc" (small, may stand on table tops),
  "wall", "ceiling", "rug".
- `surface: { rect: [x0, z0, x1, z1], y }` makes a top that misc items stand
  on: the rectangle in the item's own frame (usually the footprint) and `y`
  the exact height of the top of the model.

## Proportions (island style, chunky)

Chair seat ~0.45, table top 0.72–0.8, bed mattress top ~0.55, headboard ~1.1,
nightstand 0.7, wardrobe ≤ 2.1, floor lamp ~1.6, small misc things 0.1–0.6.

## Look

- Build only from the kit (`src/scene/kit.ts`: `rbox`, `soft`, `lathe`,
  `puck`, `tube`, `rod`, `extrude`, `roundedRectShape`, `archShape`,
  `leafGeometry`, `planarUV`, `part`, `group`, `corners`) and materials
  (`src/scene/materials.ts`: `paint`, `gloss`, `wood`, `fabric`, `plush`,
  `ceramic`, `plastic`, `metal`, `glass`, `leaf`, `rattan`, `printed`,
  `printedCloth`, `glow`, `screen`, `skyPane`) plus the shared parts in
  `src/furniture/common.ts` (`knob`, `handle`, `legs`, `blockLegs`, `drawer`,
  `cushion`, `rug`, `framed`, `pot`, `leaves`, `shade`, `bulb`, `book`).
  Pictures, prints and screens: `drawn(key, w, h, draw)` from
  `src/scene/textures.ts` (canvas drawing; give every texture a unique key).
- Round every edge (rbox radius ≥ 0.02). No razor-thin parts (< 0.02).
- Soft pastel island palette, warm whites, never pure black.
- 2–4 variants per item, each `{ name: "English colour name", swatch: "#hex" }`;
  `build(v)` must handle every index. Variant 0 is the default.
- Names in the def are English and short ("Wooden Bed", "Mint"). Add the
  Chinese and Japanese names to `src/i18n/catalog.zh.ts` and
  `src/i18n/catalog.ja.ts`: the item under its id, each new colour under its
  English name (colours many items share are already there). `bun run check`
  fails on any missing name, and on Chinese or Japanese text anywhere outside
  `src/i18n/`, including texture art (draw motifs rather than characters).
- Keep geometry moderate: lathe/soft 24–40 segments.

## Lights

A lamp declares `light: { at, color, intensity, distance, halo, startsOn }`
in its own frame and builds its shade/bulb with `M.glow(...)` (or `bulb()` /
`shade()` from common). Screens use `M.screen(texture)` and
`switchable: true`. Glowing materials are switched per item automatically.
Typical: table lamp intensity 2–2.5 distance 3; floor lamp 4 / 4.5; ceiling 5 / 5.5.

How a lamp looks is carried by its emissive surfaces, not by its light.
Lamp lights behave as soft balls about half a tile across, and the light one
lamp puts on any surface is capped, so a shade's inside is *not* lit hot by
the light sitting in it: give the lit inside its own `M.glow` (BackSide, about
2.5) and the cloth or paper outside a fainter one (0.5–0.8), as `shade()` and
`dome()` do. Any mesh whose material is emissive is a bloom source; nothing
else blooms, so a lamp against a wall never blows the wall out. Every lamp
must have at least one emissive part (`bun run e2e` checks).

## Checking your work

The dev server runs at http://127.0.0.1:5317 (do not start or stop it).

    bun scripts/shot.ts "http://127.0.0.1:5317/?showroom=<series>" --do "ready;;wait:2500;;shot:.shots/<you>-<name>.png"

sets out every item of a series in one room by the real placement rules.
Add `&variant=1` (2, 3) to see the other variants. Zoom in with a step such as
`wheel:800,500,-600` before the shot, or `key:KeyE` for the top-down
decorating view. Read the PNG to look at it. `bunx tsc --noEmit` must pass
for your files.
