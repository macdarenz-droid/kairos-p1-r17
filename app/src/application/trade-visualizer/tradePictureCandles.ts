import type { MarketType, TradeExecutionRecord, TradeRecord } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryResult } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketDataUnavailableWhy } from '../../services/market-data/marketDataTypes';
import { describeCandleSource, describeFuturesOnlyNotListed, describeFuturesOnlySource, futuresOnlyMarket, matchCryptoMarket, matchNoteFor } from '../market-reference/cryptoMarket';
import { forexCandleInstrument, parseForexPair, type ForexPair } from '../markets/forexPair';
import type { MarketSourceWords } from '../online/onlineWords';

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

export type TradePictureInterval = (typeof TRADE_PICTURE_INTERVALS)[number]['interval'];

const INTERVAL_WORDS: Readonly<Record<TradePictureInterval, string>> = Object.freeze({
  '1m': '1-minute candles', '3m': '3-minute candles', '5m': '5-minute candles', '15m': '15-minute candles', '30m': '30-minute candles',
  '1h': '1-hour candles', '2h': '2-hour candles', '4h': '4-hour candles', '6h': '6-hour candles', '8h': '8-hour candles', '12h': '12-hour candles',
  '1d': '1-day candles', '3d': '3-day candles', '1w': '1-week candles',
});

/** "15-minute candles": the candle size in words, for the picture and the share card. */
export function describeTradePictureInterval(interval: TradePictureInterval): string {
  return INTERVAL_WORDS[interval];
}

/** The length of one candle of `interval`. */
export function tradePictureIntervalMs(interval: TradePictureInterval): number {
  return TRADE_PICTURE_INTERVALS.find(choice => choice.interval === interval)!.ms;
}

/** A picture window holds at most this many candles, so a body is at least 4 units wide (T-039d). */
export const TRADE_PICTURE_MAX_WINDOW_CANDLES = 48;
export const TRADE_PICTURE_PADDING_FRACTION = 0.2;
export const TRADE_PICTURE_MIN_PADDING_CANDLES = 3;

/** OANDA has no 3-day candles (D232): a forex window that would take 3 days takes 1 week. */
export const FOREX_PICTURE_INTERVALS = Object.freeze(TRADE_PICTURE_INTERVALS.filter(choice => choice.interval !== '3d'));

export type TradePictureCandleSource = 'crypto' | 'forex';

/**
 * U10 (D235): where a trade's candles come from, for the trade picture, the Analysis market chart and Replay. Forex
 * pairs and metals that parseForexPair reads come from OANDA through the Kairos server ('forex'); stocks have no source
 * yet (D233), nor has a forex symbol that is not a pair. Every other market asks Binance as before, by symbol ('crypto').
 */
export function tradePictureCandleSource(marketType: MarketType, symbol: string): TradePictureCandleSource | null {
  if (marketType === 'stock') return null;
  if (marketType === 'forex') return forexCandleInstrument(symbol) === null ? null : 'forex';
  return 'crypto';
}

/** Why a trade has no candles when its market has no source: the card's sentence (D233, D235). */
export function describeNoCandleSource(marketType: MarketType): string {
  return marketType === 'forex' ? 'Forex candles need a six-letter pair, such as EURUSD or XAUUSD.' : 'Candles are shown for crypto and forex trades for now.';
}

/** A planned trade (D212): the recent market on 15-minute candles, 36 up to now, and room for 12 more on the right for its boxes. */
export const TRADE_PICTURE_PLANNED_INTERVAL = '15m' satisfies TradePictureInterval;
export const TRADE_PICTURE_PLANNED_CANDLES = 36;
export const TRADE_PICTURE_PLANNED_ROOM_CANDLES = 12;

export interface TradePictureCandleWindow {
  readonly interval: TradePictureInterval;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  /** Candles in the padded window plus one, so the request covers it end to end. */
  readonly limit: number;
}

/**
 * The picture window: the trade padded by max(20% of its length, 3 candles) on
 * each side, on the smallest timeframe whose whole window holds at most
 * TRADE_PICTURE_MAX_WINDOW_CANDLES candles (the largest when none does). Null when the
 * trade has no start or ends before it starts. `intervals` are the source's sizes, smallest first.
 */
export function planTradePictureCandleWindow(
  startMs: number, endMs: number, intervals: readonly (typeof TRADE_PICTURE_INTERVALS)[number][] = TRADE_PICTURE_INTERVALS,
): TradePictureCandleWindow | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  const length = endMs - startMs;
  const windowFor = (choice: (typeof TRADE_PICTURE_INTERVALS)[number]): TradePictureCandleWindow => {
    const padding = Math.max(length * TRADE_PICTURE_PADDING_FRACTION, TRADE_PICTURE_MIN_PADDING_CANDLES * choice.ms);
    const startTimeMs = Math.floor(startMs - padding), endTimeMs = Math.ceil(endMs + padding);
    return Object.freeze({ interval: choice.interval, startTimeMs, endTimeMs, limit: Math.ceil((endTimeMs - startTimeMs) / choice.ms) + 1 });
  };
  for (const choice of intervals) {
    const window = windowFor(choice);
    if (window.limit <= TRADE_PICTURE_MAX_WINDOW_CANDLES) return window;
  }
  return windowFor(intervals[intervals.length - 1]);
}

/** A planned trade's window (D212): the 36 fifteen-minute candles up to and including the one forming at `nowMs`. Null when `nowMs` is not a time. */
export function planPlannedTradeCandleWindow(nowMs: number): TradePictureCandleWindow | null {
  if (!Number.isFinite(nowMs)) return null;
  const ms = tradePictureIntervalMs(TRADE_PICTURE_PLANNED_INTERVAL);
  const startTimeMs = Math.floor(nowMs / ms) * ms - (TRADE_PICTURE_PLANNED_CANDLES - 1) * ms;
  return Object.freeze({ interval: TRADE_PICTURE_PLANNED_INTERVAL, startTimeMs, endTimeMs: nowMs, limit: Math.ceil((nowMs - startTimeMs) / ms) + 1 });
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
/** The Kairos server's forex and metal candles from OANDA (D231); a build without the server has no port for it. */
export const FOREX_CANDLE_VENUE = 'oanda-forex';
/** The words when this build has no Kairos server: forex candles come only through it. */
export const FOREX_CANDLES_NEED_SERVER = 'Forex candles need the Kairos server.';

export type TradePictureCandlesFailure = 'no-candle-source' | 'no-start' | 'not-listed' | 'no-candles' | MarketDataUnavailableWhy;

export type TradePictureCandlesResult =
  | Readonly<{ ok: true; candles: readonly MarketCandle[]; source: string; note: string | null; /** The window's candle size; a loader may leave it out. */ interval?: TradePictureInterval }>
  | Readonly<{
    ok: false; why: TradePictureCandlesFailure; retryAfterSeconds: number | null; note: string | null;
    /** Which source the "Unavailable" words name when it is not Binance (OANDA for forex, D235). */
    source?: MarketSourceWords;
  }>;

type TradePictureCandlesSuccess = Extract<TradePictureCandlesResult, { ok: true }>;

// Session-only memory (D15): candles are market reference, never stored in IndexedDB. Only successes are kept.
const cache = new Map<string, TradePictureCandlesSuccess>();

export function resetTradePictureCandleCache(): void {
  cache.clear();
}

const failed = (why: TradePictureCandlesFailure, retryAfterSeconds: number | null = null, note: string | null = null, source?: MarketSourceWords): TradePictureCandlesResult =>
  Object.freeze(source === undefined ? { ok: false as const, why, retryAfterSeconds, note } : { ok: false as const, why, retryAfterSeconds, note, source });

/** A port failure's reason: the typed one when the port gave it, else "the source didn't answer". */
const unavailable = (
  result: { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null }, note: string | null = null, source?: MarketSourceWords,
): TradePictureCandlesResult =>
  result.reason === 'unavailable' && result.why !== undefined ? failed(result.why, result.retryAfterSeconds ?? null, note, source) : failed('source-down', null, note, source);

/**
 * A futures market on no spot list (D171): its own name on USDⓈ-M, with no pair (so no backup source).
 * Binance's "no such market" and a source without futures candles read as not listed, with the reason.
 */
async function loadFuturesOnlyCandles(
  symbol: string, spotNote: string, typed: string, window: TradePictureCandleWindow, keep: boolean, deps: TradePictureCandleDeps, options: { readonly signal?: AbortSignal } | undefined,
): Promise<TradePictureCandlesResult> {
  const key = [symbol, 'futures-only', window.interval, window.startTimeMs, window.endTimeMs].join('|');
  const stored = keep ? cache.get(key) : undefined;
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
  const success: TradePictureCandlesSuccess = Object.freeze({ ok: true as const, candles: result.snapshot.candles, source: describeFuturesOnlySource(symbol), note: null, interval: window.interval });
  if (keep) cache.set(key, success);
  return success;
}

/**
 * A forex pair or metal's candles from OANDA through the Kairos server (D231, D235): its six letters, no market list and
 * no backup. A build that asks Binance directly refuses the forex market: it has no forex source.
 */
async function loadForexCandles(
  pair: ForexPair, window: TradePictureCandleWindow, keep: boolean, deps: TradePictureCandleDeps, options: { readonly signal?: AbortSignal } | undefined,
): Promise<TradePictureCandlesResult> {
  const key = [pair.symbol, FOREX_CANDLE_VENUE, window.interval, window.startTimeMs, window.endTimeMs].join('|');
  const stored = keep ? cache.get(key) : undefined;
  if (stored) return stored;
  const result = await deps.history.acquireHistory({
    instrument: { venue: FOREX_CANDLE_VENUE, symbol: pair.symbol },
    interval: window.interval,
    limit: window.limit,
    startTimeMs: window.startTimeMs,
    endTimeMs: window.endTimeMs,
  }, options);
  if (!result.ok) {
    if (result.reason === 'invalid-request' && result.detail === 'venue-mismatch') return failed('no-candle-source', null, FOREX_CANDLES_NEED_SERVER);
    return unavailable(result, null, { provider: 'oanda', pair: pair.label });
  }
  if (result.snapshot.candles.length === 0) return failed('no-candles');
  const success: TradePictureCandlesSuccess = Object.freeze({
    ok: true as const, candles: result.snapshot.candles, source: describeCandleSource(result.snapshot.origin, pair, 'spot'), note: null, interval: window.interval,
  });
  if (keep) cache.set(key, success);
  return success;
}

/**
 * Candles around one trade for its picture, with the line that says where they came from, or why there are none:
 * no candle source for the market, no start time, a market Binance doesn't list, no candles for the time, or the
 * source's own reason. Futures trades ask futures candles, and spot candles once when there is no futures market. Forex
 * pairs and metals ask OANDA through the Kairos server, on sizes up to 1 week without 3 days (D232). A planned
 * trade asks the recent market up to now (D212), never from the cache. It never throws.
 */
export async function loadTradePictureCandles(
  trade: TradeRecord,
  executions: readonly TradeExecutionRecord[],
  deps: TradePictureCandleDeps,
): Promise<TradePictureCandlesResult> {
  try {
    const candleSource = tradePictureCandleSource(trade.marketType, trade.symbol);
    if (candleSource === null) return failed('no-candle-source');
    const nowMs = (deps.nowMs ?? Date.now)();
    // A planned trade has no time of its own: it is drawn against the market up to now, which is never kept (it ends now).
    const planned = trade.status === 'draft';
    let window: TradePictureCandleWindow | null;
    if (planned) {
      window = planPlannedTradeCandleWindow(nowMs);
    } else {
      const times = tradePictureTimes(trade, executions, nowMs);
      if (times.startMs === null) return failed('no-start');
      // An open trade is still in the market after a partial exit, so its candles run to now (D192 "so far").
      window = planTradePictureCandleWindow(times.startMs, trade.status === 'open' ? nowMs : times.endMs, candleSource === 'forex' ? FOREX_PICTURE_INTERVALS : TRADE_PICTURE_INTERVALS);
    }
    if (window === null) return failed('no-start');
    // Windows that end now are never kept: the next look must see the newer candles.
    const keep = !planned && trade.status !== 'open';
    const options = deps.signal ? { signal: deps.signal } : undefined;
    if (candleSource === 'forex') {
      const pair = parseForexPair(trade.symbol);
      return pair.ok ? await loadForexCandles(pair.pair, window, keep, deps, options) : failed('no-candle-source');
    }

    const metadata = await deps.metadata.acquireInstrumentMetadata(options);
    if (!metadata.ok) return unavailable(metadata);
    const match = matchCryptoMarket(trade.symbol, trade.marketType, metadata.facts);
    if (!match.ok) {
      const futuresOnly = match.why === 'not-listed' ? futuresOnlyMarket(trade.symbol, trade.marketType) : null;
      if (futuresOnly === null) return failed('not-listed', null, match.note);
      return loadFuturesOnlyCandles(futuresOnly, match.note, trade.symbol, window, keep, deps, options);
    }

    const key = [match.symbol, match.candles, window.interval, window.startTimeMs, window.endTimeMs].join('|');
    const stored = keep ? cache.get(key) : undefined;
    if (stored) return stored;
    const asked = window;

    const ask = (venue: string): Promise<MarketCandleHistoryResult> => deps.history.acquireHistory({
      instrument: { venue, symbol: match.symbol },
      interval: asked.interval,
      limit: asked.limit,
      startTimeMs: asked.startTimeMs,
      endTimeMs: asked.endTimeMs,
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
      interval: window.interval,
    });
    if (keep) cache.set(key, success);
    return success;
  } catch {
    return failed('source-down');
  }
}
