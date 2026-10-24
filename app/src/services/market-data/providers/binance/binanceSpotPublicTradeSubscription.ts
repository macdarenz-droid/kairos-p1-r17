import type {
  MarketDataInstrument,
  MarketDataSubscription,
  MarketDataSubscriptionHandlers,
} from '../../marketDataTypes';
import {
  openBinanceSpotPublicRawStreamConnection,
  type BinanceSpotPublicStreamConnector,
} from './binanceSpotPublicStreamConnection';
import { describeBinanceSpotPublicRawStreamEndpoint } from './binanceSpotPublicStreamEndpoint';
import { deliverBinanceSpotPublicStreamTradeMessage } from './binanceSpotPublicStreamTradeDelivery';
import { describeBinanceSpotTradeStream } from './binanceSpotTradeStream';

export type BinanceSpotReceiptTimestampProvider = () => string;

export type BinanceSpotPublicTradeSubscriptionResult =
  | { readonly ok: true; readonly subscription: MarketDataSubscription }
  | { readonly ok: false; readonly reason: 'venue-mismatch' | 'symbol-required' };

/**
 * P16.9 composes the existing Binance Spot stream-name, endpoint, injected
 * connection, and trade-delivery owners into one public trade subscription.
 *
 * The concrete transport remains injected. Receipt time is acquired only when
 * an inbound message is delivered. Reconnect policy/execution, AbortSignal
 * ownership, persistence, chart rendering, and journal truth remain outside
 * this owner.
 */
export function subscribeBinanceSpotPublicTradeStream(
  instrument: MarketDataInstrument,
  handlers: MarketDataSubscriptionHandlers,
  connect: BinanceSpotPublicStreamConnector,
  receiptTimestamp: BinanceSpotReceiptTimestampProvider,
): BinanceSpotPublicTradeSubscriptionResult {
  const stream = describeBinanceSpotTradeStream(instrument);
  if (!stream.ok) return stream;

  const endpoint = describeBinanceSpotPublicRawStreamEndpoint(stream);
  const connection = openBinanceSpotPublicRawStreamConnection(
    endpoint,
    {
      onMessage: (data) => {
        deliverBinanceSpotPublicStreamTradeMessage(
          data,
          receiptTimestamp(),
          handlers,
        );
      },
      onError: (error) => handlers.onError?.(error),
    },
    connect,
  );

  return {
    ok: true,
    subscription: {
      close: () => connection.close(),
    },
  };
}
