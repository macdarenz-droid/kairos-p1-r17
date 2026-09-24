import type {
  LiveMarketSummaryCompleteForScopeDelivery,
  MarketDataInstrument,
} from '../../marketDataTypes';
import {
  mapBinanceSpot24hBaselineDelivery,
  type BinanceSpot24hBaselineDeliveryResult,
} from './binanceSpot24hBaselineDelivery';
import {
  decodeBinanceSpot24hPublicRestBaselineResponse,
  type BinanceSpot24hPublicRestBaselineResponseDecodeResult,
} from './binanceSpot24hPublicRestBaselineResponseDecode';

type DecodeFailureReason = Extract<
  BinanceSpot24hPublicRestBaselineResponseDecodeResult,
  { readonly ok: false }
>['reason'];

type DeliveryFailureReason = Extract<
  BinanceSpot24hBaselineDeliveryResult,
  { readonly ok: false }
>['reason'];

export type BinanceSpot24hPublicRestBaselineResponseDeliveryResult =
  | {
      readonly ok: true;
      readonly delivery: LiveMarketSummaryCompleteForScopeDelivery;
    }
  | {
      readonly ok: false;
      readonly reason: DecodeFailureReason | DeliveryFailureReason;
    };

/**
 * P21.10 composes only one already-received REST response data value
 * through P21.9 JSON-text decoding and the existing P21.6 decoded
 * payload-to-delivery mapper.
 *
 * Scope and observedAt remain caller-owned. Request description,
 * execution, concrete transport/status/body acquisition, P21.4 port
 * orchestration, retry/state policy, persistence and UI stay outside.
 */
export function mapBinanceSpot24hPublicRestBaselineResponseDelivery(
  scope: readonly MarketDataInstrument[],
  data: unknown,
  observedAt: string,
): BinanceSpot24hPublicRestBaselineResponseDeliveryResult {
  const decoded = decodeBinanceSpot24hPublicRestBaselineResponse(data);
  if (!decoded.ok) return decoded;
  return mapBinanceSpot24hBaselineDelivery(scope, decoded.payload, observedAt);
}
