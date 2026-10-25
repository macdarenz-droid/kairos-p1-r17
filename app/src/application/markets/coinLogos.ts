/**
 * T-061f (D272): the one owner of which coin logos this device keeps, and of when Home asks the Kairos server for more.
 *
 * - Kept, in Cache Storage `kairos-coin-logos-v1`: one entry per coin with a logo (`/kairos-coin-logos/coin/<COIN>`, the
 *   data address as text, when it came in a header), read only for the coins shown, kept 30 days; and one small entry
 *   of marks (`/kairos-coin-logos/marks`): coins the server has no logo for (7 days, so their re-ask rarely costs the
 *   news its place, review r1) and "not set up" (a day). The page is the only writer, as for the saved learning sources
 *   (application/library/learningSources.ts); the service worker deletes only its own `kairos-app-shell-*` caches, so an
 *   app update keeps the logos. Once a visit, entries past their time (and any of another shape) are deleted.
 * - Asked: only for coins with nothing kept, at most 30 a call (Home's 30 markets; the first ones the caller names come
 *   first), in requests of at most 10 coins one after another (the server's limit, which keeps its CPU low): up to 3
 *   on a visit whose coins have no logo kept (the first, or a month later), none on most visits, plus one for a coin
 *   that joins the map later. Each request takes one place in Home's shared request budget
 *   (application/online/requestBudget.ts; the minute-by-minute count is in application/markets/marketMoves.ts), so
 *   Home stays inside the server's 30 requests a minute.
 * - Failing, as the coin names (marketApi.ts, T-061e review r2): a failed request keeps no logo. "Not set up" (no
 *   CoinGecko key, O6, or no Kairos server) is kept on the device for a day (review r1: so a load without O6 sends no
 *   request that would hold the news back), and cleared by the next good answer; any other failure for 10 minutes, or
 *   the server's wait if longer; a failure while offline reached no server and is not kept. A cache that cannot be
 *   opened, read or written only means the logos are asked again next visit; every entry is read with the same rule
 *   as the server's answer (parseCoinLogoAddress).
 * Nothing here touches IndexedDB, the journal or a backup: logos are presentation, never saved trading data.
 */
import { COIN_SYMBOL, parseCoinLogoAddress, type CoinLogoAddress } from '../../domain/market/coinLogo';
import type { CoinLogosResult } from '../../services/kairos-api/marketApi';
import type { RequestBudget } from '../online/requestBudget';

export const COIN_LOGOS_CACHE_NAME = 'kairos-coin-logos-v1';
/** Where a coin's logo is kept: its own entry, read only when the coin is shown. */
export const COIN_LOGO_ENTRY_PREFIX = '/kairos-coin-logos/coin/';
/** The small entry of marks: coins with no logo, and "not set up". */
export const COIN_LOGO_MARKS_ENTRY = '/kairos-coin-logos/marks';
const KEPT_AT = 'x-kairos-kept-at';
export const COIN_LOGO_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const COIN_LOGO_NONE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const COIN_LOGOS_NOT_SET_UP_KEEP_MS = 24 * 60 * 60 * 1000;
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
  delete(request: string | Request): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
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

/** The marks entry: when "not set up" was answered (null: not now), and when each coin was answered with no logo. */
interface Marks {
  notSetUpAt: number | null;
  readonly none: Map<string, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const keptAt = (response: Response): number | null => {
  const text = response.headers.get(KEPT_AT) ?? '';
  const at = /^[0-9]{1,16}$/.test(text) ? Number.parseInt(text, 10) : Number.NaN;
  return Number.isSafeInteger(at) ? at : null;
};

/** The marks entry's text, mark by mark: one that breaks the rules is read as missing. */
function readMarks(text: string | null): Marks {
  const marks: Marks = { notSetUpAt: null, none: new Map() };
  if (text === null) return marks;
  let body: unknown;
  try { body = JSON.parse(text); } catch { return marks; }
  if (!isRecord(body)) return marks;
  if (isTime(body.notSetUpAt)) marks.notSetUpAt = body.notSetUpAt;
  if (isRecord(body.none)) for (const [coin, at] of Object.entries(body.none)) if (COIN_SYMBOL.test(coin) && isTime(at)) marks.none.set(coin, at);
  return marks;
}

export function createCoinLogoKeeper({ ask, budget, openCache, now = () => Date.now() }: CoinLogoKeeperOptions): CoinLogoKeeper {
  /** This visit's marks: read from the cache once, then kept up to date here. */
  let marksCopy: Promise<Marks> | null = null;
  /** The logos this visit knows (read from their entries, or answered): coin → when it came and its address. */
  const logos = new Map<string, Readonly<{ storedAt: number; image: CoinLogoAddress }>>();
  /** Coins whose entry this visit has looked up (found or not). */
  const looked = new Set<string>();
  /** No request before this time: the last one failed (Infinity: "not set up", for the visit). */
  let failedUntil = 0;
  let cleaned = false;
  /** One request at a time: a later call waits, then asks only for what is still missing. */
  let turn: Promise<unknown> = Promise.resolve();

  const cache = async (): Promise<CoinLogoCache | null> => {
    if (openCache === null) return null;
    try { return await openCache(); } catch { return null; }
  };
  const loadMarks = (): Promise<Marks> => {
    marksCopy ??= (async () => {
      try {
        const response = await (await cache())?.match(COIN_LOGO_MARKS_ENTRY);
        return readMarks(response === undefined ? null : await response.text());
      } catch {
        return readMarks(null);
      }
    })();
    return marksCopy;
  };
  /** Each coin's own entry, once a visit, only for the coins asked about. */
  const lookUp = async (coins: readonly string[]): Promise<void> => {
    const unread = [...new Set(coins)].filter(coin => COIN_SYMBOL.test(coin) && !looked.has(coin));
    if (unread.length === 0) return;
    for (const coin of unread) looked.add(coin);
    const store = await cache();
    if (store === null) return;
    await Promise.all(unread.map(async coin => {
      try {
        const response = await store.match(`${COIN_LOGO_ENTRY_PREFIX}${coin}`);
        if (response === undefined) return;
        const storedAt = keptAt(response);
        const image = parseCoinLogoAddress(await response.text());
        if (storedAt !== null && image !== null && !logos.has(coin)) logos.set(coin, Object.freeze({ storedAt, image }));
      } catch { /* read as missing */ }
    }));
  };
  const fresh = (at: number, storedAt: number | undefined | null, keepMs: number): boolean =>
    storedAt !== undefined && storedAt !== null && at - storedAt >= 0 && at - storedAt < keepMs;
  const shown = (coins: readonly string[]): ReadonlyMap<string, CoinLogoAddress> => {
    const at = now();
    const found = new Map<string, CoinLogoAddress>();
    for (const coin of coins) {
      const logo = logos.get(coin);
      if (logo !== undefined && fresh(at, logo.storedAt, COIN_LOGO_KEEP_MS)) found.set(coin, logo.image);
    }
    return found;
  };
  const writeMarks = async (marks: Marks): Promise<void> => {
    const at = now();
    const none = Object.fromEntries([...marks.none].filter(([, noneAt]) => fresh(at, noneAt, COIN_LOGO_NONE_KEEP_MS)));
    try {
      await (await cache())?.put(COIN_LOGO_MARKS_ENTRY, new Response(JSON.stringify({ notSetUpAt: marks.notSetUpAt, none }), { headers: { 'content-type': 'application/json' } }));
    } catch { /* A mark that cannot be kept is only a request on the next visit. */ }
  };
  const writeLogo = async (coin: string, image: CoinLogoAddress, storedAt: number): Promise<void> => {
    try {
      await (await cache())?.put(`${COIN_LOGO_ENTRY_PREFIX}${coin}`, new Response(image, { headers: { 'content-type': 'text/plain', [KEPT_AT]: String(storedAt) } }));
    } catch { /* A logo that cannot be kept is only a request on the next visit. */ }
  };
  /** Once a visit: deletes coin entries past 30 days, and any entry of another shape (an older layout). */
  const clean = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    const store = await cache();
    if (store === null) return;
    try {
      const at = now();
      for (const request of await store.keys()) {
        const path = new URL(request.url).pathname;
        if (path === COIN_LOGO_MARKS_ENTRY) continue;
        const coin = path.startsWith(COIN_LOGO_ENTRY_PREFIX) ? path.slice(COIN_LOGO_ENTRY_PREFIX.length) : null;
        const response = coin !== null && COIN_SYMBOL.test(coin) ? await store.match(path) : undefined;
        if (response === undefined || !fresh(at, keptAt(response), COIN_LOGO_KEEP_MS)) await store.delete(request);
      }
    } catch { /* Tidying up can wait for the next visit. */ }
  };

  /** One request for these coins (at most 10), in one place of Home's budget; whether to go on with the next. */
  const askOnce = async (marks: Marks, batch: readonly string[], signal: AbortSignal | undefined): Promise<boolean> => {
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
      if (result.why === 'not-set-up') {
        failedUntil = Number.POSITIVE_INFINITY;
        marks.notSetUpAt = now();
        await writeMarks(marks);
      } else {
        failedUntil = now() + Math.max(COIN_LOGOS_FAILURE_KEEP_MS, (result.retryAfterSeconds ?? 0) * 1000);
      }
      return false;
    }
    // Every coin asked is kept: its logo (its own entry), or "none" (a mark) for 7 days. A good answer clears "not set up".
    const storedAt = now();
    const writes: Promise<void>[] = [];
    for (const coin of batch) {
      const image = result.logos.get(coin);
      if (image === undefined) { marks.none.set(coin, storedAt); continue; }
      marks.none.delete(coin);
      logos.set(coin, Object.freeze({ storedAt, image }));
      writes.push(writeLogo(coin, image, storedAt));
    }
    marks.notSetUpAt = null;
    await Promise.all([...writes, writeMarks(marks)]);
    return true;
  };

  const request = async (coins: readonly string[], signal: AbortSignal | undefined): Promise<ReadonlyMap<string, CoinLogoAddress>> => {
    const marks = await loadMarks();
    await lookUp(coins);
    const at = now();
    if (fresh(at, marks.notSetUpAt, COIN_LOGOS_NOT_SET_UP_KEEP_MS)) failedUntil = Math.max(failedUntil, marks.notSetUpAt! + COIN_LOGOS_NOT_SET_UP_KEEP_MS);
    const missing = [...new Set(coins)].filter(coin => COIN_SYMBOL.test(coin) && !fresh(at, logos.get(coin)?.storedAt, COIN_LOGO_KEEP_MS)
      && !fresh(at, marks.none.get(coin), COIN_LOGO_NONE_KEEP_MS)).slice(0, COIN_LOGOS_PER_CALL);
    for (let start = 0; start < missing.length; start += COIN_LOGOS_PER_REQUEST) {
      if (now() < failedUntil || signal?.aborted) break;
      if (!(await askOnce(marks, missing.slice(start, start + COIN_LOGOS_PER_REQUEST), signal))) break;
    }
    await clean();
    return shown(coins);
  };

  return Object.freeze({
    async kept(coins: readonly string[]) {
      await lookUp(coins);
      return shown(coins);
    },
    logos(coins: readonly string[], options?: Readonly<{ signal?: AbortSignal }>) {
      const mine = turn.then(() => request(coins, options?.signal));
      turn = mine.catch(() => undefined);
      return mine;
    },
  });
}
