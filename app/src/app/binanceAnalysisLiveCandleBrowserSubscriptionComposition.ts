import type { ProjectedIncrementalCandleRendererLifecycle } from '../features/chart';
import type { MarketCandle } from '../services/market-data/MarketCandleHistoryPort';
import type {
  MarketDataConnectionState,
  MarketDataInstrument,
  MarketDataSubscriptionHandlers,
} from '../services/market-data/marketDataTypes';
import type { MarketDataReconnectPolicy } from '../services/market-data/marketDataReconnectPolicy';
import type { MarketDataReconnectScheduler } from '../services/market-data/marketDataReconnectScheduler';
import {
  subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect,
  type BinanceSpotBrowserPublicTradeReconnectSubscriptionResult,
  type BinanceSpotReconnectSampleProvider,
} from '../services/market-data/providers/binance/binanceSpotBrowserPublicTradeReconnectSubscription';
import type { BinanceSpotReceiptTimestampProvider } from '../services/market-data/providers/binance/binanceSpotPublicTradeSubscription';
import {
  createBinanceAnalysisLiveCandleProjectionRendererSession,
  type BinanceAnalysisCandleBackfillRequest,
  type BinanceAnalysisLiveCandleDisposition,
} from './binanceAnalysisLiveCandleProjectionRendererCoordination';

export type BinanceAnalysisLiveCandleSubscription = typeof subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect;

/**
 * Item 4 production composition of the released reconnecting Binance browser
 * trade subscription and the released Analysis candle projection/renderer
 * session.
 *
 * The caller still owns initial history, route/selection lifecycle, backfill
 * execution and visible connection state. This boundary only forwards exact
 * stream observations and lifecycle evidence into those existing owners.
 */
export function subscribeBinanceAnalysisLiveCandleBrowserSession(options: {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly initialCandle: MarketCandle;
  readonly renderer: ProjectedIncrementalCandleRendererLifecycle;
  readonly receiptTimestamp: BinanceSpotReceiptTimestampProvider;
  readonly scheduler: MarketDataReconnectScheduler;
  readonly reconnectPolicy: MarketDataReconnectPolicy;
  readonly reconnectSample: BinanceSpotReconnectSampleProvider;
  readonly onBackfillRequired: (request: BinanceAnalysisCandleBackfillRequest) => void;
  readonly onDisposition?: (disposition: BinanceAnalysisLiveCandleDisposition) => void;
  readonly onStateChange?: (state: MarketDataConnectionState) => void;
  readonly onError?: (error: unknown) => void;
  readonly subscribe?: BinanceAnalysisLiveCandleSubscription;
}): BinanceSpotBrowserPublicTradeReconnectSubscriptionResult {
  const session = createBinanceAnalysisLiveCandleProjectionRendererSession({
    instrument: options.instrument,
    interval: options.interval,
    initialCandle: options.initialCandle,
    renderer: options.renderer,
    onBackfillRequired: options.onBackfillRequired,
  });
  const handlers: MarketDataSubscriptionHandlers = {
    onPrice: (observation) => {
      const disposition = session.accept(observation);
      options.onDisposition?.(disposition);
    },
    onStateChange: options.onStateChange,
    onError: options.onError,
  };

  return (options.subscribe ?? subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect)(
    options.instrument,
    handlers,
    options.receiptTimestamp,
    options.scheduler,
    options.reconnectPolicy,
    options.reconnectSample,
  );
}
