import type { BinanceSpotPublicRawStreamEndpointDescriptor } from './binanceSpotPublicStreamEndpoint';

export interface BinanceSpotPublicStreamMessageHandlers {
  readonly onMessage: (payload: unknown) => void;
  readonly onOpen?: () => void;
  readonly onClose?: (reason: unknown) => void;
  readonly onError?: (error: unknown) => void;
}

export interface BinanceSpotPublicStreamConnection {
  readonly close: () => void;
}

export type BinanceSpotPublicStreamConnector = (
  url: string,
  handlers: BinanceSpotPublicStreamMessageHandlers,
) => BinanceSpotPublicStreamConnection;

/**
 * P16.4 owns only the injected public-stream connection boundary.
 *
 * The connector implementation remains external. This owner does not acquire
 * clocks, schedule retries, interpret disconnect causes, map provider payloads,
 * persist data, render charts, or mutate journal truth.
 */
export function openBinanceSpotPublicRawStreamConnection(
  endpoint: BinanceSpotPublicRawStreamEndpointDescriptor,
  handlers: BinanceSpotPublicStreamMessageHandlers,
  connect: BinanceSpotPublicStreamConnector,
): BinanceSpotPublicStreamConnection {
  return connect(endpoint.url, handlers);
}
