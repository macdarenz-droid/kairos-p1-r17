import type { MarketDataReconnectScheduler } from '../services/market-data/marketDataReconnectScheduler';
import type { BinanceSpotReconnectSampleProvider } from '../services/market-data/providers/binance/binanceSpotBrowserPublicTradeReconnectSubscription';
import type { BinanceSpotReceiptTimestampProvider } from '../services/market-data/providers/binance/binanceSpotPublicTradeSubscription';

export interface BinanceAnalysisLiveCandleBrowserRuntimeSources {
  readonly receiptTimestamp: BinanceSpotReceiptTimestampProvider;
  readonly scheduler: MarketDataReconnectScheduler;
  readonly reconnectSample: BinanceSpotReconnectSampleProvider;
}

export interface BinanceAnalysisLiveCandleBrowserHostSources {
  readonly readCurrentTimeMs: () => number;
  readonly scheduleTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly cancelTimeout: (handle: unknown) => void;
  readonly readReconnectSample: () => number;
}

/**
 * Browser-source adapter for the already-released live-candle composition.
 * It supplies only clock, timer and entropy mechanics. P15 retains reconnect
 * policy and validation; the Analysis caller retains route/session lifecycle.
 */
export function createBinanceAnalysisLiveCandleBrowserRuntimeSources(
  host: BinanceAnalysisLiveCandleBrowserHostSources,
): BinanceAnalysisLiveCandleBrowserRuntimeSources {
  return Object.freeze({
    receiptTimestamp: () => new Date(host.readCurrentTimeMs()).toISOString(),
    scheduler: Object.freeze({
      schedule: (callback: () => void, delayMs: number) => host.scheduleTimeout(callback, delayMs),
      cancel: (handle: unknown) => host.cancelTimeout(handle),
    }),
    reconnectSample: () => host.readReconnectSample(),
  });
}

/** Production browser mechanics. Values are read only when their released
 * consumer asks, so module import creates no timer or background work. */
export const binanceAnalysisLiveCandleBrowserRuntimeSources =
  createBinanceAnalysisLiveCandleBrowserRuntimeSources({
    readCurrentTimeMs: () => Date.now(),
    scheduleTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelTimeout: (handle) => window.clearTimeout(handle as number),
    readReconnectSample: () => Math.random(),
  });
