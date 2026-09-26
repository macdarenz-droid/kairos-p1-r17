import type { MarketCandleHistoryPort } from '../services/market-data/MarketCandleHistoryPort';
import { analysisHistoryPorts } from './analysisHistoryPorts';
import {
  createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator,
} from './binanceAnalysisHistoryLiveCandleBootstrapCoordination';
import {
  createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle,
  type BinanceAnalysisLiveCandleBrowserAvailabilityLifecycle,
  type BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleSources,
} from './binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import {
  createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator,
} from './binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';
import {
  createBinanceAnalysisSelectedLiveCandleSessionController,
  type BinanceAnalysisSelectedLiveCandleSessionStarter,
} from './binanceAnalysisSelectedLiveCandleSessionController';

export interface BinanceAnalysisLiveCandleProductionLifecycleDependencies {
  readonly history?: MarketCandleHistoryPort;
  readonly startSession?: BinanceAnalysisSelectedLiveCandleSessionStarter;
  readonly availabilitySources?: BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleSources;
}

/**
 * Production composition root for the released item-4 live-candle owners.
 *
 * It creates no selection and chooses no history limit, reconnect policy,
 * renderer or visible copy. The caller owns those route-level decisions and
 * must close the returned lifecycle when its route session ends.
 */
export function createBinanceAnalysisLiveCandleProductionLifecycle(
  dependencies: BinanceAnalysisLiveCandleProductionLifecycleDependencies = {},
): BinanceAnalysisLiveCandleBrowserAvailabilityLifecycle {
  const sessions = createBinanceAnalysisSelectedLiveCandleSessionController(
    dependencies.startSession,
  );
  const bootstrap = createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(
    dependencies.history ?? analysisHistoryPorts.history,
    sessions,
  );
  const recovery = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(bootstrap);
  return createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(
    recovery,
    dependencies.availabilitySources,
  );
}
