import type {
  MarketDataSubscriptionHandlers,
  MarketPriceObservation,
} from '../../marketDataTypes';
import {
  mapBinanceSpotPublicStreamTradeMessage,
  type BinanceSpotPublicStreamTradeMessageResult,
} from './binanceSpotPublicStreamTradeMessage';

export type BinanceSpotPublicStreamTradeDeliveryResult =
  | {
      readonly ok: true;
      readonly kind: 'delivered';
      readonly observation: MarketPriceObservation;
    }
  | { readonly ok: true; readonly kind: 'ignored' }
  | {
      readonly ok: false;
      readonly kind: 'rejected';
      readonly reason: Extract<
        BinanceSpotPublicStreamTradeMessageResult,
        { readonly ok: false }
      >['reason'];
    };

export interface BinanceSpotPublicStreamTradeDeliveryError {
  readonly provider: 'binance-spot';
  readonly stage: 'trade-message';
  readonly reason: Extract<
    BinanceSpotPublicStreamTradeMessageResult,
    { readonly ok: false }
  >['reason'];
}

/**
 * P16.8 delivers one already-received public trade message into the P15
 * subscription handler boundary.
 *
 * Receipt time remains caller-owned. Connection creation, state transitions,
 * reconnect policy, retry scheduling, persistence, chart rendering, and
 * journal truth remain outside this owner.
 */
export function deliverBinanceSpotPublicStreamTradeMessage(
  data: unknown,
  observedAt: string,
  handlers: MarketDataSubscriptionHandlers,
): BinanceSpotPublicStreamTradeDeliveryResult {
  const mapped = mapBinanceSpotPublicStreamTradeMessage(data, observedAt);

  if (!mapped.ok) {
    const error: BinanceSpotPublicStreamTradeDeliveryError = {
      provider: 'binance-spot',
      stage: 'trade-message',
      reason: mapped.reason,
    };
    handlers.onError?.(error);
    return { ok: false, kind: 'rejected', reason: mapped.reason };
  }

  if (mapped.kind === 'ignored') {
    return { ok: true, kind: 'ignored' };
  }

  handlers.onPrice(mapped.observation);
  return {
    ok: true,
    kind: 'delivered',
    observation: mapped.observation,
  };
}
