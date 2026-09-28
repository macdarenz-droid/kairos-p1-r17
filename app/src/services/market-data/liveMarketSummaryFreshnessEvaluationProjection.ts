import {
  LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_V1,
  classifyLiveMarketSummaryObservationAge,
  type LiveMarketSummaryFreshnessClassification,
  type LiveMarketSummaryFreshnessClassificationPolicy,
} from './liveMarketSummaryFreshnessClassificationPolicy';
import { validateLiveMarketSummaryFact } from './liveMarketSummaryFactSemantics';
import type {
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from './marketDataTypes';
import type { LiveMarketSummaryScopedStateSnapshotEntry } from './liveMarketSummaryScopedStateSnapshot';

export interface LiveMarketSummaryFreshnessEvaluationProjectionEntry {
  readonly instrument: MarketDataInstrument;
  readonly fact: LiveMarketSummaryFact | null;
  readonly ageMs: number | null;
  readonly freshness: LiveMarketSummaryFreshnessClassification | null;
}

export type LiveMarketSummaryFreshnessEvaluationProjectionResult =
  | {
      readonly ok: true;
      readonly evaluationTimeMs: number;
      readonly entries: readonly LiveMarketSummaryFreshnessEvaluationProjectionEntry[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'evaluation-time-invalid'
        | 'fact-invalid'
        | 'observation-after-evaluation';
    };

/**
 * Provider-neutral freshness evaluation over an already-released scoped snapshot.
 * The caller owns evaluation time. Missing facts remain explicit missing values.
 * Present facts keep exact identity and delegate only age classification to the
 * released freshness policy owner.
 */
export function evaluateLiveMarketSummaryScopedSnapshotFreshness(
  scopedSnapshot: readonly LiveMarketSummaryScopedStateSnapshotEntry[],
  evaluationTimeMs: number,
  policy: LiveMarketSummaryFreshnessClassificationPolicy = LIVE_MARKET_SUMMARY_FRESHNESS_CLASSIFICATION_POLICY_V1,
): LiveMarketSummaryFreshnessEvaluationProjectionResult {
  if (!Number.isFinite(evaluationTimeMs) || evaluationTimeMs < 0) {
    return { ok: false, reason: 'evaluation-time-invalid' };
  }

  const entries: LiveMarketSummaryFreshnessEvaluationProjectionEntry[] = [];
  for (const entry of scopedSnapshot) {
    if (entry.fact === null) {
      entries.push({
        instrument: entry.instrument,
        fact: null,
        ageMs: null,
        freshness: null,
      });
      continue;
    }

    const validation = validateLiveMarketSummaryFact(entry.fact);
    if (!validation.ok) return { ok: false, reason: 'fact-invalid' };

    const observedAtMs = Date.parse(entry.fact.observedAt);
    if (observedAtMs > evaluationTimeMs) {
      return { ok: false, reason: 'observation-after-evaluation' };
    }

    const ageMs = evaluationTimeMs - observedAtMs;
    entries.push({
      instrument: entry.instrument,
      fact: entry.fact,
      ageMs,
      freshness: classifyLiveMarketSummaryObservationAge(ageMs, policy),
    });
  }

  return { ok: true, evaluationTimeMs, entries };
}
