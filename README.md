# Pocket Island

A cosy bedroom in the style of *Animal Crossing: New Horizons*, rendered in real time with three.js, with a decorating mode that follows the island's grid rules and a catalogue of furniture in matching series to pick from, recolour and swap.

![Decorating the default room, with the catalogue open](docs/screenshot.jpg)

The 3D room of [Pocket Studio](https://studio.pocket.nexus) was the reference. This project borrows its stage structure (one renderer, a frame loop and listeners), a camera rig that frames a rectangle that must stay visible, Khronos Neutral tone mapping, breathing lamp halos, pooled lamp lights, and its way of checking work with screenshots from headless Chrome over CDP. The difference is that the Pocket Studio room is baked in Blender Cycles and stays put, whereas here every piece of furniture can be moved, so all of the lighting is computed live.

## Running

```sh
bun install
bun run dev          # http://127.0.0.1:5317
```

| Command | What it does |
| --- | --- |
| `bun run check` | Type-check and unit tests (rules, catalogue, sets, showrooms, translations) |
| `bun run e2e` | End-to-end check: 28 decorating rules, flows, lighting and language checks, driven with real mouse and keyboard events (needs `bun run dev`) |
| `bun run shot -- "<url>" --do "<steps>"` | Screenshot in headless Chrome; the steps are described at the top of `scripts/shot.ts` |
| `bun run build` | Bundle into `dist/` |

URL parameters:

- `?fresh` ignores the saved room and starts from the default one.
- `?lang=en|zh|ja` picks the language.
- `?showroom=<series>` (`wooden` `cute` `rattan` `japanese` `starry` `nordic` `basic` `all`) opens that series' showroom. Add `&variant=1` to see each piece's second colour.

## Languages

The interface comes in English, Simplified Chinese and Japanese. It follows the browser's language on the first visit. You can change it under **Settings → Language**; the choice is remembered and the interface redraws on the spot. Each language has its own rounded typeface: Baloo 2 for English, ZCOOL KuaiLe for Chinese headings, and M PLUS Rounded 1c for Japanese.

All text lives in `src/i18n/`:

- `en.ts`, `zh.ts`, `ja.ts` hold the interface text under shared keys. TypeScript rejects a language file with a missing key.
- Catalogue names (items, colours, wallpapers and flooring, series, categories, sets, room sizes) are written in English where each thing is defined. `catalog.zh.ts` and `catalog.ja.ts` translate them by id; colours are keyed by their English name, since many pieces share them.
- `test/i18n.test.ts` fails if anything in the catalogue lacks a Chinese or Japanese name, if a translation drops a parameter, or if Chinese or Japanese text appears anywhere outside `src/i18n/`.

## Grid rules (as on the island)

All of the rules are in `src/core/rules.ts`. They don't depend on rendering, and `test/rules.test.ts` covers them.

- The floor is a grid of tiles (1 tile = 1 world unit). Things take up whole tiles and **can stop on half tiles** (they snap to 0.5).
- Each turn is 90° clockwise and swaps width and depth. When there's no room to turn, the turn is refused and you're told why.
- Furniture and small items can't overlap on the floor.
- **Rugs are a layer of their own.** Furniture can stand on them, but rugs can't overlap each other.
- **Small items can go on tables and cabinets.** Each piece defines the size and height of its top, and the top has its own grid. When the table moves, turns or goes into storage, whatever is on it goes too.
- **Walls have their own grid** (back, left and right walls, 3 tiles high). Wall items and windows can't overlap on the same wall, and never clash with floor furniture.
- **The ceiling is its own layer**, for pendant lamps and hanging things (added in the game's 2.0 update).
- The tile in front of the door must stay clear.
- A room holds at most **150 items**, counting the walls and ceiling.
- Room sizes: tent 4×4, cottage 6×6, main room 8×8, upstairs or basement 10×6. When the room shrinks, whatever no longer fits goes into storage.
- The ceiling light has three settings, warm, cool and off (the game's up button). Day, dusk and night change the view through the windows and how much daylight comes in.

## Catalogue

108 pieces of furniture with 383 colour variants, plus 12 wallpapers and 11 floorings. Every piece has a footprint and colour choices. Tables and cabinets have tops. Lamps switch on and off and really light the room, and televisions, computers and the handheld console have screens that switch on.

| Series | Pieces | What's in it |
| --- | --- | --- |
| Wooden | 10 | Bed, nightstand, wardrobe, desk, chair, bookshelf, round table, stool, chest, lamp (4 wood colours) |
| Cute | 14 | Princess bed, vanity, scalloped wardrobe, heart chair, sofa, round table, floor lamp, bunny plush, music box, heart mirror, bunting, pendant lamp, heart rug |
| Rattan | 13 | Rattan bed, armchair, hanging egg chair (1.5×1.5, a half-tile size), low table, cabinet, floor lamp, ceiling fan, bird of paradise, surfboard, shell wind chime, woven rug |
| Japanese | 12 | Futon, round low table (1.5×1.5), floor cushion, andon lamp, tansu chest, folding screen, bonsai, tea set, hanging scroll, round shoji window, paper lantern, tatami mat |
| Starry | 13 | Starry bed, moon chair, cloud sofa, desk, telescope, star lamp, globe, moon wall lamp, star string lights, planet mobile, round window, cloud rug |
| Simple | 15 | Bed, desk, sofa, lounge chair, side table, tripod floor lamp, cube shelf, floor mirror (1×0.5), snake plant, wall shelf, art print, globe pendant, wool rug |
| Odds & Ends | 31 | TV stand and flat-screen TV, retro TV, record player, laptop, desk fan, handheld console, aquarium, scented candle, mug, guitar, piano, plants, alarm clock, books, teddy bear, windows, wall clock, poster, air conditioner, pendant lamp, chandelier, rugs and more |

The **Sets** drawer has 7 whole rooms: Wooden Bedroom, Pink Princess Room, Rattan Getaway, Japanese Cottage, Starry Dream, Nordic Simple and an 8×8 Big Bedroom mixing every series. It also has a showroom for each series, which sets out every piece of the series in one big room by the same rules, to look at piece by piece. Opening a showroom doesn't overwrite your saved room.

New furniture is authored as described in `docs/furniture-authoring.md`.

## Controls

Outside decorating mode: drag to turn the view, use the wheel to zoom toward the pointer, click a lamp or a TV to switch it, and press `E` to start decorating.

While decorating:

| Input | Action |
| --- | --- |
| Drag an item | Pick it up and move it. The footprint shows green where it fits and red where it doesn't; let go to put it down |
| `R` | Rotate 90° clockwise |
| `X` / `Delete` | Put into storage |
| Arrow keys / `WASD` | Nudge the selection half a tile |
| Drag the floor / `⇧`+click | Box-select or add to the selection, then move several at once |
| `Tab` | Switch layer: all, furniture, walls, rugs, ceiling |
| Right-drag (`⇧` to pan), wheel | Move the view |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `L` | Switch the ceiling light |
| `Esc` | Stop placing, or clear the selection |

The bottom toolbar has the layers and four drawers:

- **Catalog**: furniture, small items, wall items, ceiling, rugs, wallpaper and flooring, filtered by series, with a colour picker on each piece.
- **Storage**: whatever you've put away, ready to take out again.
- **Sets**: the whole rooms and the series showrooms.
- **Room**: size, put everything away, export and import the layout, reset to the default room.

When something is selected, the panel on the left changes its colour, rotates it, switches it on or off, or puts it away. The layout is saved in the browser as you go.

## Rendering

- **Lights**: a key light from high above the front left casts soft shadows back and to the right, where the camera can see them. A shadowless light from the camera's side lights the fronts of things. A sky-and-floor hemisphere and a soft room environment map fill in the rest.
- **Soft shadows** (`src/scene/shadows.ts`) use PCSS: a 16-tap blocker search and a 56-tap filter with a receiver-plane depth bias. Shadows are crisp where things touch the floor and soft where they're lifted.
- **Ambient occlusion** comes from N8AO. The picture then goes through Neutral tone mapping, a little extra saturation and contrast, and a vignette.
- **Bloom** is taken only from surfaces that give off light (lamp shades, bulbs, windows, screens), and grows stronger at night. A wall lit by a lamp never blooms.
- **Lamp lights** act as soft balls about half a tile across, and the light one lamp puts on any surface is capped. A lamp standing against a wall can't blow the wall out (`installLampFalloff` in `src/scene/lighting.ts`).
- **Tilt-shift** is a hand-written single-pass blur (`src/scene/tiltshift.ts`), softened while decorating.
- **Edges**: 4× MSAA. The selection outline is a back-face hull pushed out along the normals, and it turns red where an item can't go.
- **Lamp light pool**: lamps draw from a fixed pool of point lights, so switching a lamp never recompiles materials.
- **Sunbeams**: by day, sunlight through each window lays a patch of light with the window's panes on the floor. It turns amber at dusk and is gone at night.
- **Frame rate** at 3024×1964 (2× pixel density) on an M3 Max: the default room runs at 60 fps, and a showroom with about 100 pieces at about 53–56 fps.

## Code layout

```
src/core/        Rules, room state and undo history (plain TypeScript, unit-tested)
src/scene/       Rendering: stage and post-processing, camera, lights, room shell, procedural textures,
                 materials, modelling kit, view sync, overlays
src/furniture/   The catalogue (one file per series), wallpaper and flooring
src/i18n/        Interface text and catalogue translations (English, Chinese, Japanese)
src/editor.ts    Decorating interaction
src/ui/          Interface, icons, catalogue thumbnails
src/presets.ts   Whole-room sets
src/showroom.ts  Series showrooms
scripts/         Screenshots and the end-to-end check
test/            Rules, catalogue, sets, showrooms and translations
docs/            Furniture authoring guide, screenshot
```

## License

[MIT](LICENSE).
