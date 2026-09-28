import { decimalAdd } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import type { VisualPnlProgressSeriesProjection } from './progressSeries';

export interface VisualPnlCumulativeRealizedPnlPoint {
  readonly dayKey: string;
  readonly dailyAmount: DecimalString;
  readonly cumulativeAmount: DecimalString;
}

export type VisualPnlCumulativeRealizedPnlProjection =
  | Readonly<{
      available: true;
      currency: string;
      points: readonly VisualPnlCumulativeRealizedPnlPoint[];
    }>
  | Readonly<{
      available: false;
      currency: null;
      points: readonly VisualPnlCumulativeRealizedPnlPoint[];
      reason:
        | 'no-result-days'
        | 'unavailable-result-day'
        | 'mixed-currencies'
        | 'invalid-cumulative-decimal';
    }>;

const EMPTY_CUMULATIVE_POINTS: readonly VisualPnlCumulativeRealizedPnlPoint[] = Object.freeze([]);

/**
 * Builds cumulative realized P&L only after P13.17R1 has proven the supplied
 * daily result series is available in one explicit comparable currency.
 *
 * This is not account equity. It has no opening balance, deposits, withdrawals,
 * unrealized P&L, or broker-account state. Decimal addition remains owned by
 * the Calculation Engine.
 */
export function projectVisualPnlCumulativeRealizedPnl(
  series: VisualPnlProgressSeriesProjection,
): VisualPnlCumulativeRealizedPnlProjection {
  if (!series.available) {
    return Object.freeze({
      available: false,
      currency: null,
      points: EMPTY_CUMULATIVE_POINTS,
      reason: series.reason,
    });
  }

  let cumulative: DecimalString = '0' as DecimalString;
  const points: VisualPnlCumulativeRealizedPnlPoint[] = [];

  for (const point of series.points) {
    const next = decimalAdd(cumulative, point.amount);
    if (!next.ok) {
      return Object.freeze({
        available: false,
        currency: null,
        points: EMPTY_CUMULATIVE_POINTS,
        reason: 'invalid-cumulative-decimal',
      });
    }

    cumulative = next.value;
    points.push(Object.freeze({
      dayKey: point.dayKey,
      dailyAmount: point.amount,
      cumulativeAmount: cumulative,
    }));
  }

  return Object.freeze({
    available: true,
    currency: series.currency,
    points: Object.freeze(points),
  });
}
