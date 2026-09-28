import type { MarketDataInstrument } from '../../marketDataTypes';
import type { LiveMarketSummaryDeliveryState } from '../../liveMarketSummaryDeliveryState';
import {
  acquireLiveMarketSummaryBaselineIntoState,
  type LiveMarketSummaryBaselineStateOrchestrationResult,
} from '../../liveMarketSummaryBaselineStateOrchestration';
import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from './binanceSpot24hPublicRestBaselineAcquisitionAdapter';
import { createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort } from './binanceSpot24hBrowserPublicRestBaselineAcquisitionBinding';

/**
 * Browser-ready one-shot binding of released P21.15 acquisition composition
 * to released P21.17 state orchestration. Scope, observation time,
 * cancellation, lifecycle, freshness, ranking, persistence, and UI remain
 * caller/upstream ownership.
 */
export function acquireBinanceSpot24hBrowserPublicRestBaselineIntoState(
  state: LiveMarketSummaryDeliveryState,
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  scope: readonly MarketDataInstrument[],
  options?: { readonly signal?: AbortSignal },
): Promise<LiveMarketSummaryBaselineStateOrchestrationResult> {
  const acquisitionPort = createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(readObservedAt);
  return acquireLiveMarketSummaryBaselineIntoState(state, acquisitionPort, scope, options);
}
