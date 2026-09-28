export type LiveMarketSummaryFreshnessClassification = 'fresh' | 'stale' | 'expired';

export interface LiveMarketSummaryFreshnessClassificationPolicy {
  readonly freshMaxAgeMs: number;
  readonly staleMaxAgeMs: number;
}

/**
 * V1 product-policy thresholds. This module owns classification only; it does
 * not own a clock, observedAt parsing, acquisition cadence, or presentation.
 */
export const LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_V1 = Object.freeze({
  freshMaxAgeMs: 15_000,
  staleMaxAgeMs: 60_000,
}) satisfies LiveMarketSummaryFreshnessClassificationPolicy;

/**
 * Classify an already-computed, caller-owned observation age in milliseconds.
 * Callers are responsible for supplying a deterministic non-negative age.
 */
export function classifyLiveMarketSummaryObservationAge(
  ageMs: number,
  policy: LiveMarketSummaryFreshnessClassificationPolicy = LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_V1,
): LiveMarketSummaryFreshnessClassification {
  if (ageMs <= policy.freshMaxAgeMs) return 'fresh';
  if (ageMs <= policy.staleMaxAgeMs) return 'stale';
  return 'expired';
}
