import type { MarketDataReconnectPolicy } from '../services/market-data/marketDataReconnectPolicy';

/** Shared authoritative page size for the historical-to-live Analysis handoff. */
export const ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT = 500;

/**
 * Route-owned reconnect policy for the eventual Analysis live-candle mount.
 *
 * P15 remains the decision and jitter owner. This product policy limits one
 * disconnected session to four retries with capped exponential backoff.
 */
export const ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY: Readonly<MarketDataReconnectPolicy> = Object.freeze({
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxAttempts: 4,
});

/** Trend-line stroke width in CSS pixels for Analysis drawing tools; colour comes from the active chart theme's drawing token. */
export const ANALYSIS_DRAWING_TREND_LINE_WIDTH = 2;

/** Click tolerance in CSS pixels for grabbing a trend-line endpoint to move it; wider than the P18.13 line hit so an endpoint wins over the segment. */
export const ANALYSIS_DRAWING_ENDPOINT_EDIT_TOLERANCE_PX = 8;
