import type { MarketType, TradeExecutionRecord, TradeRecord } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryResult } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketDataUnavailableWhy } from '../../services/market-data/marketDataTypes';
import { describeCandleSource, describeFuturesOnlyNotListed, describeFuturesOnlySource, futuresOnlyMarket, matchCryptoMarket, matchNoteFor } from '../market-reference/cryptoMarket';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Picture timeframes, smallest first, with their candle length. Neighbours are at most 3× apart (T-039d). */
export const TRADE_PICTURE_INTERVALS = Object.freeze([
  Object.freeze({ interval: '1m', ms: MINUTE_MS }),
  Object.freeze({ interval: '3m', ms: 3 * MINUTE_MS }),
  Object.freeze({ interval: '5m', ms: 5 * MINUTE_MS }),
  Object.freeze({ interval: '15m', ms: 15 * MINUTE_MS }),
  Object.freeze({ interval: '30m', ms: 30 * MINUTE_MS }),
  Object.freeze({ interval: '1h', ms: HOUR_MS }),
  Object.freeze({ interval: '2h', ms: 2 * HOUR_MS }),
  Object.freeze({ interval: '4h', ms: 4 * HOUR_MS }),
  Object.freeze({ interval: '6h', ms: 6 * HOUR_MS }),
  Object.freeze({ interval: '8h', ms: 8 * HOUR_MS }),
  Object.freeze({ interval: '12h', ms: 12 * HOUR_MS }),
  Object.freeze({ interval: '1d', ms: DAY_MS }),
  Object.freeze({ interval: '3d', ms: 3 * DAY_MS }),
  Object.freeze({ interval: '1w', ms: 7 * DAY_MS }),
] as const);

/** A picture window holds at most this many candles, so a body is at least 4 units wide (T-039d). */
export const TRADE_PICTURE_MAX_WINDOW_CANDLES = 48;
export const TRADE_PICTURE_PADDING_FRACTION = 0.2;
export const TRADE_PICTURE_MIN_PADDING_CANDLES = 3;

/** Journal symbols may be typed as "BTC/USDT" or "btc-usdt"; Binance Spot symbols have no separators. */
export function normalizeTradeSymbol(symbol: string): string {
  return symbol.replace(/[/\-\s]/g, '').toUpperCase();
}

/**
 * P31/P32: whether Kairos has a candle source for this market, for the trade picture and the Analysis market chart.
 * Forex and stocks have none yet: no keyless browser source gives clean candles for them (D99, D106). Every other market asks as before, by symbol.
 */
export function tradePictureHasCandleSource(marketType: MarketType): boolean {
  return marketType !== 'forex' && marketType !== 'stock';
}

export interface TradePictureCandleWindow {
  readonly interval: (typeof TRADE_PICTURE_INTERVALS)[number]['interval'];
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  /** Candles in the padded window plus one, so the request covers it end to end. */
  readonly limit: number;
}

/**
 * The picture window: the trade padded by max(20% of its length, 3 candles) on
 * each side, on the smallest timeframe whose whole window holds at most
 * TRADE_PICTURE_MAX_WINDOW_CANDLES candles (1w when none does). Null when the
 * trade has no start or ends before it starts.
 */
export function planTradePictureCandleWindow(startMs: number, endMs: number): TradePictureCandleWindow | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  const length = endMs - startMs;
  const windowFor = (choice: (typeof TRADE_PICTURE_INTERVALS)[number]): TradePictureCandleWindow => {
    const padding = Math.max(length * TRADE_PICTURE_PADDING_FRACTION, TRADE_PICTURE_MIN_PADDING_CANDLES * choice.ms);
    const startTimeMs = Math.floor(startMs - padding), endTimeMs = Math.ceil(endMs + padding);
    return Object.freeze({ interval: choice.interval, startTimeMs, endTimeMs, limit: Math.ceil((endTimeMs - startTimeMs) / choice.ms) + 1 });
  };
  for (const choice of TRADE_PICTURE_INTERVALS) {
    const window = windowFor(choice);
    if (window.limit <= TRADE_PICTURE_MAX_WINDOW_CANDLES) return window;
  }
  return windowFor(TRADE_PICTURE_INTERVALS[TRADE_PICTURE_INTERVALS.length - 1]);
}

const parseMs = (iso: string | null | undefined): number | null => {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/** Start: first entry fill, else opened. End: last exit fill, else closed, else now. */
export function tradePictureTimes(trade: TradeRecord, executions: readonly TradeExecutionRecord[], nowMs: number): { readonly startMs: number | null; readonly endMs: number } {
  const entries = executions.filter(fill => fill.type === 'entry').map(fill => parseMs(fill.executedAt)).filter((ms): ms is number => ms !== null);
  const exits = executions.filter(fill => fill.type === 'exit').map(fill => parseMs(fill.executedAt)).filter((ms): ms is number => ms !== null);
  return {
    startMs: entries.length > 0 ? Math.min(...entries) : parseMs(trade.openedAt),
    endMs: exits.length > 0 ? Math.max(...exits) : parseMs(trade.closedAt) ?? nowMs,
  };
}

export interface TradePictureCandleDeps {
  /** The Binance Spot venue the metadata port lists (the composition root picks the provider). */
  readonly venue: string;
  readonly history: MarketCandleHistoryPort;
  /** Known market list; a symbol that does not match a market on it is never requested. */
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
  readonly nowMs?: () => number;
  readonly signal?: AbortSignal;
}

/** The USDⓈ-M futures venue the history port serves for futures trades (D165). */
const FUTURES_VENUE = 'binance-usdm';

export type TradePictureCandlesFailure = 'no-candle-source' | 'no-start' | 'not-listed' | 'no-candles' | MarketDataUnavailableWhy;

export type TradePictureCandlesResult =
  | Readonly<{ ok: true; candles: readonly MarketCandle[]; source: string; note: string | null }>
  | Readonly<{ ok: false; why: TradePictureCandlesFailure; retryAfterSeconds: number | null; note: string | null }>;

type TradePictureCandlesSuccess = Extract<TradePictureCandlesResult, { ok: true }>;

// Session-only memory (D15): candles are market reference, never stored in IndexedDB. Only successes are kept.
const cache = new Map<string, TradePictureCandlesSuccess>();

export function resetTradePictureCandleCache(): void {
  cache.clear();
}

const failed = (why: TradePictureCandlesFailure, retryAfterSeconds: number | null = null, note: string | null = null): TradePictureCandlesResult =>
  Object.freeze({ ok: false as const, why, retryAfterSeconds, note });

/** A port failure's reason: the typed one when the port gave it, else "the source didn't answer". */
const unavailable = (result: { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null }, note: string | null = null): TradePictureCandlesResult =>
  result.reason === 'unavailable' && result.why !== undefined ? failed(result.why, result.retryAfterSeconds ?? null, note) : failed('source-down', null, note);

/**
 * A futures market on no spot list (D171): its own name on USDⓈ-M, with no pair (so no backup source).
 * Binance's "no such market" and a source without futures candles read as not listed, with the reason.
 */
async function loadFuturesOnlyCandles(
  symbol: string, spotNote: string, typed: string, window: TradePictureCandleWindow, deps: TradePictureCandleDeps, options: { readonly signal?: AbortSignal } | undefined,
): Promise<TradePictureCandlesResult> {
  const key = [symbol, 'futures-only', window.interval, window.startTimeMs, window.endTimeMs].join('|');
  const stored = cache.get(key);
  if (stored) return stored;
  const result = await deps.history.acquireHistory({
    instrument: { venue: FUTURES_VENUE, symbol },
    interval: window.interval,
    limit: window.limit,
    startTimeMs: window.startTimeMs,
    endTimeMs: window.endTimeMs,
  }, options);
  if (!result.ok) {
    if (result.reason === 'unavailable' && result.why === 'unknown-market') return failed('not-listed', null, describeFuturesOnlyNotListed(typed));
    if (result.reason === 'invalid-request') return failed('not-listed', null, `${spotNote} Futures candles need the Kairos server.`);
    return unavailable(result);
  }
  if (result.snapshot.candles.length === 0) return failed('no-candles');
  const success: TradePictureCandlesSuccess = Object.freeze({ ok: true as const, candles: result.snapshot.candles, source: describeFuturesOnlySource(symbol), note: null });
  cache.set(key, success);
  return success;
}

/**
 * Candles around one trade for its picture, with the line that says where they came from, or why there are none:
 * no candle source for the market, no start time, a market Binance doesn't list, no candles for the time, or the
 * source's own reason. Futures trades ask futures candles, and spot candles once when there is no futures market. It never throws.
 */
export async function loadTradePictureCandles(
  trade: TradeRecord,
  executions: readonly TradeExecutionRecord[],
  deps: TradePictureCandleDeps,
): Promise<TradePictureCandlesResult> {
  try {
    if (!tradePictureHasCandleSource(trade.marketType)) return failed('no-candle-source');
    const nowMs = (deps.nowMs ?? Date.now)();
    const times = tradePictureTimes(trade, executions, nowMs);
    if (times.startMs === null) return failed('no-start');
    const window = planTradePictureCandleWindow(times.startMs, times.endMs);
    if (window === null) return failed('no-start');
    const options = deps.signal ? { signal: deps.signal } : undefined;

    const metadata = await deps.metadata.acquireInstrumentMetadata(options);
    if (!metadata.ok) return unavailable(metadata);
    const match = matchCryptoMarket(trade.symbol, trade.marketType, metadata.facts);
    if (!match.ok) {
      const futuresOnly = match.why === 'not-listed' ? futuresOnlyMarket(trade.symbol, trade.marketType) : null;
      if (futuresOnly === null) return failed('not-listed', null, match.note);
      return loadFuturesOnlyCandles(futuresOnly, match.note, trade.symbol, window, deps, options);
    }

    const key = [match.symbol, match.candles, window.interval, window.startTimeMs, window.endTimeMs].join('|');
    const stored = cache.get(key);
    if (stored) return stored;

    const ask = (venue: string): Promise<MarketCandleHistoryResult> => deps.history.acquireHistory({
      instrument: { venue, symbol: match.symbol },
      interval: window.interval,
      limit: window.limit,
      startTimeMs: window.startTimeMs,
      endTimeMs: window.endTimeMs,
      pair: { base: match.base, quote: match.quote },
    }, options);
    let result = await ask(match.candles === 'usdm-futures' ? FUTURES_VENUE : deps.venue);
    // No futures market (or a source without futures candles): spot candles once, and the source line says so.
    if (match.candles === 'usdm-futures' && !result.ok && ((result.reason === 'unavailable' && result.why === 'unknown-market') || result.reason === 'invalid-request')) {
      result = await ask(deps.venue);
    }
    if (!result.ok) return unavailable(result, match.note);
    if (result.snapshot.candles.length === 0) return failed('no-candles', null, match.note);
    const success: TradePictureCandlesSuccess = Object.freeze({
      ok: true as const,
      candles: result.snapshot.candles,
      source: describeCandleSource(result.snapshot.origin, match, match.candles),
      note: matchNoteFor(match, result.snapshot.origin === undefined || result.snapshot.origin.market === 'spot' ? 'spot' : 'usdm-futures'),
    });
    cache.set(key, success);
    return success;
  } catch {
    return failed('source-down');
  }
}
