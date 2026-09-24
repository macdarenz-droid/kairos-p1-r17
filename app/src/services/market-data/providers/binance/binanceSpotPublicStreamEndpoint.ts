import type { BinanceSpotTradeStreamDescriptor } from './binanceSpotTradeStream';

export const BINANCE_SPOT_PUBLIC_STREAM_HOST = 'stream.binance.com' as const;
export const BINANCE_SPOT_PUBLIC_STREAM_PORTS = ['9443', '443'] as const;

export type BinanceSpotPublicStreamPort =
  (typeof BINANCE_SPOT_PUBLIC_STREAM_PORTS)[number];

type ValidBinanceSpotTradeStreamDescriptor = Extract<
  BinanceSpotTradeStreamDescriptor,
  { readonly ok: true }
>;

export interface BinanceSpotPublicRawStreamEndpointDescriptor {
  readonly host: typeof BINANCE_SPOT_PUBLIC_STREAM_HOST;
  readonly port: BinanceSpotPublicStreamPort;
  readonly streamName: string;
  readonly url: string;
}

/**
 * P16.3 owns Binance Spot public raw-stream endpoint composition only.
 *
 * Connection creation, heartbeat handling, reconnect execution, credentials,
 * account streams, persistence, chart rendering, and journal mutation remain
 * outside this owner.
 */
export function describeBinanceSpotPublicRawStreamEndpoint(
  stream: ValidBinanceSpotTradeStreamDescriptor,
  port: BinanceSpotPublicStreamPort = '9443',
): BinanceSpotPublicRawStreamEndpointDescriptor {
  return {
    host: BINANCE_SPOT_PUBLIC_STREAM_HOST,
    port,
    streamName: stream.streamName,
    url: `wss://${BINANCE_SPOT_PUBLIC_STREAM_HOST}:${port}/ws/${stream.streamName}`,
  };
}
