import { decimalSum } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import {
  assessVisualPnlAggregationEligibility,
  type VisualPnlAggregationBlockReason,
} from './aggregationEligibility';
import type { VisualPnlOutcomeProjection } from './outcomeProjection';

export type VisualPnlAggregateOutcome = 'profit' | 'loss' | 'breakeven';

export type VisualPnlAggregationSummary =
  | Readonly<{
      available: true;
      currency: string;
      total: DecimalString;
      outcome: VisualPnlAggregateOutcome;
      tradeCount: number;
    }>
  | Readonly<{
      available: false;
      currency: null;
      total: null;
      outcome: null;
      tradeCount: number;
      reason: VisualPnlAggregationBlockReason | 'invalid-aggregate-decimal';
    }>;

function classify(total: DecimalString): VisualPnlAggregateOutcome {
  if (total === '0') return 'breakeven';
  return total.startsWith('-') ? 'loss' : 'profit';
}

/**
 * Produces one aggregate Visual P&L summary only after P13.4R1 proves that
 * every contributing projection carries comparable explicit currency evidence.
 *
 * Financial addition remains owned by the Calculation Engine decimal kernel.
 * This application module does not use Number arithmetic and performs no FX.
 */
export function summarizeVisualPnlAggregation(
  projections: readonly VisualPnlOutcomeProjection[],
): VisualPnlAggregationSummary {
  const eligibility = assessVisualPnlAggregationEligibility(projections);
  if (!eligibility.eligible) {
    return Object.freeze({
      available: false,
      currency: null,
      total: null,
      outcome: null,
      tradeCount: projections.length,
      reason: eligibility.reason,
    });
  }

  const sum = decimalSum(eligibility.amounts);
  if (!sum.ok) {
    return Object.freeze({
      available: false,
      currency: null,
      total: null,
      outcome: null,
      tradeCount: projections.length,
      reason: 'invalid-aggregate-decimal',
    });
  }

  return Object.freeze({
    available: true,
    currency: eligibility.currency,
    total: sum.value,
    outcome: classify(sum.value),
    tradeCount: projections.length,
  });
}
