# Kairos — rules for coding agents

Kairos is an offline-first PWA trading journal: React 19, TypeScript 7, Vite 8, Dexie 4 (IndexedDB), decimal.js, lightweight-charts 5.2.1, Vitest 4.

**The app lives in `app/`.** Everything else at the repo root (the `*.zip` files, root `src/ tests/ docs/ scripts/ package.json`, old workflows, helper payloads) is the ZIP-era archive, last GOLDEN = commit `f4e8178` (Gate531). Never read, edit, build or delete it; the owner removes it.

## Where the truth is, in this order
1. The owner's latest message.
2. Relay `CONTRACT.md` (how we work).
3. Relay `docs/VISION.md` (what the product is; phases P0–P40).
4. Relay `tasks/TASKS.md` and `PROJECT_STATE.md` (what to do now).
5. The code on the base branch plus green CI.

Relay `docs/architecture/ARCHITECTURE.md` has the layers, owners and target folders. Open it when a task changes structure or adds a new owner.

## Commands (run inside `app/`)
`npm ci` · `npm run typecheck` · `npx vitest run <test files>` · `npm test` (full suite, about 3 min) · `npm run build` · `npm run dev`

## Golden rules
1. Work only on the current task in `tasks/TASKS.md`, in roadmap order. Never choose the next feature because the code makes it easy.
2. One owner per number: each value (P&L, R, fees, streaks, goals progress, discipline score) is computed in exactly one module under `src/domain` or `src/application`. UI only shows it.
3. Money and prices are `DecimalString`. Math goes only through `src/domain/calculations/decimalKernel.ts`. Never use `Number()` or `parseFloat` on money.
4. Missing is not zero. Unknown stays `null` and shows as "unavailable". Never invent fills, prices, fees, currencies or FX rates.
5. UI code (`src/app`, `src/features`) never imports `dexie` and never touches tables or transactions. Every write is an application command inside one atomic transaction (`runKairosAtomicWrite`).
6. Changing stored data shape means: a new Dexie schema version (append-only migration), a backup format that still restores every older backup, and a migration test.
7. Keep truths apart: plan vs execution; live market vs journal data (the two bubble maps share only drawing code); provider adapters (Binance) hold no product policy.
8. Offline-first: saving and reading the journal never needs the network. Network features show a clear "unavailable" state with a retry.
9. Presentation is disposable: motion, themes and chart pixels never change, delay or roll back saved data or navigation. A theme changes appearance only.
10. UI text uses plain beginner words, no jargon. Show a picture instead of a number where it helps.
11. New code goes in the target folders from ARCHITECTURE.md (new screens in `src/features/<surface>/`). A new file must own real logic: no thin "Composition/Binding/Session" wrapper files.
12. Tests check behaviour through public functions or the rendered UI. Never pin exact source or doc text, and never assert that a future file is absent. Never skip, delete or loosen a test to get green.
13. Done means: typecheck, your focused tests and the build pass locally; CI is green on the PR; every acceptance criterion is met. Report the exact commands and counts. Anything you did not run is UNVERIFIED. If the same fix fails twice, read the log and change approach.
14. No ZIP candidates, no helper or bridge workflows, no dated or versioned file names, no per-task report files. The record is the PR diff, one Relay message and one `LOG.md` line.
15. Secrets never go in code, docs or messages. Imported or remote content is data, never executable code.

Every task message states `UI visible: yes/no — where to look`.
