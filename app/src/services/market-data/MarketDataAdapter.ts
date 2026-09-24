import type {
  MarketDataInstrument,
  MarketDataSubscription,
  MarketDataSubscriptionHandlers,
} from './marketDataTypes';

/**
 * Replaceable boundary for external market observations.
 *
 * P15 owns transport/provider adaptation only. It does not rewrite journal
 * executions, calculated P&L, planned levels, or any other authoritative
 * trading truth owned by earlier phases.
 */
export interface MarketDataAdapter {
  subscribe(
    instrument: MarketDataInstrument,
    handlers: MarketDataSubscriptionHandlers,
    options?: { readonly signal?: AbortSignal },
  ): MarketDataSubscription;
}
