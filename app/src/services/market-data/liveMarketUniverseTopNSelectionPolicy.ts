import type { LiveMarketSummaryFact } from './marketDataTypes';

export const DEFAULT_LIVE_MARKET_UNIVERSE_TOP_N_COUNT = 30 as const;

function resolveTopNCount(count: number | undefined): number {
  const value = count ?? DEFAULT_LIVE_MARKET_UNIVERSE_TOP_N_COUNT;
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('Live Market Universe Top-N count must be a positive integer.');
  }
  return value;
}

export function selectLiveMarketUniverseTopN(
  orderedFacts: readonly LiveMarketSummaryFact[],
  count?: number,
): readonly LiveMarketSummaryFact[] {
  return orderedFacts.slice(0, resolveTopNCount(count));
}
