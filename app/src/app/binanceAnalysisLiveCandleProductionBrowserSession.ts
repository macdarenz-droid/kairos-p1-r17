import type { BinanceSpotBrowserPublicTradeReconnectSubscriptionResult } from '../services/market-data/providers/binance/binanceSpotBrowserPublicTradeReconnectSubscription';
import {
  binanceAnalysisLiveCandleBrowserRuntimeSources,
  type BinanceAnalysisLiveCandleBrowserRuntimeSources,
} from './binanceAnalysisLiveCandleBrowserRuntimeSources';
import {
  subscribeBinanceAnalysisLiveCandleBrowserSession,
  type BinanceAnalysisLiveCandleSubscription,
} from './binanceAnalysisLiveCandleBrowserSubscriptionComposition';

type LiveCandleBrowserSessionOptions = Parameters<
  typeof subscribeBinanceAnalysisLiveCandleBrowserSession
>[0];

export type BinanceAnalysisLiveCandleProductionBrowserSessionStarter =
  typeof subscribeBinanceAnalysisLiveCandleBrowserSession;

export type BinanceAnalysisLiveCandleProductionBrowserSessionOptions = Omit<
  LiveCandleBrowserSessionOptions,
  'receiptTimestamp' | 'scheduler' | 'reconnectSample'
> & {
  readonly runtimeSources?: BinanceAnalysisLiveCandleBrowserRuntimeSources;
  readonly startSession?: BinanceAnalysisLiveCandleProductionBrowserSessionStarter;
  readonly subscribe?: BinanceAnalysisLiveCandleSubscription;
};

/**
 * Production browser binding for the released Analysis live-candle session.
 *
 * The caller remains authoritative for instrument, interval, initial history,
 * renderer, reconnect policy, backfill execution and lifecycle. This boundary
 * supplies only the released browser clock, scheduler and entropy mechanics.
 */
export function startBinanceAnalysisLiveCandleProductionBrowserSession(
  options: BinanceAnalysisLiveCandleProductionBrowserSessionOptions,
): BinanceSpotBrowserPublicTradeReconnectSubscriptionResult {
  const {
    runtimeSources = binanceAnalysisLiveCandleBrowserRuntimeSources,
    startSession = subscribeBinanceAnalysisLiveCandleBrowserSession,
    ...sessionOptions
  } = options;

  return startSession({
    ...sessionOptions,
    receiptTimestamp: runtimeSources.receiptTimestamp,
    scheduler: runtimeSources.scheduler,
    reconnectSample: runtimeSources.reconnectSample,
  });
}
