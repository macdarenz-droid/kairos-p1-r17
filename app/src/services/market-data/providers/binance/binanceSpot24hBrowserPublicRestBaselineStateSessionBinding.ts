import type { MarketDataInstrument } from '../../marketDataTypes';
import type { LiveMarketSummaryBaselineStateOrchestrationResult } from '../../liveMarketSummaryBaselineStateOrchestration';
import type { LiveMarketSummaryStateSession } from '../../liveMarketSummaryStateSession';
import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from './binanceSpot24hPublicRestBaselineAcquisitionAdapter';
import { acquireBinanceSpot24hBrowserPublicRestBaselineIntoState } from './binanceSpot24hBrowserPublicRestBaselineStateBinding';

/**
 * Explicit browser-ready composition of the released P21.18 one-shot
 * state binding with the released P21.19 provider-neutral state session.
 * This adds no universe, freshness, scheduling, concurrency, persistence,
 * presentation, or provider/transport policy.
 */
export async function acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession(
  session: LiveMarketSummaryStateSession,
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  scope: readonly MarketDataInstrument[],
  options?: { readonly signal?: AbortSignal },
): Promise<LiveMarketSummaryBaselineStateOrchestrationResult> {
  let orchestrationResult: LiveMarketSummaryBaselineStateOrchestrationResult | undefined;

  await session.transition(async (state) => {
    const result = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoState(
      state,
      readObservedAt,
      scope,
      options,
    );
    orchestrationResult = result;
    return result.state;
  });

  if (orchestrationResult === undefined) {
    throw new Error('P21.20 invariant: explicit session transition completed without orchestration result');
  }
  return orchestrationResult;
}
