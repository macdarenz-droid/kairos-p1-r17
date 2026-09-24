import type { DecimalString } from '../trades';

/**
 * Stored shapes of saved records. Saved analyses and snapshots are persisted
 * (IndexedDB, backups) with exactly these fields, so the stored contract lives
 * in the domain and depends on no UI, chart or provider type. The owners of the
 * matching runtime types (chart drawings, Risk/Reward, estimated market
 * references) are checked to stay identical in tests/saved-records-shape.test.ts.
 */

/** ISO-8601 instant as stored (chart timestamp). */
export type StoredTimestamp = string;

export interface StoredChartMarketReference {
  readonly venue: string;
  readonly instrument: string;
  readonly source: 'market-reference';
}

export interface StoredChartDrawingAnchor {
  readonly timestamp: StoredTimestamp;
  readonly price: DecimalString;
}

export interface StoredChartTrendLineDrawing {
  readonly id: string;
  readonly kind: 'trend-line';
  readonly start: StoredChartDrawingAnchor;
  readonly end: StoredChartDrawingAnchor;
}

export type StoredChartDrawing = StoredChartTrendLineDrawing;

export interface StoredRiskRewardAnalysisLevels {
  readonly entry: DecimalString;
  readonly stop: DecimalString;
  readonly target: DecimalString;
}

export interface StoredRiskRewardAnalysis {
  readonly id: string;
  readonly side: 'long' | 'short';
  readonly levels: StoredRiskRewardAnalysisLevels;
}

export interface StoredRiskRewardChartTimeExtent {
  readonly start: StoredTimestamp;
  readonly end: StoredTimestamp;
}

export type StoredTimeAssistedTradeSide = 'long' | 'short';

export interface StoredMarketInstrument {
  readonly venue: string;
  readonly symbol: string;
}

export interface StoredMarketCandle {
  readonly openTime: string;
  readonly closeTime: string;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
}

export interface StoredEstimatedMarketReferenceCandleRange {
  readonly kind: 'candle-range';
  readonly isEstimate: true;
  readonly source: 'market-reference';
  readonly method: 'containing-candle';
  readonly resolution: '1m';
  readonly instrument: StoredMarketInstrument;
  readonly requestedAt: string;
  readonly requestedAtUtc: string;
  readonly candle: StoredMarketCandle;
  readonly gapMs: number;
  readonly acquiredAt: string;
}

export type StoredEstimatedMarketReferenceUnavailableReason =
  | 'invalid-instant'
  | 'future-instant'
  | 'no-candle'
  | 'candle-mismatch'
  | 'invalid-request'
  | 'invalid-response'
  | 'cancelled'
  | 'transport-failed'
  | 'observed-at-invalid'
  | 'http-error';

export interface StoredEstimatedMarketReferenceUnavailable {
  readonly kind: 'unavailable';
  readonly instrument: StoredMarketInstrument;
  readonly requestedAt: string;
  readonly reason: StoredEstimatedMarketReferenceUnavailableReason;
}

export type StoredEstimatedMarketReference = StoredEstimatedMarketReferenceCandleRange | StoredEstimatedMarketReferenceUnavailable;
