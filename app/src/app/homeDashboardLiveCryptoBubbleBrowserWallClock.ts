import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';

/**
 * Production browser wall-clock source for acquisition observation time.
 * The current instant is read only when the released acquisition boundary asks.
 */
export const readHomeDashboardLiveCryptoBubbleBrowserObservedAt:
  BinanceSpot24hPublicRestBaselineObservedAtSource =
  () => new Date(Date.now()).toISOString();

/**
 * Production browser wall-clock source for freshness evaluation time.
 * This remains a separate read from acquisition observedAt.
 */
export const readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs:
  HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource =
  () => Date.now();
