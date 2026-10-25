import { parseDecimalString, type DecimalString } from '../../../../domain/trades';
import type { MarketDataUnavailable, MarketDataUnavailableWhy } from '../../marketDataTypes';
import { MARKET_MOVES_MAX_SYMBOLS, type MarketMove, type MarketMovesPort, type MarketMovesResult, type MarketMovesWindow } from '../../MarketMovesPort';

/**
 * T-061e (D271): Binance Spot's rolling-window ticker on the public market-data host, read straight from the browser
 * when the build has no Kairos server. `GET /api/v3/ticker?symbols=[…]&windowSize=1h|7d&type=MINI` (checked
 * 2026-10-25): weight 4 a symbol, capped at 200, at most 100 symbols. Transport, strict decoding and what Binance's
 * answer means; no cadence, no move, no product rule.
 */
export const BINANCE_SPOT_ROLLING_WINDOW_URL = 'https://data-api.binance.vision/api/v3/ticker' as const;
/** Binance's code for "Invalid symbol." */
const INVALID_SYMBOL = -1121;

export interface BinanceSpotMovesPortOptions {
  readonly fetchImpl?: typeof fetch;
  /** The device clock: the source's read time is when its answer came. */
  readonly now?: () => number;
  readonly isOnline?: () => boolean;
}

/** The request address: the symbols as Binance's JSON list, in the order given. */
export function binanceSpotRollingWindowUrl(symbols: readonly string[], window: MarketMovesWindow): string {
  return `${BINANCE_SPOT_ROLLING_WINDOW_URL}?symbols=${encodeURIComponent(JSON.stringify(symbols))}&windowSize=${window}&type=MINI`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Price text exactly as sent, never negative; anything else is unreadable. */
const priceText = (value: unknown): DecimalString | null => {
  if (typeof value !== 'string') return null;
  const parsed = parseDecimalString(value);
  return parsed.ok && parsed.value === value && !value.startsWith('-') ? parsed.value : null;
};

/** Binance's rows as moves in the requested order; null unless every requested symbol is there exactly once and nothing else. */
export function decodeBinanceSpotRollingWindow(text: string, requested: readonly string[]): readonly MarketMove[] | null {
  let body: unknown;
  try { body = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(body) || body.length !== requested.length) return null;
  const bySymbol = new Map<string, MarketMove>();
  for (const item of body as unknown[]) {
    if (!isRecord(item) || typeof item.symbol !== 'string' || !requested.includes(item.symbol) || bySymbol.has(item.symbol)) return null;
    const open = priceText(item.openPrice), last = priceText(item.lastPrice);
    if (open === null || last === null) return null;
    bySymbol.set(item.symbol, Object.freeze({ symbol: item.symbol, open, last }));
  }
  return Object.freeze(requested.map(symbol => bySymbol.get(symbol) as MarketMove));
}

const unavailable = (why: MarketDataUnavailableWhy, retryAfterSeconds: number | null = null): MarketDataUnavailable =>
  Object.freeze({ ok: false as const, reason: 'unavailable' as const, why, retryAfterSeconds });
const wholeSeconds = (retryAfter: string | null): number | null =>
  retryAfter !== null && /^[0-9]{1,6}$/.test(retryAfter.trim()) ? parseInt(retryAfter.trim(), 10) : null;

/** What a failed Binance answer means: no such market, a refused place, a request to wait, or no answer. */
function failureOf(status: number, body: string, retryAfter: string | null): MarketDataUnavailable {
  if (status === 400) {
    try { if ((JSON.parse(body) as { code?: unknown }).code === INVALID_SYMBOL) return unavailable('unknown-market'); } catch { /* not Binance's error shape */ }
  }
  if (status === 451 || status === 403) return unavailable('region');
  if (status === 429 || status === 418) return unavailable('busy', wholeSeconds(retryAfter));
  return unavailable('source-down');
}

export function createBinanceSpotMovesPort(options: BinanceSpotMovesPortOptions = {}): MarketMovesPort {
  const now = options.now ?? (() => Date.now());
  const isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false);
  const port: MarketMovesPort = {
    async acquireMoves({ symbols, window }, callerOptions): Promise<MarketMovesResult> {
      const signal = callerOptions?.signal;
      const lost = () => unavailable(isOnline() ? 'source-down' : 'offline');
      const moves: MarketMove[] = [];
      for (let start = 0; start < symbols.length; start += MARKET_MOVES_MAX_SYMBOLS) {
        const batch = symbols.slice(start, start + MARKET_MOVES_MAX_SYMBOLS);
        if (signal?.aborted) return lost();
        let status: number, body: string, retryAfter: string | null;
        try {
          // The fetch is looked up at call time, so a page that never reads moves never touches it.
          const response = await (options.fetchImpl ?? globalThis.fetch)(binanceSpotRollingWindowUrl(batch, window), { method: 'GET', signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
          status = response.status;
          retryAfter = response.headers.get('Retry-After');
          body = await response.text();
        } catch {
          return lost();
        }
        if (status !== 200) return failureOf(status, body, retryAfter);
        const decoded = decodeBinanceSpotRollingWindow(body, batch);
        if (decoded === null) return unavailable('unreadable');
        moves.push(...decoded);
      }
      return Object.freeze({ ok: true as const, observedAt: new Date(now()).toISOString(), moves: Object.freeze(moves) });
    },
  };
  return Object.freeze(port);
}
