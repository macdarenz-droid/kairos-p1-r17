import type { MarketDataConnectionState, MarketDataSubscription } from '../services/market-data/marketDataTypes';
import type { BinanceSpotBrowserPublicTradeReconnectSubscriptionResult } from '../services/market-data/providers/binance/binanceSpotBrowserPublicTradeReconnectSubscription';
import type {
  BinanceAnalysisCandleBackfillRequest,
  BinanceAnalysisLiveCandleDisposition,
} from './binanceAnalysisLiveCandleProjectionRendererCoordination';
import {
  startBinanceAnalysisLiveCandleProductionBrowserSession,
  type BinanceAnalysisLiveCandleProductionBrowserSessionOptions,
} from './binanceAnalysisLiveCandleProductionBrowserSession';

export type BinanceAnalysisSelectedLiveCandleSessionStarter = (
  options: BinanceAnalysisLiveCandleProductionBrowserSessionOptions,
) => BinanceSpotBrowserPublicTradeReconnectSubscriptionResult;

export type BinanceAnalysisSelectedLiveCandleSessionOptions = Omit<
  BinanceAnalysisLiveCandleProductionBrowserSessionOptions,
  'startSession' | 'onBackfillRequired' | 'onDisposition' | 'onStateChange' | 'onError'
> & {
  readonly onBackfillRequired: (request: BinanceAnalysisCandleBackfillRequest) => void;
  readonly onDisposition?: (disposition: BinanceAnalysisLiveCandleDisposition) => void;
  readonly onStateChange?: (state: MarketDataConnectionState) => void;
  readonly onError?: (error: unknown) => void;
};

export interface BinanceAnalysisSelectedLiveCandleSessionController {
  replace(options: BinanceAnalysisSelectedLiveCandleSessionOptions): BinanceSpotBrowserPublicTradeReconnectSubscriptionResult;
  stop(): void;
  isActive(): boolean;
}

/**
 * Owns only replacement and cleanup for the currently selected Analysis live
 * candle session. A new selection invalidates callbacks before closing the old
 * subscription, so late events cannot reach the current route state.
 */
export function createBinanceAnalysisSelectedLiveCandleSessionController(
  startSession: BinanceAnalysisSelectedLiveCandleSessionStarter =
    startBinanceAnalysisLiveCandleProductionBrowserSession,
): BinanceAnalysisSelectedLiveCandleSessionController {
  let generation = 0;
  let active: MarketDataSubscription | null = null;

  const current = (ticket: number) => ticket === generation;

  return {
    replace(options) {
      const ticket = ++generation;
      const previous = active;
      active = null;
      previous?.close();

      const result = startSession({
        ...options,
        onBackfillRequired: request => {
          if (current(ticket)) options.onBackfillRequired(request);
        },
        onDisposition: disposition => {
          if (current(ticket)) options.onDisposition?.(disposition);
        },
        onStateChange: state => {
          if (current(ticket)) options.onStateChange?.(state);
        },
        onError: error => {
          if (current(ticket)) options.onError?.(error);
        },
      });

      if (!result.ok) return result;
      if (!current(ticket)) {
        result.subscription.close();
        return result;
      }
      active = result.subscription;
      return result;
    },
    stop() {
      generation += 1;
      const previous = active;
      active = null;
      previous?.close();
    },
    isActive() {
      return active !== null;
    },
  };
}
