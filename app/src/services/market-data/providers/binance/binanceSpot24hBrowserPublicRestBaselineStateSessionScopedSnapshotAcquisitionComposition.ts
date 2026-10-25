import type { LiveMarketSummaryBaselineStateOrchestrationResult } from '../../liveMarketSummaryBaselineStateOrchestration';
import type { LiveMarketSummaryScopedStateSnapshotEntry } from '../../liveMarketSummaryScopedStateSnapshot';
import type { LiveMarketSummaryStateSession } from '../../liveMarketSummaryStateSession';
import type { MarketDataInstrument } from '../../marketDataTypes';
import { readLiveMarketSummaryStateSessionScopedSnapshot } from '../../liveMarketSummaryStateSessionScopedSnapshotBinding';
import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from './binanceSpot24hPublicRestBaselineAcquisitionAdapter';
import { acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession } from './binanceSpot24hBrowserPublicRestBaselineStateSessionBinding';

export interface BinanceSpot24hBrowserPublicRestBaselineStateSessionScopedSnapshotAcquisitionCompositionResult {
  readonly orchestrationResult: LiveMarketSummaryBaselineStateOrchestrationResult;
  readonly scopedSnapshot: readonly LiveMarketSummaryScopedStateSnapshotEntry[];
}

/**
 * Composition only: perform exactly one released P21.20 browser acquisition
 * into the supplied released session, then read exactly one released P21.22
 * scoped snapshot from that same session and exact caller-owned scope.
 */
export async function acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(
  session: LiveMarketSummaryStateSession,
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  scope: readonly MarketDataInstrument[],
  options?: { readonly signal?: AbortSignal },
): Promise<BinanceSpot24hBrowserPublicRestBaselineStateSessionScopedSnapshotAcquisitionCompositionResult> {
  const orchestrationResult = await acquireBinanceSpot24hBrowserPublicRestBaselineIntoSession(
    session,
    readObservedAt,
    scope,
    options,
  );
  const scopedSnapshot = readLiveMarketSummaryStateSessionScopedSnapshot(session, scope);
  return { orchestrationResult, scopedSnapshot };
}
