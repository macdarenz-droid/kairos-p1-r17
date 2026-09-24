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
