import type { DecimalString } from '../../domain/trades';
import type { MarketDataInstrument, MarketDataUnavailable } from './marketDataTypes';

/** One caller-selected UTC window. Time bounds apply to candle opening times,
 * inclusively. Omitted bounds request a recent page; no default market or interval. */
export interface MarketCandleHistoryRequest {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly limit: number;
  readonly startTimeMs?: number;
  readonly endTimeMs?: number;
  /** Base and quote asset of a Binance market, from the market list; lets the server use its backup source. */
  readonly pair?: Readonly<{ base: string; quote: string }>;
}

export interface MarketCandle {
  readonly openTime: string;
  readonly closeTime: string;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
  /** Traded amount in the base asset; absent when the source gave none (never 0 for unknown). */
  readonly volume?: DecimalString;
}

export interface MarketCandleOrigin {
  readonly provider: 'binance' | 'okx';
  readonly market: 'spot' | 'usdm-futures' | 'perpetual-swap';
  /** The provider's own name for the market, such as BTCUSDT or BTC-USDT-SWAP. */
  readonly symbol: string;
  /** Why a backup source answered instead of Binance; null when Binance answered. */
  readonly backup: 'refused' | 'busy' | 'down' | null;
}

export interface MarketCandleHistorySnapshot {
  readonly source: 'market-reference';
  readonly timeZone: 'UTC';
  readonly request: MarketCandleHistoryRequest;
  readonly observedAt: string;
  /** A bounded page, not proof of complete history. The last candle may be forming. */
  readonly candles: readonly MarketCandle[];
  /** Where the candles came from, when the source said so (the Kairos server does). */
  readonly origin?: MarketCandleOrigin;
}

export type MarketCandleHistoryResult =
  | { readonly ok: true; readonly snapshot: MarketCandleHistorySnapshot }
  | { readonly ok: false; readonly reason: 'invalid-request' | 'invalid-response'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'transport-failed' | 'observed-at-invalid' }
  | { readonly ok: false; readonly reason: 'http-error'; readonly status: number; readonly retryAfter: string | null }
  | MarketDataUnavailable;

/** P15 acquisition only. Callers own selection, receipt clock, retries, page
 * accumulation and stale-response suppression; chart/UI/persistence stay outside. */
export interface MarketCandleHistoryPort {
  acquireHistory(request: MarketCandleHistoryRequest, options?: { readonly signal?: AbortSignal }): Promise<MarketCandleHistoryResult>;
}
