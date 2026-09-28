import type { VisualPnlDailySummary } from './dailySummary';

export type VisualPnlDailyStreakOutcome = 'profit' | 'loss' | 'breakeven';

export interface VisualPnlDailyStreakProjection {
  readonly outcome: VisualPnlDailyStreakOutcome | null;
  readonly length: number;
  readonly startDayKey: string | null;
  readonly endDayKey: string | null;
}

/**
 * Projects the current consecutive result-day streak from authoritative P13.7
 * daily summaries.
 *
 * "Consecutive" means consecutive available result days in the supplied daily
 * summary sequence, not consecutive calendar dates. Days with no trades do not
 * exist in the P13.7 projection and therefore do not invent a break. An
 * unavailable daily result is explicit evidence that the streak cannot safely
 * continue and resets the projection.
 *
 * No financial arithmetic, FX, timezone inference, database access, or date
 * parsing occurs here.
 */
export function projectVisualPnlDailyStreak(
  days: readonly VisualPnlDailySummary[],
): VisualPnlDailyStreakProjection {
  let outcome: VisualPnlDailyStreakOutcome | null = null;
  let length = 0;
  let startDayKey: string | null = null;
  let endDayKey: string | null = null;

  for (const day of days) {
    if (!day.summary.available) {
      outcome = null;
      length = 0;
      startDayKey = null;
      endDayKey = null;
      continue;
    }

    if (day.summary.outcome !== outcome) {
      outcome = day.summary.outcome;
      length = 1;
      startDayKey = day.dayKey;
      endDayKey = day.dayKey;
      continue;
    }

    length += 1;
    endDayKey = day.dayKey;
  }

  return Object.freeze({ outcome, length, startDayKey, endDayKey });
}
