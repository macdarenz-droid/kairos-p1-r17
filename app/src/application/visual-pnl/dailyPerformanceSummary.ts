import type { VisualPnlDailySummary } from './dailySummary';

export interface VisualPnlDailyPerformanceSummary {
  readonly availableResultDays: number;
  readonly profitDays: number;
  readonly lossDays: number;
  readonly breakEvenDays: number;
  readonly unavailableResultDays: number;
  readonly totalResultDays: number;
}

/**
 * Counts semantic day outcomes from authoritative P13.7 daily summaries.
 * This is a count-only summary: no money is summed and no rates, percentages,
 * FX conversions, dates, or account-equity values are derived.
 */
export function summarizeVisualPnlDailyPerformance(
  days: readonly VisualPnlDailySummary[],
): VisualPnlDailyPerformanceSummary {
  let profitDays = 0;
  let lossDays = 0;
  let breakEvenDays = 0;
  let unavailableResultDays = 0;

  for (const day of days) {
    if (!day.summary.available) {
      unavailableResultDays += 1;
      continue;
    }
    if (day.summary.outcome === 'profit') profitDays += 1;
    else if (day.summary.outcome === 'loss') lossDays += 1;
    else breakEvenDays += 1;
  }

  const availableResultDays = profitDays + lossDays + breakEvenDays;
  return Object.freeze({
    availableResultDays,
    profitDays,
    lossDays,
    breakEvenDays,
    unavailableResultDays,
    totalResultDays: availableResultDays + unavailableResultDays,
  });
}
