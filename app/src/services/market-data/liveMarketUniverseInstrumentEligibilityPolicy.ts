import type { LiveMarketUniverseInstrumentMetadataFact } from './liveMarketUniverseInstrumentMetadataFact';

export interface LiveMarketUniverseInstrumentEligibilityPolicyOptions {
  readonly excludedStablecoinBaseAssets: ReadonlySet<string>;
}

/**
 * Deterministic product policy for Live Crypto V1 instrument eligibility only.
 * Ranking, limiting, freshness/cadence, state and presentation remain separate owners.
 */
export function isLiveMarketUniverseInstrumentEligible(
  fact: LiveMarketUniverseInstrumentMetadataFact,
  options: LiveMarketUniverseInstrumentEligibilityPolicyOptions,
): boolean {
  return fact.tradingEnabled
    && fact.quoteAsset === 'USDT'
    && !options.excludedStablecoinBaseAssets.has(fact.baseAsset);
}
