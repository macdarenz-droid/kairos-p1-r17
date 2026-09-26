/**
 * U1: everything the Kairos server gets from Cloudflare, by the names wrangler.jsonc gives them. Secrets are set by the
 * owner with `npx wrangler secret put <NAME>` and are never in git, answers, logs or VITE_ settings.
 */
/** The KV namespace for long-lived answers (binding KAIROS_API_CACHE); only the calls Kairos uses. */
export interface KvStore {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

/** A Workers rate-limit binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface KairosApiEnv {
  /** vars: the app's exact origins, comma-separated (CORS and the origin check). */
  readonly KAIROS_APP_ORIGINS?: string;
  /** vars: which Worker this is: "production" in wrangler.jsonc; CI's preview deploy sets "preview" (--var KAIROS_API_ROLE:preview). A scheduled job runs only on "production" (P34). */
  readonly KAIROS_API_ROLE?: string;
  /** secret: the activation public key (base64 SPKI), the same public value as the Pages setting VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI. */
  readonly KAIROS_ACTIVATION_PUBLIC_KEY_SPKI?: string;
  readonly KAIROS_API_CACHE?: KvStore;
  readonly KAIROS_API_DEVICE_LIMITER?: RateLimiter;
  readonly KAIROS_API_ANONYMOUS_LIMITER?: RateLimiter;
}
