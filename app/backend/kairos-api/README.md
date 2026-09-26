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

See below (T-047d).
