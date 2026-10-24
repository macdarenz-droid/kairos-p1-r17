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
  /** vars: "okx" lets /market/candles ask OKX when Binance fails; anything else, or missing, means no backup. */
  readonly KAIROS_MARKET_BACKUP?: string;
  /** vars: "oanda-practice" or "oanda-live", the OANDA account the forex token belongs to (U10, D231); anything else, or missing, means no forex candles. */
  readonly KAIROS_FOREX_SOURCE?: string;
  /** secret: the owner's OANDA API token (O4a), sent only as OANDA's Bearer header. */
  readonly MARKET_DATA_API_KEY?: string;
  /** secret: the owner's CoinGecko key (O6), sent only as CoinGecko's key header; without it there are no coin names (U14, D255). */
  readonly COIN_DATA_API_KEY?: string;
  /** vars: "pro" for a paid CoinGecko key; anything else, or missing, means the demo plan (D255). */
  readonly COIN_DATA_PLAN?: string;
  readonly KAIROS_API_CACHE?: KvStore;
  readonly KAIROS_API_DEVICE_LIMITER?: RateLimiter;
  readonly KAIROS_API_ANONYMOUS_LIMITER?: RateLimiter;
}
