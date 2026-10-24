import type {
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from './marketDataTypes';
import {
  getLiveMarketSummaryDeliveryStateFact,
  type LiveMarketSummaryDeliveryState,
} from './liveMarketSummaryDeliveryState';

/**
 * One caller-requested association in a provider-neutral state snapshot.
 * Entry order mirrors caller request order only; it is never ranking,
 * filtering, popularity, market-cap, or presentation truth.
 */
export interface LiveMarketSummaryScopedStateSnapshotEntry {
  readonly instrument: MarketDataInstrument;
  readonly fact: LiveMarketSummaryFact | null;
}

/**
 * Pure scoped read projection over released P21.16 state semantics.
 * No universe discovery, acquisition, mutation, session transition,
 * freshness, completeness, persistence, or presentation policy is added.
 */
export function readLiveMarketSummaryScopedStateSnapshot(
  state: LiveMarketSummaryDeliveryState,
  scope: readonly MarketDataInstrument[],
): readonly LiveMarketSummaryScopedStateSnapshotEntry[] {
  return scope.map((instrument) => ({
    instrument,
    fact: getLiveMarketSummaryDeliveryStateFact(state, instrument),
  }));
}
