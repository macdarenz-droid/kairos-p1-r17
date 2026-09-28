import type {
  BinanceSpotPublicStreamConnection,
  BinanceSpotPublicStreamConnector,
  BinanceSpotPublicStreamMessageHandlers,
} from './binanceSpotPublicStreamConnection';

/**
 * P16.12 owns the concrete browser transport adapter for Binance Spot public
 * streams only. Provider semantics, clocks, reconnect scheduling, persistence,
 * chart rendering, and journal truth remain outside this owner.
 */
export const connectBinanceSpotBrowserStream: BinanceSpotPublicStreamConnector = (
  url: string,
  handlers: BinanceSpotPublicStreamMessageHandlers,
): BinanceSpotPublicStreamConnection => {
  const socket = new WebSocket(url);
  let closeRequested = false;

  socket.addEventListener('open', () => {
    handlers.onOpen?.();
  });

  socket.addEventListener('message', (event) => {
    handlers.onMessage(event.data);
  });

  socket.addEventListener('error', (event) => {
    handlers.onError?.(event);
  });

  socket.addEventListener('close', (event) => {
    handlers.onClose?.(event);
  });

  return {
    close: () => {
      if (closeRequested) return;
      closeRequested = true;
      socket.close();
    },
  };
};
