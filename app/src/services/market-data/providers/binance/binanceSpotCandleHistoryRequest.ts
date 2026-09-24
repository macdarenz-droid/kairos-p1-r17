import type { MarketCandleHistoryRequest } from '../../MarketCandleHistoryPort';
import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';
import { BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL } from './binanceSpot24hPublicRestBaselineRequest';

export const BINANCE_SPOT_CANDLE_INTERVALS = ['1s','1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M'] as const;
export const BINANCE_SPOT_CANDLE_MAX_LIMIT = 1000;
export interface BinanceSpotCandleHistoryRequestDescriptor {
  readonly method: 'GET';
  readonly url: string;
  readonly scope: MarketCandleHistoryRequest;
}

export function isCandleEpochMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

/** Exact Binance Spot identity: do not alias, uppercase or infer a quote asset.
 * Unicode symbols remain representable. Scope is copied before any async work. */
export function describeBinanceSpotCandleHistoryRequest(request: MarketCandleHistoryRequest):
  | { readonly ok: true; readonly request: BinanceSpotCandleHistoryRequestDescriptor }
  | { readonly ok: false; readonly reason: 'venue-mismatch' | 'symbol-invalid' | 'interval-unsupported' | 'limit-invalid' | 'window-invalid' } {
  if (!request || typeof request !== 'object' || !request.instrument || request.instrument.venue !== BINANCE_SPOT_VENUE) return { ok: false, reason: 'venue-mismatch' };
  const symbol = request.instrument.symbol;
  if (typeof symbol !== 'string' || !symbol || /\s|[\u0000-\u001f\u007f]/u.test(symbol)) return { ok: false, reason: 'symbol-invalid' };
  if (!(BINANCE_SPOT_CANDLE_INTERVALS as readonly string[]).includes(request.interval)) return { ok: false, reason: 'interval-unsupported' };
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > BINANCE_SPOT_CANDLE_MAX_LIMIT) return { ok: false, reason: 'limit-invalid' };
  if ((request.startTimeMs !== undefined && !isCandleEpochMs(request.startTimeMs)) ||
      (request.endTimeMs !== undefined && !isCandleEpochMs(request.endTimeMs)) ||
      (request.startTimeMs !== undefined && request.endTimeMs !== undefined && request.startTimeMs > request.endTimeMs)) return { ok: false, reason: 'window-invalid' };
  const scope = Object.freeze({
    instrument: Object.freeze({ venue: BINANCE_SPOT_VENUE, symbol }),
    interval: request.interval, limit: request.limit,
    ...(request.startTimeMs === undefined ? {} : { startTimeMs: request.startTimeMs }),
    ...(request.endTimeMs === undefined ? {} : { endTimeMs: request.endTimeMs }),
  });
  const query = new URLSearchParams({ symbol, interval: scope.interval, limit: String(scope.limit), timeZone: '0' });
  if (query.get('symbol') !== symbol) return { ok: false, reason: 'symbol-invalid' };
  if (scope.startTimeMs !== undefined) query.set('startTime', String(scope.startTimeMs));
  if (scope.endTimeMs !== undefined) query.set('endTime', String(scope.endTimeMs));
  return { ok: true, request: Object.freeze({ method: 'GET', url: `${BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL}/api/v3/klines?${query}`, scope }) };
}
