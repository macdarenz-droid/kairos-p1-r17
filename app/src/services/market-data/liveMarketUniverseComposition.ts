import type { LiveMarketSummaryFact, MarketDataInstrument } from './marketDataTypes';
import type { LiveMarketUniverseInstrumentMetadataFact } from './liveMarketUniverseInstrumentMetadataFact';
import {
  isLiveMarketUniverseInstrumentEligible,
  type LiveMarketUniverseInstrumentEligibilityPolicyOptions,
} from './liveMarketUniverseInstrumentEligibilityPolicy';
import { orderLiveMarketUniverseByQuoteVolume } from './liveMarketUniverseQuoteVolumeOrderingPolicy';
import { selectLiveMarketUniverseTopN } from './liveMarketUniverseTopNSelectionPolicy';

export interface LiveMarketUniverseCompositionOptions
  extends LiveMarketUniverseInstrumentEligibilityPolicyOptions {
  readonly topNCount?: number;
}

function instrumentKey(instrument: MarketDataInstrument): string {
  return `${instrument.venue.trim()}::${instrument.symbol.trim()}`;
}

/**
 * Provider-neutral composition of already-authoritative universe metadata and
 * already-available live summary facts. Primitive product policy remains owned
 * by the released eligibility, ordering, and Top-N policy modules.
 */
export function composeLiveMarketUniverse(
  metadataFacts: readonly LiveMarketUniverseInstrumentMetadataFact[],
  summaryFacts: readonly LiveMarketSummaryFact[],
  options: LiveMarketUniverseCompositionOptions,
): readonly MarketDataInstrument[] {
  const eligibleInstrumentKeys = new Set(
    metadataFacts
      .filter((fact) => isLiveMarketUniverseInstrumentEligible(fact, options))
      .map((fact) => instrumentKey(fact.instrument)),
  );

  const joinedSummaryFacts = summaryFacts.filter((fact) =>
    eligibleInstrumentKeys.has(instrumentKey(fact.instrument)),
  );

  const orderedFacts = orderLiveMarketUniverseByQuoteVolume(joinedSummaryFacts);
  const selectedFacts = selectLiveMarketUniverseTopN(orderedFacts, options.topNCount);
  return selectedFacts.map((fact) => fact.instrument);
}
