import type { DecimalString } from '../../domain/trades';
import type { MarketDataInstrument } from './marketDataTypes';

/** One caller-selected UTC window. Time bounds apply to candle opening times,
 * inclusively. Omitted bounds request a recent page; no default market or interval. */
export interface MarketCandleHistoryRequest {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly limit: number;
  readonly startTimeMs?: number;
  readonly endTimeMs?: number;
}

export interface MarketCandle {
  readonly openTime: string;
  readonly closeTime: string;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
}

export interface MarketCandleHistorySnapshot {
  readonly source: 'market-reference';
  readonly timeZone: 'UTC';
  readonly request: MarketCandleHistoryRequest;
  readonly observedAt: string;
  /** A bounded page, not proof of complete history. The last candle may be forming. */
  readonly candles: readonly MarketCandle[];
}

export type MarketCandleHistoryResult =
  | { readonly ok: true; readonly snapshot: MarketCandleHistorySnapshot }
  | { readonly ok: false; readonly reason: 'invalid-request' | 'invalid-response'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'transport-failed' | 'observed-at-invalid' }
  | { readonly ok: false; readonly reason: 'http-error'; readonly status: number; readonly retryAfter: string | null };

/** P15 acquisition only. Callers own selection, receipt clock, retries, page
 * accumulation and stale-response suppression; chart/UI/persistence stay outside. */
export interface MarketCandleHistoryPort {
  acquireHistory(request: MarketCandleHistoryRequest, options?: { readonly signal?: AbortSignal }): Promise<MarketCandleHistoryResult>;
}
