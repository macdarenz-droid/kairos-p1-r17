import type { LiveMarketSummaryBaselineStateOrchestrationResult } from '../../services/market-data/liveMarketSummaryBaselineStateOrchestration';
import type { LiveMarketSummaryScopedStateSnapshotEntry } from '../../services/market-data/liveMarketSummaryScopedStateSnapshot';
import type { MarketDataInstrument } from '../../services/market-data/marketDataTypes';

export interface HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult {
  readonly orchestrationResult: LiveMarketSummaryBaselineStateOrchestrationResult;
  readonly scopedSnapshot: readonly LiveMarketSummaryScopedStateSnapshotEntry[];
}

export interface HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionOptions {
  readonly signal?: AbortSignal;
}

/**
 * Provider-neutral application-facing port only.
 * The caller owns scope and cancellation. A later adapter may bind this port
 * to an already-released provider capability without moving provider choice
 * or live-market semantics into Home presentation.
 */
export interface HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort {
  acquire(
    scope: readonly MarketDataInstrument[],
    options?: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionOptions,
  ): Promise<HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult>;
}
