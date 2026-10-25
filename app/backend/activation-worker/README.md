# Kairos activation Worker

A Cloudflare Worker with a D1 database: it turns an invite code into a signed receipt. The app checks that receipt on
the device, offline, with the public key, and kairos-api uses the same signature to tell devices apart. One invite code
works on up to 3 devices, and each device can see and manage the others (D274-D278).

This folder is its own npm package, like `../kairos-api` (D277): the same pinned tools and `.npmrc`, TypeScript in
`src/`, and tests that run in the Workers runtime with a real D1 (`@cloudflare/vitest-plugin`). The app and its Pages
build never install it.

## Deployment identity

- Config: `wrangler.jsonc` (`main` is `src/index.ts`, compatibility date `2026-08-31`, `workers_dev` on, no preview URLs)
- Worker: `kairos-activation`
- Routes: `POST /activate`, `POST /devices`, `POST /devices/remove`, `POST /devices/check`, `GET /health`
- D1 binding: `DB`, database name `kairos-activation-db`. The database id is not in git: wrangler finds the database
  by its name.
- Rate limiter binding: `ACTIVATION_RATE_LIMITER`, namespace `7001`: 10 calls per 60 seconds for each key (below)
- Setting (`vars`): `KAIROS_APP_ORIGINS`, the app's exact origins
- Signing secret: `KAIROS_ACTIVATION_PRIVATE_KEY` (base64 PKCS#8, ECDSA P-256). Its public half is the app's Pages setting
  `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` and kairos-api's secret `KAIROS_ACTIVATION_PUBLIC_KEY_SPKI`. The Worker checks
  device tokens with the public half of this same key, so it needs no second secret.

The private signing key and invite codes never go in git. The Worker keeps a code only as a SHA-256 fingerprint.

## Logs

`wrangler.jsonc` sets `observability` as kairos-api does: `enabled: true`, `head_sampling_rate: 1`, and
`logs.invocation_logs: false`. Before this, the deployed Worker kept whatever logging the dashboard had.

- Kept: the Worker's own `console` lines. The Worker writes none.
- Off: Cloudflare's own log line for each request (its "invocation log"), which records details of the request. Which
  details exactly is UNVERIFIED; with it off, none are kept.
- Nothing in the code logs an invite code, a fingerprint, a device token, a receipt or an address. Every error is caught
  and answered `{ ok: false, reason: "service-error" }`, with no stack trace.

## Checks

Run inside `app/backend/activation-worker` (Node 22, as the app):

- `npm ci`
- `npm run typecheck` (TypeScript, and `src/inviteCode.mjs` through its JSDoc)
- `npm test`: the tests in `test/`, in the Workers runtime. `vitest.config.ts` applies `migrations/` to a test D1, hands
  in the SQL from `deploy/` with a second empty D1, and makes a throwaway signing key each run, so no real key is ever
  needed.
- `npm run build`: a dry-run bundle into `.wrangler/dry-run`; nothing is deployed.

CI runs the same four steps in the `activation` job, "activation Worker (typecheck, tests, bundle)".

## Invite codes (D280)

`src/inviteCode.mjs` owns the code rules, for this Worker and the owner's code tool. It is plain JavaScript, so Node
runs it as it is.

- A new code is 16 characters from Crockford's 32 (digits and letters without I, L, O and U), shown in four groups:
  `7Q4M-X2PB-9HRT-K3VD`. D1 stores the SHA-256 of its 16 characters without dashes.
- Typing is forgiving: case, spaces and dashes don't matter, O reads as 0, and I and L read as 1. Invisible characters
  and full-width letters and digits in a pasted code read as the plain ones (NFKC).
- A code made by hand before this is stored as the SHA-256 of its text trimmed and in upper case, and still matches
  exactly that way.
- `/activate` looks a typed code up by both fingerprints. If both find a code, the exact text wins.

## Three devices per code (D274, D275)

Each code has its own `device_limit` (1 to 10; every code has 3 unless the owner sets another). A device counts while
it is in use; a removed device frees its place.

- Each new device takes one place. A device that keeps its receipt never asks again.
- An expiry date limits only a code's first use. After that, its other places work until the code is revoked.
- A revoked code takes no new device, and its devices learn it at their next check.
- Retries don't use extra places. The app sends a `requestId` and keeps it for that code until it succeeds. The same
  `requestId` on a device of the same code that is still in use, within 24 hours, gets that device's receipt again
  (the same `activationId` and `issuedAt`, signed again), not a new place. After that, the same `requestId` takes a new
  place like any new device, or gets `already-used` when none is free. Old app builds send none and still work.
- A new device is one conditional `INSERT … SELECT` in `activation_devices` (only while fewer than `device_limit` devices
  are in use), sent in one D1 batch with the code's first-use `UPDATE`. D1 runs a batch as one transaction, one at a
  time, so two phones at the same moment can't make 4. The tests check this with six requests at once on a slow D1.
- The count "used on 2 of 3" is made only here (`src/devices.ts`); the app only shows it.

## `/activate`

`POST /activate` with JSON `{ inviteCode, appVersion, buildId }`, as every app build sends it, plus two optional fields
from new builds:

- `requestId`: 8 to 64 letters, digits or dashes.
- `deviceLabel`: a coarse name from a fixed list, never free text: `<platform> · <browser>`, where platform is one of
  iPhone, iPad, Android, Mac, Windows, Linux, Chromebook and browser one of Safari, Chrome, Edge, Firefox,
  Samsung Internet, Opera, Other browser; or `Other device`. Missing means `Other device`. The list is
  `src/deviceLabels.mjs`.

The answer is `{ ok: true, receipt }` or `{ ok: false, reason }`, JSON with `cache-control: no-store` and
`vary: Origin`. Old builds read it unchanged; `deviceLimit` is an extra field they ignore.

| HTTP | reason | when |
|---|---|---|
| 200 | (ok) | a place was free, or this `requestId` already has a device on this code |
| 400 | `invalid-code` | the body is not JSON, or `inviteCode`, `appVersion` or `buildId` is missing, blank or too long |
| 400 | `invalid-request` | `requestId` or `deviceLabel` is there but not allowed |
| 403 | `invalid-code` | an unknown or revoked code (the same answer for both) |
| 403 | `already-used` | all the code's places are in use; the answer adds `deviceLimit`, e.g. `3` |
| 403 | `expired-code` | the code expired before its first use |
| 403 | `origin-not-allowed` | an `Origin` that is not the app's (below) |
| 404 | `service-error` | any other path, or a method other than GET on `/health` |
| 405 | `service-error` | any method but POST and OPTIONS on a POST route |
| 415 | `service-error` | a content type without `application/json` |
| 429 | `rate-limited` | 10 tries in a minute from this network address |
| 500 | `service-error` | a bug, or the signing key is missing or broken (no place is used) |
| 503 | `service-error` | a place was free, yet D1 did not take it |

The receipt is `{ receiptVersion: 1, activationId, issuedAt, verifierPayload, verifierSignature }`. The signed payload is
the JSON text of `{ proofVersion: 1, purpose: "kairos-activation", receiptVersion: 1, activationId, issuedAt }`, keys in
that order. The signature is ECDSA P-256 with SHA-256, the raw 64 bytes in base64url. The Worker signs first, then takes
the place, so a signing failure never uses one.

## Device routes (D277, D278)

All three are `POST` with JSON. A device proves which receipt it holds with the token kairos-api already gets:
`v1.<base64url of verifierPayload>.<verifierSignature>`. The Worker checks the signature with the public half of its
signing key, then finds the device by `activationId` and `issuedAt`. Other devices are named only by their row number,
never by their `activationId`.

- `POST /devices` `{ token }`: this code's devices still in use:
  `{ ok: true, used, limit, devices: [{ id, label, since, lastSeenOn, thisDevice }] }`. `since` is when the device
  was activated; `lastSeenOn` is the last day (UTC) it checked in, or `null` when unknown.
- `POST /devices/remove` `{ token, deviceId }`: removes another device of the same code: `{ ok: true }`. Asking again
  for a device already removed is still ok.
- `POST /devices/check` `{ token }`: `{ ok: true, status }`, where status is `active`, `removed` or `revoked` (a revoked
  code comes first). It writes `last_seen_on` at most once a day, and only for a device in use.

| HTTP | reason | when |
|---|---|---|
| 400 | `invalid-request` | the body is not a JSON object, or `deviceId` is not a whole number above 0 |
| 400 | `cannot-remove-this-device` | a device asked to remove itself |
| 401 | `device-not-recognised` | the token is missing, malformed, not signed by this Worker, or for a device D1 doesn't know |
| 403 | `device-removed` / `code-revoked` | a removed device, or a device of a revoked code, asked for the list or a removal |
| 404 | `device-not-found` | `deviceId` is not a device of this code |
| 415 | `service-error` | a content type without `application/json` |
| 429 | `rate-limited` | 10 calls in a minute from this device |
| 500 | `service-error` | a bug, or the signing key is missing or broken |

## `GET /health`

No limit, and never a value: `{ ok, signingKey: "ready" | "missing", database: "ready" | "missing" }`, 200 when both are
ready and 503 otherwise. `signingKey` is ready when the secret is a P-256 private key the Worker can sign and check
with. `database` is ready when migration 0002's columns and table are there. CI reads it after each deploy.

## Origins

`KAIROS_APP_ORIGINS` in `wrangler.jsonc` lists the app's exact https origins, comma-separated (today
`https://kairos-p1-r17.pages.dev`). Only an exact match counts: a Pages preview address is not allowed unless it is
listed. An entry that is not a bare https origin is ignored.

- A request with any other `Origin` gets 403 on any path and method, before any work: no limiter, no D1, no signing.
  Another website can't use up a code or remove a device, even with a form post that needs no preflight.
- A request without `Origin` (curl, a script) is answered, within the limit, with no CORS headers (as kairos-api, D139).
- The app's origin gets `access-control-allow-origin` with its own origin. Its preflight on a POST route gets 204 with
  `POST, OPTIONS` and `Accept, Content-Type`. Any other preflight gets 403. Credentials are never allowed, and the
  origin is never `*`.

## Rate limiting

The rate limiter slows guessing down; it is not the lock (80-bit codes are, D280). D1 alone decides places.

- `/activate`: 10 tries a minute per network address. The key is `activation:<SHA-256 of the address>`, so the address
  itself never reaches the limiter, and one caller can't use up everyone's tries.
- Device routes: 10 calls a minute per device, key `device:<activationId>`, counted once the token's signature holds.
- `/health` has no limit.
- Cloudflare counts these limits per location (UNVERIFIED).

## Migrations

- `migrations/0001_activation_codes.sql`: one row per code. The production table was made by hand from it.
- `migrations/0002_devices.sql` (D276) only adds:
  - `activation_codes` gains `device_limit` (default 3), `label` and `revoked_at`. 0001 allows the status `revoked`
    only for a code never used, so a used code is revoked with `revoked_at`.
  - New `activation_devices`: one row per device, with `removed_at` and `removed_by` (`trader` or `owner`).
  - Each used code's device is copied in as `Other device`, so it counts as 1 of 3 and its token still works.
- Never rewrite a migration once it has run. A change to the data's shape is a new numbered file that only adds, and
  `test/migration.test.ts` shows every older row still works.

wrangler records each migration it applies by file name in its own table `d1_migrations` (id, name, applied_at), read
in wrangler 4.141.0's code. Because 0001 was made by hand, that table doesn't list it, and `migrations apply` would try to
make the table again. `deploy/mark-hand-made-table.sql` creates the record table the way wrangler does and records
`0001_activation_codes.sql` only when `activation_codes` exists. On a new, empty database it records nothing, and
wrangler applies 0001 itself.

## Deploy (CI, from owner step O8)

CI's job "deploy activation (main)" runs on `main` after `check`, `e2e`, `worker`, `activation` and `cloudflare` pass,
and only when the repository variable `KAIROS_ACTIVATION_DEPLOY` is `on` and the Cloudflare secrets from O1 are set.
Otherwise it leaves a notice ("owner step O8") and CI stays green. There is no preview deploy. In order:

1. `npm ci --ignore-scripts`
2. `wrangler d1 execute kairos-activation-db --remote --command="$(cat deploy/mark-hand-made-table.sql)"`: records the
   hand-made 0001, once. (`--command=` keeps the file's leading `--` comment from being read as a flag.)
3. `wrangler d1 migrations apply kairos-activation-db --remote`: applies 0002 (and any later file). wrangler says yes to
   its own question in CI.
4. `wrangler deploy --message "main <sha>"`
5. `deploy/backfill-devices.sql` again: a code the old Worker used between steps 3 and 4 gets its device too. It adds a
   device only once, so it is safe on every deploy.
6. The live `/health`: CI asks again every 5 seconds, for up to about 60 seconds, until the new version answers. Then it
   must say `"signingKey":"ready"` and `"database":"ready"`. The job fails with what to fix, and tells "the new Worker
   did not answer" apart from "the key is missing".

The CI token needs D1 permission for steps 2, 3 and 5 (O8).

The signing key is set on the Worker once, by the owner, and never by CI. `wrangler.jsonc` lists it under
`secrets.required`. Read in wrangler 4.141.0's code, that makes step 4 ask Cloudflare to carry the key over from the
Worker's current version. If the Worker has no such key, the deploy stops before the new version goes live. If no
Worker named `kairos-activation` exists yet (a wrong name), wrangler stops before uploading, instead of making a new
Worker without a key. Whether Cloudflare carries the key over as wrangler asks is UNVERIFIED until the first deploy;
step 6 checks it.

If the key is ever lost, put back the SAME key: the private half of the Pages setting
`VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` (and of kairos-api's `KAIROS_ACTIVATION_PUBLIC_KEY_SPKI`), with
`npx wrangler secret put KAIROS_ACTIVATION_PRIVATE_KEY` in this folder. Never make a new key: a new key breaks the receipt
on every trader's device.

### Owner step O8

1. Add D1 to the CI token from O1: Cloudflare → My Profile → API Tokens → that token → Edit → add the permission
   Account · D1 · Edit → save. (The menu names are UNVERIFIED.)
2. Check two names: under Workers & Pages the Worker is `kairos-activation`, and under D1 the database is
   `kairos-activation-db`. If either differs, tell the supervisor: CI finds them by name.
3. GitHub → Settings → Secrets and variables → Actions → Variables → New repository variable
   `KAIROS_ACTIVATION_DEPLOY` = `on`.
4. When the release with T-062 merges into `main`, CI records 0001, applies 0002, deploys and checks `/health`. To run
   it again later: GitHub → Actions → CI → Run workflow → branch `main`.

Until O8, the Worker and its migrations are deployed by hand, with the same steps in the same order from this folder
after `npx wrangler login`.
