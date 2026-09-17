# Cloudflare Pages deployment

Cloudflare Pages builds the latest FULL canonical candidate directly from this repository's `main` branch. The candidate ZIPs at the repository root are the deployable units; the checked-out tree at the root is not the app that Pages builds.

## Project settings

| Setting | Value |
|---|---|
| Framework preset | None |
| Production branch | `main` |
| Root directory | empty (repository root) |
| Build output directory | `.pages-build/kairos_p76/dist` |
| Environment variable | `NODE_VERSION` = `22.16.0` |
| Environment variable | `SKIP_DEPENDENCY_INSTALL` = `true` |

`SKIP_DEPENDENCY_INSTALL` is required. Without it Pages runs its own `npm install` against the root `package.json` before the build command starts, and that install fails (`Cannot read properties of null (reading 'edgesOut')`) because the root tree is not the packaged app and carries no lockfile. The build command below performs the real install inside the extracted candidate.

## Build command

```
rm -rf .pages-build && mkdir -p .pages-build && unzip -q <CANDIDATE_ZIP> -d .pages-build && cd .pages-build/kairos_p76 && npm ci && npm run build
```

`<CANDIDATE_ZIP>` is the ZIP named as `CANDIDATE_ZIP` in `.github/workflows/kairos-gate.yml` on `main`, which is always the latest FULL canonical PASS. Each gate that lands on `main` changes only that name.

## Log check

A correct build log goes from `Detected the following tools from environment` straight to `Executing user command: rm -rf .pages-build …`. If it prints `Installing project dependencies`, the `SKIP_DEPENDENCY_INSTALL` variable is not active for that environment or that deployment was created before the variable was saved.
