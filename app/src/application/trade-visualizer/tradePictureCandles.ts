import type { MarketType, TradeExecutionRecord, TradeRecord } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { MarketCandle, MarketCandleHistoryPort } from '../../services/market-data/MarketCandleHistoryPort';

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
 * P31: whether the trade picture asks the candle source for this market. Forex has none yet:
 * no keyless browser source gives clean forex candles (D99). Every other market asks as before, by symbol.
 */
export function tradePictureHasCandleSource(marketType: MarketType): boolean {
  return marketType !== 'forex';
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
  /** The market venue the history and metadata ports serve (the composition root picks the provider). */
  readonly venue: string;
  readonly history: MarketCandleHistoryPort;
  /** Known market list; a symbol that is not on it is never requested. */
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
  readonly nowMs?: () => number;
  readonly signal?: AbortSignal;
}

// Session-only memory (D15): candles are market reference, never stored in IndexedDB.
const cache = new Map<string, readonly MarketCandle[]>();

export function resetTradePictureCandleCache(): void {
  cache.clear();
}

/**
 * Candles around one trade for its picture, or null when there are none to
 * show (offline, unknown symbol, error, no start time, or a market with no candle source). It never throws.
 */
export async function loadTradePictureCandles(
  trade: TradeRecord,
  executions: readonly TradeExecutionRecord[],
  deps: TradePictureCandleDeps,
): Promise<readonly MarketCandle[] | null> {
  try {
    if (!tradePictureHasCandleSource(trade.marketType)) return null;
    const nowMs = (deps.nowMs ?? Date.now)();
    const times = tradePictureTimes(trade, executions, nowMs);
    if (times.startMs === null) return null;
    const window = planTradePictureCandleWindow(times.startMs, times.endMs);
    if (window === null) return null;
    const symbol = normalizeTradeSymbol(trade.symbol);
    const key = [symbol, window.interval, window.startTimeMs, window.endTimeMs].join('|');
    const stored = cache.get(key);
    if (stored) return stored;

    const metadata = await deps.metadata.acquireInstrumentMetadata(deps.signal ? { signal: deps.signal } : undefined);
    if (!metadata.ok) return null;
    const known = metadata.facts.some(fact => fact.instrument.venue === deps.venue && fact.instrument.symbol === symbol);
    if (!known) return null;

    const result = await deps.history.acquireHistory({
      instrument: { venue: deps.venue, symbol },
      interval: window.interval,
      limit: window.limit,
      startTimeMs: window.startTimeMs,
      endTimeMs: window.endTimeMs,
    }, deps.signal ? { signal: deps.signal } : undefined);
    if (!result.ok || result.snapshot.candles.length === 0) return null;
    cache.set(key, result.snapshot.candles);
    return result.snapshot.candles;
  } catch {
    return null;
  }
}
