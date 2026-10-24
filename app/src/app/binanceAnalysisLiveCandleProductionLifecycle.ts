import type { MarketCandleHistoryPort } from '../services/market-data/MarketCandleHistoryPort';
import { OANDA_FOREX_VENUE } from '../services/market-data/marketDataTypes';
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
import { startBinanceAnalysisLiveCandleProductionBrowserSession } from './binanceAnalysisLiveCandleProductionBrowserSession';
import {
  createBinanceAnalysisSelectedLiveCandleSessionController,
  type BinanceAnalysisSelectedLiveCandleSessionStarter,
} from './binanceAnalysisSelectedLiveCandleSessionController';
import { startForexAnalysisCandleRefresh } from './forexAnalysisCandleRefresh';

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
  const history = dependencies.history ?? analysisHistoryPorts.history;
  // U10 (D234): a forex pair has no stream; its live session reads the newest candles again every 30 seconds.
  const startSession: BinanceAnalysisSelectedLiveCandleSessionStarter = dependencies.startSession ?? (options =>
    options.instrument.venue === OANDA_FOREX_VENUE
      ? startForexAnalysisCandleRefresh({ ...options, history })
      : startBinanceAnalysisLiveCandleProductionBrowserSession(options));
  const sessions = createBinanceAnalysisSelectedLiveCandleSessionController(startSession);
  const bootstrap = createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(history, sessions);
  const recovery = createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(bootstrap);
  return createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(
    recovery,
    dependencies.availabilitySources,
  );
}
