# kairos-api — the Kairos server

A Cloudflare Worker that gives the Kairos app market data, exchange rates and news. It never receives, stores or
returns journal data: the app sends only a device header and each route's public query values.

This folder is its own npm package (the Workers test runtime and wrangler are not installed by the app or its Pages build).

## Answers

Every answer is JSON with one shape; an upstream body is never passed through. Prices, rates and amounts are decimal
text (JSON strings), never numbers.

- ok: `{ "apiVersion": 1, "ok": true, "data": … }`
- failure: `{ "apiVersion": 1, "ok": false, "error": "unavailable", "reason": "<code>", "retryAfter": <seconds> | null }`

Headers: `content-type: application/json; charset=utf-8`, `cache-control: no-store` (unless a route's cache policy
says otherwise), `x-content-type-options: nosniff`, `vary: Origin`.

| reason | HTTP | retryAfter | when |
|---|---|---|---|
| `bad-request` | 400 | null | an unknown, repeated or badly formed query value |
| `device-not-recognised` | 401 | null | a device-only route without a valid receipt |
| `origin-not-allowed` | 403 | null | an `Origin` header that is not the app's |
| `not-found` | 404 | null | a path not in the route table |
| `method-not-allowed` | 405 | null | anything but GET (and OPTIONS preflight) |
| `rate-limited` | 429 | 60 | the device's or the address's limit is used up |
| `service-error` | 500 | null | a bug (a thrown error, a host not on the route's list) |
| `source-unavailable` | 502 | 30 (a route may set its own) | the upstream failed, timed out, redirected, was too big or of the wrong type |
| `not-set-up` | 503 | null | a binding or secret the route needs is missing |

Routes today: `GET /health` (says whether the device key, cache and limits are set up, and whether it recognised the
device; never a value).

## CORS and `KAIROS_APP_ORIGINS`

The `vars` setting `KAIROS_APP_ORIGINS` in `wrangler.jsonc` lists the app's exact https origins, comma-separated
(today `https://kairos-p1-r17.pages.dev`). A Pages preview of a listed `*.pages.dev` origin
(`https://<label>.kairos-p1-r17.pages.dev`) is also allowed. A request with any other `Origin` gets 403 before any
work. A request without `Origin` is answered: CORS is not access control; the device check and the limits are.

## Devices and limits

The app sends its activation receipt in the header `x-kairos-device: v1.<payload>.<signature>` (base64url of the
receipt's signed payload, then its signature). The server checks the ECDSA P-256 signature with the activation public
key and knows the device by its `activationId`.

- What it proves: this device used one invite code. What it does not: it is not a login, and a copied receipt is not
  refused; it only counts against that one device's limit. Each of a trader's devices (up to 3, D132 Q1) has its own
  receipt.
- A route is `public` (anyone) or `device` (only a recognised device; others get `device-not-recognised`, or
  `not-set-up` when the server has no key).
- Limits (Workers rate-limit bindings, per 60 seconds): `KAIROS_API_DEVICE_LIMITER` 120 a minute per recognised
  device; `KAIROS_API_ANONYMOUS_LIMITER` 30 a minute per network address for everyone else (the address is hashed;
  IPv6 by its /64 network, because one home line or server owns a whole /64). Used up → `rate-limited`, retry after 60 s.
- `/health` does no upstream or storage work and is not limited.
- Secret `KAIROS_ACTIVATION_PUBLIC_KEY_SPKI`: the activation public key (base64 SPKI), the same value as the Pages
  setting `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI`. It is public; it is stored as a Worker secret only so deploys keep it.

## Upstream sources and caching

A route reads another site only through `createUpstreamFetch` (`src/upstream.ts`), which:
- accepts only https URLs on the hosts the route lists in `upstreamHosts` (no other host, no port, no user name or
  password); anything else is a bug answered as `service-error` before any network use;
- never follows a redirect, never forwards the caller's headers (it sends only `accept`, its own `user-agent` and the
  headers the route adds itself), stops after 8 s and refuses an answer over 1 MB (a route may set its own limits);
- refuses an answer of the wrong content type. Every failure maps to `source-unavailable` in the route.

Answers are kept per route (`cache` in the route table: `version`, `edgeSeconds`, `memorySeconds`, `kvSeconds`), only
when ok, under keys that carry the route id and its version:
1. **Workers Cache** (`edgeSeconds`): Cloudflare keeps the answer in front of the Worker and serves hits without running
   it, so without the device check and the limits. A device-only route uses `edgeSeconds: 0`.
2. **Memory** (`memorySeconds`): a copy in the running isolate, for short-lived answers; at most 200 answers and
   8 million characters of JSON together, none over 1 million.
3. **KV** (`kvSeconds`, at least 3,600): for answers kept an hour or more. The Free plan allows 1,000 KV writes a day,
   so use it only for answers that change rarely. A KV failure never fails the request.

## Rules for a new route

- An exact path; every query name with an anchored pattern (`^…$`).
- `access` (`public` or `device`) and `rateLimited` stated.
- Every upstream host listed in `upstreamHosts`.
- Prices, rates and amounts sent as strings (decimal text), never numbers.
- A key only from `env` (a Worker secret), and only in `UpstreamRequest.headers` or the fixed URL.
- `data` rebuilt from checked values, never an upstream body passed through.
- Bump `cache.version` when `data` changes shape.
- A cached answer never depends on the device: the cache key holds only the route, its `cache.version` and the checked query, so `data` must be the same for every device.
- Tests for the decoder and the route.
- Reserved secret names, each added to `KairosApiEnv` with its route: `NEWS_API_KEY` (O3), `MARKET_DATA_API_KEY` (O4),
  `FX_RATES_API_KEY` (O5), `COIN_DATA_API_KEY` (O6).

## Checks (run from `app/`)

```
npm ci --prefix backend/kairos-api
npm run typecheck --prefix backend/kairos-api
npm test --prefix backend/kairos-api -- --reporter=dot
npm run build --prefix backend/kairos-api
```

The tests run in the Workers runtime (`@cloudflare/vitest-plugin`); the build is a wrangler dry run and needs no
Cloudflare login. CI runs all four in the job "kairos-api Worker (typecheck, tests, bundle)".

## Deploy

CI (`.github/workflows/ci.yml`) has four jobs for this Worker:
- **kairos-api Worker (typecheck, tests, bundle)**: on every pull request and every `main` push; no secrets.
- **Cloudflare secrets (owner step O1)**: checks that the GitHub secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` are set. Without them it stays green with a notice, and both deploy jobs are skipped.
- **deploy kairos-api (main)**: on a `main` push or a manual run (GitHub → Actions → CI → Run workflow → `main`), after
  every other check passed. It deploys `kairos-api` to production, checks that the live `/health` answers, and writes
  the Worker's address in the job summary.
- **preview kairos-api (pull request)**: on a pull request that changes `app/backend/kairos-api`; it deploys the
  separate Worker `kairos-api-preview`. The latest pull request that changes the Worker replaces the preview.

The preview Worker `kairos-api-preview` has its own KV (auto-created `kairos-api-preview-kairos-api-cache`) and none of
production's secrets, so its device check reads 'not-checked'. Its `KAIROS_API_ROLE` is 'preview' (the deploy's
`--var`), so a scheduled job (P34) does nothing there, although the preview gets the config's cron triggers too: from
P34 on it holds a second of the account's cron triggers. It shares the limiter namespaces 7101/7102. Production versions
have no preview URLs.

Production's KV namespace `kairos-api-kairos-api-cache` is created by the first deploy. Bump a route's `cache.version`
whenever its `data` changes shape. The Cloudflare token reaches only the `cloudflare` job's check and the two wrangler deploy steps; both deploy jobs install
with `npm ci --ignore-scripts`.

## Owner steps

- **O1 · A Cloudflare token for CI.**
  1. Cloudflare dashboard → My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers" → Use template.
  2. Account Resources: Include → your account. Zone Resources: Include → All zones from an account → your account.
  3. Change nothing else in the template: add no D1 and no Pages permission (Pages builds from Git). A later owner step adds D1 to this token when a task needs it.
  4. Continue to summary → Create Token → copy it (shown once).
  5. Your account ID: Workers & Pages → Overview, "Account ID" on the right (or `npx wrangler whoami`).
  6. GitHub → `macdarenz-droid/kairos-p1-r17` → Settings → Secrets and variables → Actions → New repository secret: `CLOUDFLARE_API_TOKEN` = the token; again for `CLOUDFLARE_ACCOUNT_ID` = the account ID.
  7. Never paste the token in chat, Relay, code or a Pages variable.
- **O2 · First deploy and the Pages setting** (after the release with T-047a–f is merged into `main`):
  1. With O1 done before the merge, CI's job "deploy kairos-api (main)" deploys by itself. With O1 done later: GitHub → Actions → CI → Run workflow → branch `main` → Run workflow.
  2. The job's summary says "kairos-api is live at https://kairos-api.<subdomain>.workers.dev". Keep that address.
  3. Worker secret: Cloudflare → Workers & Pages → `kairos-api` → Settings → Variables and Secrets → Add → Type **Secret** (not Text: a deploy removes Text values set in the dashboard) → Name `KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` → Value: exactly the Pages variable `VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI` (a public key; it is stored as a secret only so deploys keep it) → Deploy. If Pages shows that variable as encrypted, ask the supervisor for the value: it is public, and it is inside the live app's code (the supervisor reads it from https://kairos-p1-r17.pages.dev). Paste it with no spaces or line breaks.
  4. Pages: Workers & Pages → `kairos-p1-r17` → Settings → Variables and Secrets → Production → Add `VITE_KAIROS_API_URL` = the address from step 2, nothing after `.dev` → Save → Deployments → the latest production deployment → Retry deployment (VITE_ values are read when the app is built).
  5. Check: Kairos → More → Profile → "Check online services" → "Online services are working. This device is recognised." Or `curl -H 'Origin: https://kairos-p1-r17.pages.dev' https://kairos-api.<subdomain>.workers.dev/health` shows `"ok":true` and `"deviceKey":"ready"`.
- **O10 · Workers Paid** (before the first product route goes live, P16.A1 or P34; recommended: yes):
  1. Why: on the Workers Free plan the whole Cloudflare account gets 100,000 requests a day, and `kairos-api` shares them with `kairos-activation` (preflights and refused calls count too). One runaway device at its limit of 120 a minute could use the whole day's budget; Cloudflare then answers "error 1027" until midnight UTC, and new devices cannot activate either. Until you switch, everything works; only this risk remains.
  2. Cloudflare dashboard → Workers & Pages → Plans → choose Workers Paid and confirm the payment (USD 5 a month; 10 million requests a month included; higher KV and CPU limits).
  3. Nothing else changes: no deploy, no setting, no code. (The app never retries on its own; a retry is always the trader's tap.)

Setting a provider key later: in `app/backend/kairos-api`, `npm ci`, then `npx wrangler secret put <NAME>` and paste the key
when asked (or the dashboard, type Secret).
