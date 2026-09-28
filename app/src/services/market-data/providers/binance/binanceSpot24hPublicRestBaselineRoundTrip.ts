import type { MarketDataInstrument } from '../../marketDataTypes';
import {
  describeBinanceSpot24hPublicRestBaselineRequest,
  type BinanceSpot24hPublicRestBaselineRequestResult,
} from './binanceSpot24hPublicRestBaselineRequest';
import {
  executeBinanceSpot24hPublicRestBaselineRequest,
  type BinanceSpot24hPublicRestBaselineExecutionOptions,
  type BinanceSpot24hPublicRestBaselineRequestConnector,
} from './binanceSpot24hPublicRestBaselineRequestExecution';
import {
  mapBinanceSpot24hPublicRestBaselineResponseDelivery,
  type BinanceSpot24hPublicRestBaselineResponseDeliveryResult,
} from './binanceSpot24hPublicRestBaselineResponseDelivery';

type RequestFailureReason = Extract<
  BinanceSpot24hPublicRestBaselineRequestResult,
  { readonly ok: false }
>['reason'];

type ResponseFailureReason = Extract<
  BinanceSpot24hPublicRestBaselineResponseDeliveryResult,
  { readonly ok: false }
>['reason'];

export type BinanceSpot24hPublicRestBaselineRoundTripResult =
  | Extract<BinanceSpot24hPublicRestBaselineResponseDeliveryResult, { readonly ok: true }>
  | { readonly ok: false; readonly reason: RequestFailureReason | ResponseFailureReason };

/**
 * Composes the canonical REST baseline seams for one round trip. Optional
 * caller-owned execution options are propagated only; connector rejection,
 * cancellation policy, concrete transport and P21.4 orchestration remain outside.
 */
export async function composeBinanceSpot24hPublicRestBaselineRoundTrip(
  scope: readonly MarketDataInstrument[],
  observedAt: string,
  connect: BinanceSpot24hPublicRestBaselineRequestConnector<unknown>,
  options?: BinanceSpot24hPublicRestBaselineExecutionOptions,
): Promise<BinanceSpot24hPublicRestBaselineRoundTripResult> {
  const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
  if (!described.ok) return described;
  const data = options === undefined
    ? await executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect)
    : await executeBinanceSpot24hPublicRestBaselineRequest(described.request, connect, options);
  return mapBinanceSpot24hPublicRestBaselineResponseDelivery(scope, data, observedAt);
}
