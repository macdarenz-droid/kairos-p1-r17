/**
 * T-061f (D272): the one owner of which coin logos this device keeps, and of when Home asks the Kairos server for more.
 *
 * - Kept: by coin, 30 days, in Cache Storage `kairos-coin-logos-v1`. The page is its only writer, as for the saved
 *   learning sources (application/library/learningSources.ts); the service worker deletes only its own
 *   `kairos-app-shell-*` caches, so an app update keeps the logos. A coin the server has no logo for is kept as "none"
 *   for a day, so it is not asked on every visit.
 * - Asked: only for coins with nothing kept, at most 30 a call (Home's 30 markets; the first ones the caller names come
 *   first), in requests of at most 10 coins one after another (the server's limit, which keeps its CPU low): up to 3
 *   on a visit whose coins have no logo kept (the first, or a month later), none on most visits, plus one for a coin
 *   that joins the map later. Each request takes one place in Home's shared request budget
 *   (application/online/requestBudget.ts; the minute-by-minute count is in application/markets/marketMoves.ts), so
 *   Home stays inside the server's 30 requests a minute.
 * - Failing, as the coin names (marketApi.ts, T-061e review r2): a failed request keeps no logo. "Not set up" (no
 *   CoinGecko key, O6, or no Kairos server) stops asking for the visit; any other failure for 10 minutes, or the
 *   server's wait if longer; a failure while offline reached no server and is not kept. A cache that cannot be opened,
 *   read or written only means the logos are asked again next visit; the copy is read with the same rule as the
 *   server's answer (parseCoinLogoAddress).
 * Nothing here touches IndexedDB, the journal or a backup: logos are presentation, never saved trading data.
 */
import { COIN_SYMBOL, parseCoinLogoAddress, type CoinLogoAddress } from '../../domain/market/coinLogo';
import type { CoinLogosResult } from '../../services/kairos-api/marketApi';
import type { RequestBudget } from '../online/requestBudget';

export const COIN_LOGOS_CACHE_NAME = 'kairos-coin-logos-v1';
/** The one entry that holds every kept logo. */
const KEPT_ENTRY = '/kairos-coin-logos/kept';
export const COIN_LOGO_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const COIN_LOGO_NONE_KEEP_MS = 24 * 60 * 60 * 1000;
/** At most this many coins are kept (the newest); Home shows 30. */
export const COIN_LOGOS_KEPT_MAX = 100;
/** One request names at most this many coins (the server's limit). */
export const COIN_LOGOS_PER_REQUEST = 10;
/** One call asks for at most this many coins (Home's 30 markets): at most 3 requests. */
export const COIN_LOGOS_PER_CALL = 30;
/** A failed request (not "not set up", not offline) is not repeated for this long, or the server's wait if longer. */
export const COIN_LOGOS_FAILURE_KEEP_MS = 10 * 60 * 1000;

/** The calls on a Cache Storage cache this owner uses. */
export interface CoinLogoCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

/** The one request for these coins' logos (the Kairos server's /market/coin-logos). */
export type CoinLogoAsk = (coins: readonly string[], options?: Readonly<{ signal?: AbortSignal }>) => Promise<CoinLogosResult>;

export interface CoinLogoKeeperOptions {
  readonly ask: CoinLogoAsk;
  /** Home's shared request budget on the Kairos server; null: none (straight to Binance, or a test). */
  readonly budget: RequestBudget | null;
  /** null: this browser has no Cache Storage (the logos then last this visit only). */
  readonly openCache: (() => Promise<CoinLogoCache>) | null;
  readonly now?: () => number;
}

export interface CoinLogoKeeper {
  /** The logos kept on this device for these coins; never a request. */
  kept(coins: readonly string[]): Promise<ReadonlyMap<string, CoinLogoAddress>>;
  /** The kept logos, after one request for the coins with nothing kept (unless a failure is still kept, above). */
  logos(coins: readonly string[], options?: Readonly<{ signal?: AbortSignal }>): Promise<ReadonlyMap<string, CoinLogoAddress>>;
}

/** The real device: Cache Storage `kairos-coin-logos-v1`, or null when the browser has none. */
export function browserCoinLogoCache(): (() => Promise<CoinLogoCache>) | null {
  const storage = globalThis.caches;
  return storage === undefined ? null : () => storage.open(COIN_LOGOS_CACHE_NAME);
}

type Kept = Readonly<{ storedAt: number; image: CoinLogoAddress | null }>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The kept copy's text, coin by coin: a coin whose entry breaks the rules is read as missing. */
function readKept(text: string | null): Map<string, Kept> {
  const kept = new Map<string, Kept>();
  if (text === null) return kept;
  let body: unknown;
  try { body = JSON.parse(text); } catch { return kept; }
  if (!isRecord(body) || !isRecord(body.logos)) return kept;
  for (const [coin, entry] of Object.entries(body.logos)) {
    if (!COIN_SYMBOL.test(coin) || !isRecord(entry) || typeof entry.storedAt !== 'number' || !Number.isSafeInteger(entry.storedAt)) continue;
    const image = entry.image === null ? null : parseCoinLogoAddress(entry.image);
    if (entry.image !== null && image === null) continue;
    kept.set(coin, Object.freeze({ storedAt: entry.storedAt, image }));
  }
  return kept;
}

export function createCoinLogoKeeper({ ask, budget, openCache, now = () => Date.now() }: CoinLogoKeeperOptions): CoinLogoKeeper {
  /** This visit's copy: read from the cache once, then kept up to date here. */
  let copy: Promise<Map<string, Kept>> | null = null;
  /** No request before this time: the last one failed (Infinity: "not set up", for the visit). */
  let failedUntil = 0;
  /** One request at a time: a later call waits, then asks only for what is still missing. */
  let turn: Promise<unknown> = Promise.resolve();

  const load = (): Promise<Map<string, Kept>> => {
    copy ??= (async () => {
      if (openCache === null) return new Map<string, Kept>();
      try {
        const response = await (await openCache()).match(KEPT_ENTRY);
        return readKept(response === undefined ? null : await response.text());
      } catch {
        return new Map<string, Kept>();
      }
    })();
    return copy;
  };
  const fresh = (entry: Kept | undefined, at: number): entry is Kept => {
    if (entry === undefined) return false;
    const age = at - entry.storedAt;
    return age >= 0 && age < (entry.image === null ? COIN_LOGO_NONE_KEEP_MS : COIN_LOGO_KEEP_MS);
  };
  const shown = (kept: ReadonlyMap<string, Kept>, coins: readonly string[]): ReadonlyMap<string, CoinLogoAddress> => {
    const at = now();
    const logos = new Map<string, CoinLogoAddress>();
    for (const coin of coins) {
      const entry = kept.get(coin);
      if (fresh(entry, at) && entry.image !== null) logos.set(coin, entry.image);
    }
    return logos;
  };
  /** The copy as it is now, without what has expired, at most COIN_LOGOS_KEPT_MAX coins (the newest). */
  const write = async (kept: ReadonlyMap<string, Kept>): Promise<void> => {
    if (openCache === null) return;
    const at = now();
    const entries = [...kept].filter(([, entry]) => fresh(entry, at)).sort(([, a], [, b]) => b.storedAt - a.storedAt).slice(0, COIN_LOGOS_KEPT_MAX);
    try {
      await (await openCache()).put(KEPT_ENTRY, new Response(JSON.stringify({ logos: Object.fromEntries(entries) }), { headers: { 'content-type': 'application/json' } }));
    } catch { /* A copy that cannot be kept is only a request on the next visit. */ }
  };

  /** One request for these coins (at most 10), in one place of Home's budget; whether to go on with the next. */
  const askOnce = async (kept: Map<string, Kept>, batch: readonly string[], signal: AbortSignal | undefined): Promise<boolean> => {
    // Given up before it was sent (the screen closed): nothing is counted or kept.
    if (budget !== null) {
      if (!(await budget.take(1, signal))) return false;
      if (signal?.aborted) { budget.refund(1); return false; }
    }
    let result: CoinLogosResult;
    try {
      result = await ask([...batch].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), signal === undefined ? undefined : { signal });
    } catch {
      result = Object.freeze({ ok: false as const, reason: 'unavailable' as const, why: 'source-down' as const, retryAfterSeconds: null });
    }
    if (!result.ok) {
      // Stopped on its way by the screen closing, or offline (no server reached): asked again on the next call.
      if (signal?.aborted || result.why === 'offline') return false;
      failedUntil = result.why === 'not-set-up' ? Number.POSITIVE_INFINITY : now() + Math.max(COIN_LOGOS_FAILURE_KEEP_MS, (result.retryAfterSeconds ?? 0) * 1000);
      return false;
    }
    // Every coin asked is kept: its logo, or "none" for a day.
    const storedAt = now();
    for (const coin of batch) kept.set(coin, Object.freeze({ storedAt, image: result.logos.get(coin) ?? null }));
    await write(kept);
    return true;
  };

  const request = async (coins: readonly string[], signal: AbortSignal | undefined): Promise<ReadonlyMap<string, CoinLogoAddress>> => {
    const kept = await load();
    const at = now();
    const missing = [...new Set(coins)].filter(coin => COIN_SYMBOL.test(coin) && !fresh(kept.get(coin), at)).slice(0, COIN_LOGOS_PER_CALL);
    for (let start = 0; start < missing.length; start += COIN_LOGOS_PER_REQUEST) {
      if (now() < failedUntil || signal?.aborted) break;
      if (!(await askOnce(kept, missing.slice(start, start + COIN_LOGOS_PER_REQUEST), signal))) break;
    }
    return shown(kept, coins);
  };

  return Object.freeze({
    async kept(coins: readonly string[]) {
      return shown(await load(), coins);
    },
    logos(coins: readonly string[], options?: Readonly<{ signal?: AbortSignal }>) {
      const mine = turn.then(() => request(coins, options?.signal));
      turn = mine.catch(() => undefined);
      return mine;
    },
  });
}
