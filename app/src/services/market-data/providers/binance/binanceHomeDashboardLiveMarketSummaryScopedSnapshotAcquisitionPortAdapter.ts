import type { HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort } from '../../../../application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { LiveMarketSummaryStateSession } from '../../liveMarketSummaryStateSession';
import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from './binanceSpot24hPublicRestBaselineAcquisitionAdapter';
import { acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot } from './binanceSpot24hBrowserPublicRestBaselineStateSessionScopedSnapshotAcquisitionComposition';

/**
 * Provider-owned binding only. Session lifecycle and observed-at ownership stay
 * with the caller; Home presentation receives only the provider-neutral port.
 */
export function createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort(
  session: LiveMarketSummaryStateSession,
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
): HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort {
  return {
    acquire(scope, options) {
      return acquireBinanceSpot24hBrowserPublicRestBaselineIntoSessionAndReadScopedSnapshot(
        session,
        readObservedAt,
        scope,
        options,
      );
    },
  };
}
