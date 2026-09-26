import { describe, expect, it } from 'vitest';
import {
  LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_V1,
  classifyLiveMarketSummaryObservationAge,
} from '../src/services/market-data';

describe('Live Market Summary Freshness Classification Policy Foundation', () => {
  it('uses the approved V1 threshold boundaries exactly', () => {
    expect(LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_V1).toEqual({
      freshMaxAgeMs: 15_000,
      staleMaxAgeMs: 60_000,
    });
    expect(classifyLiveMarketSummaryObservationAge(0)).toBe('fresh');
    expect(classifyLiveMarketSummaryObservationAge(15_000)).toBe('fresh');
    expect(classifyLiveMarketSummaryObservationAge(15_001)).toBe('stale');
    expect(classifyLiveMarketSummaryObservationAge(60_000)).toBe('stale');
    expect(classifyLiveMarketSummaryObservationAge(60_001)).toBe('expired');
  });

  it('keeps thresholds policy-owned instead of presentation-hard-coded', () => {
    const policy = { freshMaxAgeMs: 1_000, staleMaxAgeMs: 2_000 } as const;
    expect(classifyLiveMarketSummaryObservationAge(1_000, policy)).toBe('fresh');
    expect(classifyLiveMarketSummaryObservationAge(1_001, policy)).toBe('stale');
    expect(classifyLiveMarketSummaryObservationAge(2_000, policy)).toBe('stale');
    expect(classifyLiveMarketSummaryObservationAge(2_001, policy)).toBe('expired');
  });
});
