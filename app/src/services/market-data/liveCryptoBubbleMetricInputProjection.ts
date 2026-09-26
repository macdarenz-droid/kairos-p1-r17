import type { DecimalString } from '../../domain/trades';
import {
  deriveLiveMarketSummary24hPercentageMovement,
  type LiveMarketSummary24hPercentageMovementResult,
} from './liveMarketSummary24hPercentageMovement';
import type {
  LiveMarketSummaryFreshnessEvaluationProjectionEntry,
  LiveMarketSummaryFreshnessEvaluationProjectionResult,
} from './liveMarketSummaryFreshnessEvaluationProjection';
import type { LiveMarketSummaryFreshnessClassification } from './liveMarketSummaryFreshnessClassificationPolicy';
import type {
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from './marketDataTypes';

export interface LiveCryptoBubbleMetricInputProjectionEntry {
  readonly instrument: MarketDataInstrument;
  readonly fact: LiveMarketSummaryFact | null;
  readonly ageMs: number | null;
  readonly freshness: LiveMarketSummaryFreshnessClassification | null;
  readonly quoteVolume24h: DecimalString | null;
  readonly movementPercent24h: DecimalString | null;
}

type LiveMarketSummaryFreshnessEvaluationFailure = Extract<
  LiveMarketSummaryFreshnessEvaluationProjectionResult,
  { readonly ok: false }
>;

type LiveMarketSummary24hPercentageMovementFailure = Extract<
  LiveMarketSummary24hPercentageMovementResult,
  { readonly ok: false }
>;

export type LiveCryptoBubbleMetricInputProjectionResult =
  | {
      readonly ok: true;
      readonly evaluationTimeMs: number;
      readonly entries: readonly LiveCryptoBubbleMetricInputProjectionEntry[];
    }
  | {
      readonly ok: false;
      readonly reason: 'freshness-evaluation-invalid';
      readonly freshnessReason: LiveMarketSummaryFreshnessEvaluationFailure['reason'];
    }
  | {
      readonly ok: false;
      readonly reason: 'movement-derivation-invalid';
      readonly entryIndex: number;
      readonly movementReason: LiveMarketSummary24hPercentageMovementFailure['reason'];
    };

function projectMissingEntry(
  entry: LiveMarketSummaryFreshnessEvaluationProjectionEntry,
): LiveCryptoBubbleMetricInputProjectionEntry {
  return {
    instrument: entry.instrument,
    fact: null,
    ageMs: entry.ageMs,
    freshness: entry.freshness,
    quoteVolume24h: null,
    movementPercent24h: null,
  };
}

/**
 * Provider-neutral projection from already-evaluated Live Market Summary
 * freshness truth into the two numeric metric inputs approved for the Live
 * Crypto Bubble Map. This owner does not rank, size, color, filter, or render
 * bubbles. Missing facts remain explicit missing metrics.
 */
export function projectLiveCryptoBubbleMetricInputs(
  freshnessEvaluation: LiveMarketSummaryFreshnessEvaluationProjectionResult,
): LiveCryptoBubbleMetricInputProjectionResult {
  if (!freshnessEvaluation.ok) {
    return {
      ok: false,
      reason: 'freshness-evaluation-invalid',
      freshnessReason: freshnessEvaluation.reason,
    };
  }

  const entries: LiveCryptoBubbleMetricInputProjectionEntry[] = [];
  for (let entryIndex = 0; entryIndex < freshnessEvaluation.entries.length; entryIndex += 1) {
    const entry = freshnessEvaluation.entries[entryIndex];
    if (entry.fact === null) {
      entries.push(projectMissingEntry(entry));
      continue;
    }

    const movement = deriveLiveMarketSummary24hPercentageMovement(entry.fact);
    if (!movement.ok) {
      return {
        ok: false,
        reason: 'movement-derivation-invalid',
        entryIndex,
        movementReason: movement.reason,
      };
    }

    entries.push({
      instrument: entry.instrument,
      fact: entry.fact,
      ageMs: entry.ageMs,
      freshness: entry.freshness,
      quoteVolume24h: entry.fact.quoteVolume24h,
      movementPercent24h: movement.movement.movementPercent24h,
    });
  }

  return {
    ok: true,
    evaluationTimeMs: freshnessEvaluation.evaluationTimeMs,
    entries,
  };
}
