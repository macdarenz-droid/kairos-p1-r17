import type { MarketDataDisconnectCause } from '../../marketDataReconnectDisposition';
import { classifyBinanceSpotPublicStreamEvent } from './binanceSpotPublicStreamEvent';
import { decodeBinanceSpotPublicStreamMessage } from './binanceSpotPublicStreamMessageDecode';

export type BinanceSpotServerShutdownReconnectCauseResult =
  | { readonly kind: 'server-shutdown'; readonly eventTime: number; readonly cause: MarketDataDisconnectCause }
  | { readonly kind: 'not-server-shutdown' }
  | { readonly kind: 'invalid-message'; readonly reason: 'unsupported-message-data' | 'invalid-json' };

/**
 * P16.14 converts Binance's application-level serverShutdown evidence into the
 * provider-neutral P15 transient disconnect cause. It does not close sockets,
 * schedule retries, sample jitter, acquire clocks, or mutate journal state.
 */
export function resolveBinanceSpotServerShutdownReconnectCause(
  data: unknown,
): BinanceSpotServerShutdownReconnectCauseResult {
  const decoded = decodeBinanceSpotPublicStreamMessage(data);
  if (!decoded.ok) return { kind: 'invalid-message', reason: decoded.reason };

  const event = classifyBinanceSpotPublicStreamEvent(decoded.payload);
  if (event.kind !== 'server-shutdown') return { kind: 'not-server-shutdown' };

  return {
    kind: 'server-shutdown',
    eventTime: event.eventTime,
    cause: { kind: 'transient-failure' },
  };
}
