import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryResult } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../../services/market-data/marketDataTypes';

/** The only estimation resolution approved for the candle-based fallback: the one-minute candle containing the instant. */
export const ESTIMATED_MARKET_REFERENCE_RESOLUTION = '1m' as const;
const MINUTE_MS = 60_000;

export interface EstimatedMarketReferenceRequest {
  readonly instrument: MarketDataInstrument;
  /** ISO-8601 instant (any offset); it is normalised to UTC for the lookup and echoed back as given. */
  readonly requestedAt: string;
}

/**
 * P22.1 estimated market reference. It is never an execution price: the
 * containing one-minute candle identifies the interval and its OHLC range at
 * the requested instant. No interpolation and no candle-close-at-entry
 * assumption; the caller displays it as a disclosed estimate.
 */
export interface EstimatedMarketReferenceCandleRange {
  readonly kind: 'candle-range';
  readonly isEstimate: true;
  readonly source: 'market-reference';
  readonly method: 'containing-candle';
  readonly resolution: typeof ESTIMATED_MARKET_REFERENCE_RESOLUTION;
  readonly instrument: MarketDataInstrument;
  readonly requestedAt: string;
  readonly requestedAtUtc: string;
  readonly candle: MarketCandle;
  /** Milliseconds from the candle open to the requested instant (0–59999). */
  readonly gapMs: number;
  readonly acquiredAt: string;
}

export type EstimatedMarketReferenceUnavailableReason =
  | 'invalid-instant'
  | 'future-instant'
  | 'no-candle'
  | 'candle-mismatch'
  | Extract<MarketCandleHistoryResult, { readonly ok: false }>['reason'];

export interface EstimatedMarketReferenceUnavailable {
  readonly kind: 'unavailable';
  readonly instrument: MarketDataInstrument;
  readonly requestedAt: string;
  readonly reason: EstimatedMarketReferenceUnavailableReason;
}

export type EstimatedMarketReference = EstimatedMarketReferenceCandleRange | EstimatedMarketReferenceUnavailable;

export interface EstimateMarketReferenceOptions {
  /** The current instant for the future check; defaults to the wall clock. */
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}

const parseInstant = (value: string): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Readonly lookup through the released P15/P16 history port: exactly one
 * one-minute candle window around the requested instant. It writes nothing,
 * touches no journal record and never returns a price as a fill.
 */
export async function estimateMarketReferenceAt(
  port: Pick<MarketCandleHistoryPort, 'acquireHistory'>,
  request: EstimatedMarketReferenceRequest,
  options: EstimateMarketReferenceOptions = {},
): Promise<EstimatedMarketReference> {
  const unavailable = (reason: EstimatedMarketReferenceUnavailableReason): EstimatedMarketReferenceUnavailable =>
    Object.freeze({ kind: 'unavailable' as const, instrument: request.instrument, requestedAt: request.requestedAt, reason });
  const instantMs = parseInstant(request.requestedAt);
  if (instantMs === null) return unavailable('invalid-instant');
  const now = (options.now ?? Date.now)();
  if (instantMs > now) return unavailable('future-instant');
  const startTimeMs = Math.floor(instantMs / MINUTE_MS) * MINUTE_MS;
  const result = await port.acquireHistory(
    { instrument: request.instrument, interval: ESTIMATED_MARKET_REFERENCE_RESOLUTION, limit: 1, startTimeMs, endTimeMs: startTimeMs + MINUTE_MS - 1 },
    options.signal === undefined ? undefined : { signal: options.signal },
  );
  if (!result.ok) return unavailable(result.reason);
  const candle = result.snapshot.candles[0];
  if (candle === undefined) return unavailable('no-candle');
  const openMs = Date.parse(candle.openTime), closeMs = Date.parse(candle.closeTime);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs) || openMs !== startTimeMs || instantMs < openMs || instantMs > closeMs) return unavailable('candle-mismatch');
  return Object.freeze({
    kind: 'candle-range' as const,
    isEstimate: true as const,
    source: 'market-reference' as const,
    method: 'containing-candle' as const,
    resolution: ESTIMATED_MARKET_REFERENCE_RESOLUTION,
    instrument: request.instrument,
    requestedAt: request.requestedAt,
    requestedAtUtc: new Date(instantMs).toISOString(),
    candle,
    gapMs: instantMs - openMs,
    acquiredAt: result.snapshot.observedAt,
  });
}
