import type { DecimalString } from '../../domain/trades';
import type { VisualPnlOutcomeProjection } from './outcomeProjection';

export type VisualPnlAggregationBlockReason =
  | 'no-trades'
  | 'unavailable-trade-outcome'
  | 'missing-currency-evidence'
  | 'mixed-currencies';

export type VisualPnlAggregationEligibility =
  | Readonly<{
      eligible: true;
      currency: string;
      amounts: readonly DecimalString[];
    }>
  | Readonly<{
      eligible: false;
      currency: null;
      amounts: readonly [];
      reason: VisualPnlAggregationBlockReason;
    }>;

function blocked(reason: VisualPnlAggregationBlockReason): VisualPnlAggregationEligibility {
  return Object.freeze({ eligible: false, currency: null, amounts: Object.freeze([] as []), reason });
}

/**
 * Decides whether multiple already-authoritative Visual P&L projections may be
 * combined by a later calculation owner.
 *
 * This gate intentionally performs no financial arithmetic and no FX/currency
 * inference. Every projection must expose an amount and explicit currency, and
 * every currency string must match exactly. The returned decimal strings are
 * evidence only; this module never sums them.
 */
export function assessVisualPnlAggregationEligibility(
  projections: readonly VisualPnlOutcomeProjection[],
): VisualPnlAggregationEligibility {
  if (projections.length === 0) return blocked('no-trades');

  const amounts: DecimalString[] = [];
  let currency: string | null = null;

  for (const projection of projections) {
    if (projection.outcome === 'unavailable' || projection.amount === null) {
      return blocked('unavailable-trade-outcome');
    }
    if (projection.currency === null || projection.currency.length === 0) {
      return blocked('missing-currency-evidence');
    }
    if (currency === null) currency = projection.currency;
    else if (projection.currency !== currency) return blocked('mixed-currencies');

    amounts.push(projection.amount);
  }

  return Object.freeze({
    eligible: true,
    currency: currency as string,
    amounts: Object.freeze(amounts),
  });
}
