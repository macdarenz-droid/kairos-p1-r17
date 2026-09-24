import { describe, expectTypeOf, it } from 'vitest';
import type {
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionOptions,
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult,
} from '../src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { LiveMarketSummaryBaselineStateOrchestrationResult } from '../src/services/market-data/liveMarketSummaryBaselineStateOrchestration';
import type { LiveMarketSummaryScopedStateSnapshotEntry } from '../src/services/market-data/liveMarketSummaryScopedStateSnapshot';
import type { MarketDataInstrument } from '../src/services/market-data/marketDataTypes';

describe('Home Dashboard Live Market Summary Scoped Snapshot Acquisition Port Contract Foundation', () => {
  it('accepts only caller-owned scope plus released cancellation semantics', () => {
    expectTypeOf<HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort['acquire']>().parameters.toEqualTypeOf<[
      readonly MarketDataInstrument[],
      HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionOptions?,
    ]>();
  });

  it('returns only released provider-neutral orchestration and scoped snapshot truth', () => {
    expectTypeOf<HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult>().toEqualTypeOf<{
      readonly orchestrationResult: LiveMarketSummaryBaselineStateOrchestrationResult;
      readonly scopedSnapshot: readonly LiveMarketSummaryScopedStateSnapshotEntry[];
    }>();
  });

  it('keeps cancellation compatible with the released optional AbortSignal boundary', () => {
    expectTypeOf<HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionOptions>().toEqualTypeOf<{
      readonly signal?: AbortSignal;
    }>();
  });
});
