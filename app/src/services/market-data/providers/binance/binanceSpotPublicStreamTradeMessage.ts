import type { MarketPriceObservation } from '../../marketDataTypes';
import { mapBinanceSpotTradeObservation } from './binanceSpotTradeObservation';
import { classifyBinanceSpotPublicStreamEvent } from './binanceSpotPublicStreamEvent';
import { decodeBinanceSpotPublicStreamMessage } from './binanceSpotPublicStreamMessageDecode';

export type BinanceSpotPublicStreamTradeMessageResult =
  | { readonly ok: true; readonly kind: 'trade'; readonly observation: MarketPriceObservation }
  | { readonly ok: true; readonly kind: 'ignored' }
  | { readonly ok: false; readonly reason: 'unsupported-message-data' | 'invalid-json' | 'invalid-trade' };

/**
 * P16.7 composes the existing decode, event-classification, and trade-mapping
 * owners for one received public-stream message.
 *
 * Receipt time remains caller-owned. Lifecycle/reconnect, transport creation,
 * persistence, chart rendering, and journal truth remain outside this owner.
 */
export function mapBinanceSpotPublicStreamTradeMessage(
  data: unknown,
  observedAt: string,
): BinanceSpotPublicStreamTradeMessageResult {
  const decoded = decodeBinanceSpotPublicStreamMessage(data);
  if (!decoded.ok) return decoded;

  const event = classifyBinanceSpotPublicStreamEvent(decoded.payload);
  if (event.kind !== 'trade') return { ok: true, kind: 'ignored' };

  const mapped = mapBinanceSpotTradeObservation(event.payload, observedAt);
  if (!mapped.ok) return { ok: false, reason: 'invalid-trade' };

  return { ok: true, kind: 'trade', observation: mapped.observation };
}
