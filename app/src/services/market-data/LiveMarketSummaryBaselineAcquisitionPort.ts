import type {
  LiveMarketSummaryCompleteForScopeDelivery,
  MarketDataInstrument,
} from './marketDataTypes';

/**
 * Provider-neutral baseline acquisition result.
 * A success is complete only for the explicit caller-provided scope.
 */
export type LiveMarketSummaryBaselineAcquisitionResult =
  | {
      readonly ok: true;
      readonly delivery: LiveMarketSummaryCompleteForScopeDelivery;
    }
  | {
      readonly ok: false;
      readonly reason: 'acquisition-failed';
    };

/**
 * Provider-neutral port for obtaining a complete baseline for an explicit scope.
 * The caller owns scope selection; providers/transport remain downstream implementation details.
 */
export interface LiveMarketSummaryBaselineAcquisitionPort {
  acquireBaseline(
    scope: readonly MarketDataInstrument[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<LiveMarketSummaryBaselineAcquisitionResult>;
}
