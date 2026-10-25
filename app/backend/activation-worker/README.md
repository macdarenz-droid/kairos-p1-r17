# Kairos activation Worker

A Cloudflare Worker with a D1 database: it turns an invite code into a signed receipt. The app checks that receipt on
the device, offline, with the public key, and kairos-api uses the same signature to tell devices apart.

This folder is its own npm package, like `../kairos-api` (D277): the same pinned tools and `.npmrc`, TypeScript in
`src/`, and tests that run in the Workers runtime with a real D1 (`@cloudflare/vitest-plugin`). The app and its Pages
build never install it.

## Deployment identity

- Config: `wrangler.jsonc` (`main` is `src/index.ts`, compatibility date `2026-08-31`, `workers_dev` on, no preview URLs)
- Worker: `kairos-activation`
- Public endpoint path: `/activate`
- D1 binding: `DB`, database name `kairos-activation-db`. The database id is not in git: wrangler finds the database
  by its name.
- Rate limiter binding: `ACTIVATION_RATE_LIMITER`, namespace `7001`: 10 calls per 60 seconds for each hashed network
  address
- Setting (`vars`): `KAIROS_APP_ORIGINS`, the app's exact origins
- Signing secret: `KAIROS_ACTIVATION_PRIVATE_KEY` (base64 PKCS#8, ECDSA P-256). Its public half is the app's Pages setting
  `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` and kairos-api's secret `KAIROS_ACTIVATION_PUBLIC_KEY_SPKI`.

The private signing key and invite codes never go in git. The Worker keeps a code only as the SHA-256 of its trimmed,
upper-case text, and logs no code, hash or address.

## Checks

Run inside `app/backend/activation-worker` (Node 22, as the app):

- `npm ci`
- `npm run typecheck`
- `npm test`: the tests in `test/`, in the Workers runtime. `vitest.config.ts` applies `migrations/` to a test D1 and
  makes a throwaway signing key each run, so no real key is ever needed.
- `npm run build`: a dry-run bundle into `.wrangler/dry-run`; nothing is deployed.

CI runs the same four steps in the `activation` job, "activation Worker (typecheck, tests, bundle)".

## `/activate`

`POST /activate` with JSON `{ inviteCode, appVersion, buildId }`, as every app build sends it. The answer is
`{ ok: true, receipt }` or `{ ok: false, reason }`, JSON with `cache-control: no-store` and `vary: Origin`.

| HTTP | reason | when |
|---|---|---|
| 200 | (ok) | the code was unused and not expired; it is now used, by this receipt |
| 400 | `invalid-code` | the body is not JSON, or a field is missing or blank |
| 403 | `invalid-code` | an unknown or revoked code (the same answer for both) |
| 403 | `already-used` | the code was used before |
| 403 | `expired-code` | the code expired before it was used |
| 403 | `origin-not-allowed` | an `Origin` that is not the app's (below) |
| 404 | `service-error` | any other path |
| 405 | `service-error` | any method but POST and OPTIONS |
| 415 | `service-error` | a content type without `application/json` |
| 429 | `rate-limited` | 10 tries in a minute from this network address |
| 500 | `service-error` | a bug, or the signing key is missing or broken (the code stays unused) |
| 503 | `service-error` | the code is unused and not expired, yet D1 did not use it up |

The receipt is `{ receiptVersion: 1, activationId, issuedAt, verifierPayload, verifierSignature }`. The signed payload is
the JSON text of `{ proofVersion: 1, purpose: "kairos-activation", receiptVersion: 1, activationId, issuedAt }`, keys in
that order. The signature is ECDSA P-256 with SHA-256, the raw 64 bytes in base64url. The Worker signs first, then one
conditional `UPDATE … WHERE status = 'unused'` uses the code up, so a signing failure never spends a code.

## Origins

`KAIROS_APP_ORIGINS` in `wrangler.jsonc` lists the app's exact https origins, comma-separated (today
`https://kairos-p1-r17.pages.dev`). Only an exact match counts: a Pages preview address is not allowed unless it is
listed. An entry that is not a bare https origin is ignored.

- A request with any other `Origin` gets 403 on any path and method, before any work: no limiter, no D1, no signing.
  Another website can't use up a code, even with a form post that needs no preflight.
- A request without `Origin` (curl, a script) is answered, within the limit, with no CORS headers (as kairos-api, D139).
- The app's origin gets `access-control-allow-origin` with its own origin. Its preflight (`OPTIONS /activate`) gets 204
  with `POST, OPTIONS` and `Accept, Content-Type`. Any other preflight gets 403. Credentials are never allowed, and the
  origin is never `*`.

## Migration ownership

`migrations/0001_activation_codes.sql` is the historical schema contract for the manually-created production table.
Future schema changes must be additive, versioned migration files. Do not rewrite this migration after it becomes
authoritative.

Cloudflare records migrations applied through Wrangler in the D1 migrations table. Because production schema V1 was
created manually before this source artifact existed, reconcile the migration history deliberately before using
`wrangler d1 migrations apply --remote`; do not blindly re-apply migration 0001 to the existing database.

## Rate limiting

The rate limiter is abuse protection only. D1's conditional `UPDATE ... WHERE status='unused'` remains the one-time
redemption authority. Activation happens before Kairos has an authenticated user identifier, so the Worker derives a
one-way-hashed key from Cloudflare's connecting-network identifier (`activation:<SHA-256 of the address>`) instead of
using one global limiter key. This avoids one client exhausting the allowance for all activation attempts while keeping
the raw identifier out of the limiter key.
