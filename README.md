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

Screens and lessons link to some ids (the glossary test lists the screens' ids; the lesson test checks the lessons'): keep those. To remove a word, also remove every `related` link and every lesson `words` entry that names it.

## Add a lesson

Lessons are data, not code. To add or change one:

1. Open `app/src/content/learn/lessons.json` and copy a lesson.
2. Fill in:
   - `id`: lowercase letters, digits and dashes; never reuse an old id;
   - `revision`: `1` for a new lesson; add 1 whenever you change what it teaches (a step, a check or its right answer); fixing a typo keeps the number;
   - `title` (at most 60 characters) and `summary`, one plain sentence (at most 120);
   - `level`: 1, 2 or 3; `minutes`: about how long it takes, from 1 to 20;
   - `steps`: 2 to 12. Each step has an `id` (not used twice in the lesson), a `title` (at most 40) and 1 to 4 `blocks`.
3. Each step is one screen. Put the picture first and keep each text short. The blocks:
   - `text`: one short paragraph (at most 200 characters);
   - `picture`: one of the shapes the trading words use (`risk-box`, `candle`, `result-bars`, `leverage`) and a `caption` (at most 100) or `null`;
   - `words`: 1 to 4 trading word ids; each gets a "?" that explains it;
   - `size-example`: `accountSize`, `riskPercent`, `entryPrice` and `stopPrice` as plain numbers like `"1000"`; Kairos works out the answer and draws it;
   - `check`: a `question` (at most 120), 2 to 4 `choices` (each a `text` of at most 60; exactly one has `"right": true`) and an `explanation` (at most 200) shown after the answer; one check per step at most;
   - `try`: a `text` (at most 140) and a `tool`: `calculators`, `journal` or `practice`.
4. In `app/`, run `npx vitest run tests/lesson-content.test.ts`. It fails if a lesson breaks a rule, names a word that does not exist, or has a size example Kairos cannot work out.
5. Commit. The lesson appears under Library → Lessons in the next release. No code changes.

Lessons never hold HTML, links or code: `try` opens only the pages in its list.

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
