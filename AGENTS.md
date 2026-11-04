# Repository instructions

- **This repository is public.** Commit source, fixtures a test reads and the README's screenshot. Screenshots, logs and receipts from a run stay in the ignored `.shots/` and `.pocket-build/`.
- Use Conventional Commits for commits and pull requests (`type(scope): summary`).
- Code, comments, tests, scripts and documentation are written in English. Chinese and Japanese text lives only in `src/i18n/`; `bun run check` fails on it anywhere else, including text drawn into a texture (draw a motif instead of characters).
- Every string a person sees goes through `src/i18n`: interface text under a key in `en.ts`, `zh.ts` and `ja.ts`, and catalogue names in English where the thing is defined, translated by id in `catalog.zh.ts` and `catalog.ja.ts`.
- The rules of the room (`src/core/`) do not depend on rendering. A rule changes there, with a test in `test/rules.test.ts`.
- The island is made by the recipe in `src/core/island.ts` (`RECIPE`, `makeIsland`), the same on every run and on the console; how a body walks is `src/core/walk.ts`, in the house `src/core/indoors.ts`. A change to the island's map or its rules comes with a test in `test/island.test.ts`, which also checks that every bit of land can be walked to from the door. Look at the map with `bun scripts/map.ts`.
- New furniture follows `docs/furniture-authoring.md`.
- Look at what you changed: `bun run shot` takes a screenshot in headless Chrome, and `bun run e2e` drives the decorating flows with real input (both need `bun run dev`).

## The Nintendo 3DS

- The console draws what the browser draws. Its models, colours and pictures come from the export (`export.html`, `src/export/export.ts`) running the catalogue's own builders; `tools/cook.ts` lowers them. Do not model or colour anything for the console alone: change the browser's model, then `bun tools/n3ds.ts build --export`.
- `tools/cook.ts` writes `island.pack` and `programs/3ds-island/src/pack.h` reads it. Change both in one commit and raise `PACK_VERSION` when a record changes.
- Triangles are what the console pays for (about 0.42 ms a thousand with the room's light), and so are draws: each costs the CPU its uniforms. A model that adds detail is measured on the console (`bun tools/n3ds.ts stats`) in its series' showroom. Outdoors the cook draws everything that stands still with the chunk it stands in; an island prop is held to `PROP_BUDGET` triangles.
- The interface (`apps/island-3ds`) runs the room's rules from `src/core`; it does not restate one. Its text is `src/i18n` (the `ds.*` keys), and each language's glyphs are baked by `tools/fonts.ts`: run `bun apps/island-3ds/test/preview.ts <lang>` and look at every sheet before a device build.
- PocketJS is pinned in `vendor/pocketjs`. Do not edit the submodule for this app's behaviour: send the change to PocketJS and move the pin.
- The console is reached over its paired development connection (`bun tools/n3ds.ts install|push|capture|stats|input --host <address>`); the pairing key is a file under `vendor/pocketjs/.pocket/`, ignored by Git. Captures and logs stay in `.pocket-build/`.
