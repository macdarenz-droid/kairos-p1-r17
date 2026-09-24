# Kairos Trading Journal

A visual-first, offline-first trading journal and discipline system (PWA).

- **App source:** `app/` (React + TypeScript + Vite + Dexie + lightweight-charts).
- **Rules for coding agents:** `CLAUDE.md`.
- **Plans, tasks, decisions and log:** the Relay project "Kairos Journal".
- **Archive:** everything else at the root (the `*.zip` candidates, root `src/ tests/ docs/ scripts/`, old workflows) is the ZIP-era record of Gate1–Gate531. The last ZIP-era GOLDEN is commit `f4e8178` (Gate531, P36.1). It stays until the owner removes it.

## Run locally

```sh
cd app
npm ci
npm run dev        # dev server
npm test           # full test suite
npm run build      # production build into app/dist
```

Node 22.16.0 (`app/.nvmrc`).

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: install, typecheck, tests, build.

## Add a learning source (PDF)

Learning sources are files, not code. To add one:

1. Put the PDF in `app/public/library/sources/`. Keep its file name: letters, digits, `.`, `_` or `-`, ending in `.pdf`, at most 25 MB.
2. Get its size and fingerprint: `wc -c < file.pdf` and `sha256sum file.pdf` (on a Mac: `shasum -a 256 file.pdf`).
3. Copy the sample entry in `app/src/content/library/learningSources.json` and fill in:
   - a new `id` (lowercase letters, digits, dashes);
   - `title`, as printed on the file;
   - `covers`: one plain sentence;
   - `author`: `null` if unknown;
   - `origin`: where the file came from;
   - `rights`: `null` if unknown;
   - `language`;
   - `revision`: `number` 1, `fileName`, `bytes`, `sha256`, `pages` (`null` if unknown), and `addedOn` (YYYY-MM-DD).
4. In `app/`, run `npx vitest run tests/learning-sources-files.test.ts`. It fails if a file and its entry differ in size, start or fingerprint, if a file has no entry, or if an entry has no file.
5. Commit both. The Library lists the source in the next release. No code changes.

To replace a file: add the new file, raise `revision.number` by 1, and update `fileName`, `bytes`, `sha256`, `pages` and `addedOn`. Copies of the old revision saved on a device are removed the next time the Library opens. Deleting a PDF needs the owner's OK (CLAUDE.md rule 14).

## Add a trading word

Trading words are data, not code. To add or change one:

1. Open `app/src/content/learn/glossary.json` and copy an entry.
2. Fill in:
   - `id`: lowercase letters, digits and dashes; never reuse an old id;
   - `plainWords`: the words Kairos shows on screen (at most 60 characters);
   - `tradingTerm`: what traders usually call it (at most 80);
   - `alsoCalled`: other names people search for (up to 6, each at most 40);
   - `explanation`: one plain sentence (at most 280);
   - `picture`: `null`, or one of the shapes already used in the file (`risk-box`, `candle`, `result-bars`, `leverage`);
   - `related`: up to 6 ids of other words.
3. In `app/`, run `npx vitest run tests/glossary-content.test.ts`. It fails if an entry breaks a rule or links to a word that does not exist.
4. Commit. The word appears under Library → Trading words in the next release. No code changes.

Screens link to some ids (the test lists them): keep those. To remove a word, also remove every `related` link to it.

## Deploy (Cloudflare Pages)

Settings for building from `app/` (the owner sets them once, when the first release merges into `main`):

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `app` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| `NODE_VERSION` | `22.16.0` |
| `SKIP_DEPENDENCY_INSTALL` | `true` |

Keep the `VITE_KAIROS_ACTIVATION_ENDPOINT` and `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` variables if they are set. Without them the built app shows only the activation screen.
