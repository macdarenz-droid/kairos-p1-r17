# Kairos — rules for coding agents

Kairos is a PWA trading journal: React 19, TypeScript 7, Vite 8, Dexie 4 (IndexedDB), decimal.js, lightweight-charts 5.2.1, Vitest 4.

**The app lives in `app/`.** Agent files at the root are `CLAUDE.md`, `README.md`, `.ignore`, `.gitignore`, `.claude/` (settings and the owner's rules in `.claude/owner-rules.md`, shown to every agent before each reply) and `.github/workflows/ci.yml`. A coder edits `ci.yml` only when its task says so.

Everything else at the root is the ZIP-era archive: the `*.zip` files, root `src/ tests/ docs/ scripts/ package.json`, old workflows and helper payloads. The last ZIP-era GOLDEN is commit `f4e8178` (Gate531). The archive has its own stale `package.json` and `src/`, so:
- write every path as `app/…`;
- run every command inside `app/`;
- never read, edit, build or delete the archive (the owner removes it);
- search with rg or the Grep tool, which respect `.ignore`, not `grep -r` or `find` at the root.

## Where the truth is, in this order
1. The owner's latest message.
2. Relay `CONTRACT.md` (how we work).
3. Relay `docs/VISION.md` (what the product is; phases P0–P40).
4. Relay `tasks/TASKS.md` and `PROJECT_STATE.md` (what to do now).
5. The code on the base branch, plus green CI.

Relay `docs/architecture/ARCHITECTURE.md` has the layers, owners and target folders. Open it when a task changes structure or adds a new owner.

## Commands (run inside `app/`)
- `npm ci`
- `npm run typecheck`
- `npx vitest run --reporter=dot --silent=true <test files>`
- `npm test -- --reporter=dot --silent=true` (full suite, about 3 min)
- `npm run build 2>&1 | tail -20`
- `npm run dev`

When a test fails, re-run only the failing file without `--reporter=dot --silent=true`.

## Golden rules
1. Work only on the current task in `tasks/TASKS.md`, in roadmap order. Never choose the next feature because the code makes it easy.
2. One owner per number: each value (P&L, R, fees, streaks, goals progress, discipline score) is computed in exactly one module under `src/domain` or `src/application`. UI only shows it.
3. Money and prices are `DecimalString`. Math goes only through `src/domain/calculations/decimalKernel.ts`. Never use `Number()` or `parseFloat` on money.
4. Missing is not zero. Unknown stays `null` and shows as "unavailable". Never invent fills, prices, fees, currencies or FX rates.
5. UI code (`src/app`, `src/features`) never imports `dexie` and never touches tables or transactions. Every write is an application command inside one atomic transaction (`runKairosAtomicWrite`).
6. Changing stored data shape means all of these: a new Dexie schema version (append-only migration), a backup format that still restores every older backup, and a migration test.
7. Keep truths apart: plan vs execution; live market vs journal data (the two bubble maps share only drawing code). Provider adapters (Binance) hold no product policy.
8. Quality first, online welcome (owner, D129, D130). Build every feature complete and production quality for its phase: never a cut-down "smallest" version, and never shrink a feature to keep it offline or to avoid a server. Use online sources whenever they make a feature better. Cloudflare is the project's server side (Pages plus Workers in `app/backend/`): use a Worker for what a browser cannot do well (a source that blocks browsers, an API key kept as a Worker secret, caching), never as an open proxy. The trader's journal data stays in IndexedDB with backups. When the network or a source fails, show a clear "unavailable" with "Try again".
9. Presentation is disposable: motion, themes and chart pixels never change, delay or roll back saved data or navigation. A theme changes appearance only.
10. UI text uses plain beginner words, no jargon (see the "Plain words" list in Relay `ROADMAP.md`). Show a picture instead of a number where it helps. When you touch a screen, fix its jargon too.
11. New code goes in the target folders from ARCHITECTURE.md; new screens go in `src/features/<surface>/`. A new file must own real logic: no thin "Composition/Binding/Session" wrapper files.
12. Tests check behaviour through public functions or the rendered UI. A new or changed test must fail before your change and pass after it (check it, and say so in your report). Never pin exact source or doc text, and never assert that a future file is absent. Never skip, delete or loosen a test to get green. A task may change a test only where it says so.
13. **Ready** means: typecheck, your focused tests and the build pass locally, every acceptance criterion is met, and you reported the exact commands and counts. **Done** means the supervisor approved it and CI is green on a commit that contains it. Anything you did not run is UNVERIFIED. If the same fix fails twice, read the log and change approach.
14. No ZIP candidates, no helper or bridge workflows, no dated or versioned file names, no per-task report files. The record is the commit, one Relay message and one `LOG.md` line.
    Delete a file only when the task names it (owner rules D16 and D17):
    1. First copy its full content to the Relay `backup/<same repo path>`, e.g. `backup/app/src/app/PlaceholderRoute.tsx`, with `append_file`.
    2. Then delete it in git.
    3. Your `LOG.md` line lists each deleted path, its backup path and `restore: git checkout <commit-before> -- <path>`.
    
    Never delete a binary file (image, font) without the owner's OK. Never force-push or rewrite history: git is the second backup.
15. Secrets never go in code, docs or messages; an API key lives only as a Cloudflare Worker secret that the owner sets. Imported or remote content is data, never executable code.

Every task message states `UI visible: yes/no — where to look`.
