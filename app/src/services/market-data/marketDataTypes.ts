import type { DecimalString } from '../../domain/trades';

export type MarketDataConnectionState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'disconnected'
  | 'error';

export interface MarketDataInstrument {
  readonly venue: string;
  readonly symbol: string;
}

export interface MarketPriceObservation {
  readonly instrument: MarketDataInstrument;
  readonly price: DecimalString;
  readonly observedAt: string;
  readonly sourceTimestamp: string | null;
}

/**
 * Provider-neutral raw market summary facts for one instrument.
 * P21 presentation must not infer acquisition, universe, ranking, or bubble semantics here.
 */
export interface LiveMarketSummaryFact {
  readonly instrument: MarketDataInstrument;
  readonly lastPrice: DecimalString;
  readonly open24h: DecimalString;
  readonly high24h: DecimalString;
  readonly low24h: DecimalString;
  readonly baseVolume24h: DecimalString;
  readonly quoteVolume24h: DecimalString;
  readonly observedAt: string;
  readonly sourceTimestamp: string | null;
}

/**
 * Provider-neutral delivery semantics for validated live-market summary facts.
 * Completeness is explicit and scoped; acquisition, universe selection, and accumulation stay outside this contract.
 */
export interface LiveMarketSummaryIncrementalDelivery {
  readonly completeness: 'incremental';
  readonly facts: readonly LiveMarketSummaryFact[];
}

export interface LiveMarketSummaryCompleteForScopeDelivery {
  readonly completeness: 'complete-for-scope';
  readonly scope: readonly MarketDataInstrument[];
  readonly facts: readonly LiveMarketSummaryFact[];
}

export type LiveMarketSummaryDelivery =
  | LiveMarketSummaryIncrementalDelivery
  | LiveMarketSummaryCompleteForScopeDelivery;

export interface MarketDataSubscriptionHandlers {
  readonly onPrice: (observation: MarketPriceObservation) => void;
  readonly onStateChange?: (state: MarketDataConnectionState) => void;
  readonly onError?: (error: unknown) => void;
}

export interface MarketDataSubscription {
  readonly close: () => void;
}
