import type { DecimalString } from '../../domain/trades';
import type { VisualPnlDailySummary } from './dailySummary';

export interface VisualPnlProgressPoint {
  readonly dayKey: string;
  readonly amount: DecimalString;
  readonly outcome: 'profit' | 'loss' | 'breakeven';
}

export type VisualPnlProgressSeriesProjection =
  | Readonly<{ available: true; currency: string; points: readonly VisualPnlProgressPoint[] }>
  | Readonly<{
      available: false;
      currency: null;
      points: readonly VisualPnlProgressPoint[];
      reason: 'no-result-days' | 'unavailable-result-day' | 'mixed-currencies';
    }>;

const EMPTY_PROGRESS_POINTS: readonly VisualPnlProgressPoint[] = Object.freeze([]);

export function projectVisualPnlProgressSeries(
  days: readonly VisualPnlDailySummary[],
): VisualPnlProgressSeriesProjection {
  if (days.length === 0) {
    return Object.freeze({ available: false, currency: null, points: EMPTY_PROGRESS_POINTS, reason: 'no-result-days' });
  }
  let currency: string | null = null;
  const points: VisualPnlProgressPoint[] = [];
  for (const day of days) {
    if (!day.summary.available) {
      return Object.freeze({ available: false, currency: null, points: EMPTY_PROGRESS_POINTS, reason: 'unavailable-result-day' });
    }
    if (currency === null) currency = day.summary.currency;
    else if (currency !== day.summary.currency) {
      return Object.freeze({ available: false, currency: null, points: EMPTY_PROGRESS_POINTS, reason: 'mixed-currencies' });
    }
    points.push(Object.freeze({ dayKey: day.dayKey, amount: day.summary.total, outcome: day.summary.outcome }));
  }
  return Object.freeze({ available: true, currency: currency!, points: Object.freeze(points) });
}
