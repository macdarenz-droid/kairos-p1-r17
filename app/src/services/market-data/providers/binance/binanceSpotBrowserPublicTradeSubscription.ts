import type {
  MarketDataInstrument,
  MarketDataSubscriptionHandlers,
} from '../../marketDataTypes';
import { connectBinanceSpotBrowserStream } from './binanceSpotBrowserStreamConnector';
import { withBinanceSpotPublicStreamLifecycle } from './binanceSpotPublicStreamLifecycleConnector';
import {
  subscribeBinanceSpotPublicTradeStream,
  type BinanceSpotPublicTradeSubscriptionResult,
  type BinanceSpotReceiptTimestampProvider,
} from './binanceSpotPublicTradeSubscription';

/**
 * P16.16 composes the canonical browser transport, provider lifecycle adapter,
 * and public trade subscription into one browser-ready entry point.
 *
 * Reconnect execution remains outside this owner. In particular, this helper
 * does not create retry policy, timers, clocks, randomness, persistence, chart
 * state, journal writes, credentials, account access, or order execution.
 */
export function subscribeBinanceSpotBrowserPublicTradeStream(
  instrument: MarketDataInstrument,
  handlers: MarketDataSubscriptionHandlers,
  receiptTimestamp: BinanceSpotReceiptTimestampProvider,
): BinanceSpotPublicTradeSubscriptionResult {
  const connect = withBinanceSpotPublicStreamLifecycle({
    connect: connectBinanceSpotBrowserStream,
    handlers,
  });

  return subscribeBinanceSpotPublicTradeStream(
    instrument,
    handlers,
    connect,
    receiptTimestamp,
  );
}
