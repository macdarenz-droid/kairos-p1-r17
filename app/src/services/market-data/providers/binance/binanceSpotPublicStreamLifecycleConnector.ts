import { transitionMarketDataConnectionState } from '../../marketDataConnectionState';
import type {
  MarketDataConnectionState,
  MarketDataSubscriptionHandlers,
} from '../../marketDataTypes';
import type {
  BinanceSpotPublicStreamConnector,
  BinanceSpotPublicStreamMessageHandlers,
} from './binanceSpotPublicStreamConnection';

export interface BinanceSpotPublicStreamLifecycleConnectorOptions {
  readonly connect: BinanceSpotPublicStreamConnector;
  readonly handlers: Pick<MarketDataSubscriptionHandlers, 'onStateChange'>;
}

/**
 * P16.13 decorates an existing Binance Spot public-stream connector with the
 * provider-neutral P15 connection-state machine. It translates transport
 * lifecycle evidence only; it does not create sockets, schedule retries,
 * acquire clocks, persist data, render charts, or mutate journal truth.
 */
export function withBinanceSpotPublicStreamLifecycle(
  options: BinanceSpotPublicStreamLifecycleConnectorOptions,
): BinanceSpotPublicStreamConnector {
  return (url: string, handlers: BinanceSpotPublicStreamMessageHandlers) => {
    let state: MarketDataConnectionState = 'idle';

    const apply = (
      event: Parameters<typeof transitionMarketDataConnectionState>[1],
    ) => {
      const transition = transitionMarketDataConnectionState(state, event);
      if (!transition.accepted) return;
      state = transition.state;
      options.handlers.onStateChange?.(state);
    };

    apply('connect-requested');

    return options.connect(url, {
      ...handlers,
      onOpen: () => {
        apply('connected');
        handlers.onOpen?.();
      },
      onError: (error) => {
        apply('failed');
        handlers.onError?.(error);
      },
      onClose: (reason) => {
        apply('disconnected');
        handlers.onClose?.(reason);
      },
    });
  };
}
