# Kairos activation authority

This folder is the source-controlled contract for the server-owned Kairos activation authority.

## Deployment identity

- Worker: `kairos-activation`
- Public endpoint path: `/activate`
- D1 binding: `DB`
- D1 database name: `kairos-activation-db`
- Rate limiter binding: `ACTIVATION_RATE_LIMITER`
- Rate limiter namespace: `7001`
- Rate limit: 10 calls per 60 seconds for each derived pre-activation actor key
- Signing secret name: `KAIROS_ACTIVATION_PRIVATE_KEY`

The private signing key and production invite codes must never be committed here. `wrangler.example.jsonc` intentionally leaves the D1 database UUID as a deployment-supplied value.

## Migration ownership

`migrations/0001_activation_codes.sql` is the historical schema contract for the manually-created production table. Future schema changes must be additive, versioned migration files. Do not rewrite this migration after it becomes authoritative.

Cloudflare records migrations applied through Wrangler in the D1 migrations table. Because production schema V1 was created manually before this source artifact existed, reconcile the migration history deliberately before using `wrangler d1 migrations apply --remote`; do not blindly re-apply migration 0001 to the existing database.

## Rate limiting

The rate limiter is abuse protection only. D1's conditional `UPDATE ... WHERE status='unused'` remains the one-time redemption authority. Activation happens before Kairos has an authenticated user identifier, so the Worker derives a one-way-hashed key from Cloudflare's connecting-network identifier instead of using one global limiter key. This avoids one client exhausting the allowance for all activation attempts while keeping the raw identifier out of the limiter key.

## CORS

Browser access is restricted to the deployed Kairos production origin `https://kairos-p1-r17.pages.dev`. The Worker handles `OPTIONS` preflight for `/activate`, allows only `POST, OPTIONS`, allows only `Accept, Content-Type`, returns `Vary: Origin`, and does not enable credentials. Do not replace the exact origin with `*`. Browser preflight and first activation must be verified end to end after deployment.
