# Repository instructions

- **This repository is public.** Commit source, fixtures a test reads and the README's screenshot. Screenshots, logs and receipts from a run stay in the ignored `.shots/` and `.pocket-build/`.
- Use Conventional Commits for commits and pull requests (`type(scope): summary`).
- Code, comments, tests, scripts and documentation are written in English. Chinese and Japanese text lives only in `src/i18n/`; `bun run check` fails on it anywhere else, including text drawn into a texture (draw a motif instead of characters).
- Every string a person sees goes through `src/i18n`: interface text under a key in `en.ts`, `zh.ts` and `ja.ts`, and catalogue names in English where the thing is defined, translated by id in `catalog.zh.ts` and `catalog.ja.ts`.
- The rules of the room (`src/core/`) do not depend on rendering. A rule changes there, with a test in `test/rules.test.ts`.
- New furniture follows `docs/furniture-authoring.md`.
- Look at what you changed: `bun run shot` takes a screenshot in headless Chrome, and `bun run e2e` drives the decorating flows with real input (both need `bun run dev`).
