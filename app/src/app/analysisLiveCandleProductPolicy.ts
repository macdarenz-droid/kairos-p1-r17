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

/** Tap tolerance in CSS pixels for grabbing a line end or zone corner, and for selecting a drawing by tap position: 16 px fits a finger. */
export const ANALYSIS_DRAWING_ENDPOINT_EDIT_TOLERANCE_PX = 16;

/** Zone fill opacity (0–1) for Analysis drawing tools; the colour comes from the chart theme's secondary drawing token. */
export const ANALYSIS_DRAWING_ZONE_FILL_OPACITY = 0.18;
