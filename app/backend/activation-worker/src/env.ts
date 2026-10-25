/**
 * Everything the activation Worker gets from Cloudflare, by the names wrangler.jsonc gives them. The signing key is a
 * Worker secret the owner sets (`npx wrangler secret put KAIROS_ACTIVATION_PRIVATE_KEY`); it is never in git, answers or logs.
 */
/** A Workers rate-limit binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ActivationEnv {
  /** vars: the app's exact https origins, comma-separated. A request with any other Origin gets 403 before any work. */
  readonly KAIROS_APP_ORIGINS?: string;
  /** secret: the ECDSA P-256 private key (base64 PKCS#8) that signs receipts. Its public half is the app's VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI. */
  readonly KAIROS_ACTIVATION_PRIVATE_KEY?: string;
  /** D1 `kairos-activation-db`: one row per invite code, stored only as the SHA-256 of its text (migrations/). */
  readonly DB: D1Database;
  /** 10 tries a minute per hashed network address (namespace 7001). Abuse protection only; D1 decides whether a code is used. */
  readonly ACTIVATION_RATE_LIMITER: RateLimiter;
}
