/**
 * U13 (D251): the one owner of "goals kept by month". A month is judged by the goals in force on its last day (today
 * for this month). Each number comes from its own owner: the limits from the calendar's days, closed trades and the
 * result from the day owner, review and tick from the month's discipline score. "Kept" counts only judged goals.
 */
import type { DecimalString } from '../../domain/trades';
import type { ResultsInHomeCurrency } from '../currency/resultsInHomeCurrency';
import type { DisciplineScoreProjection } from '../discipline/disciplineScore';
import type { JournalHistoryEntry } from '../journal';
import { summarizeVisualPnlByDay } from '../visual-pnl';
import { goalsInForceOn, type GoalsSettings } from './goalsPreference';
import { projectMonthlyResult } from './goalsProgress';
import { mondayOf, type LimitsCalendarMonth } from './limitsCalendar';

export type GoalMonthState = 'kept' | 'missed' | 'in-progress' | 'unknown' | 'no-trades';

export type GoalMonthJudgment =
  | Readonly<{ goal: 'trades-per-month'; state: GoalMonthState; current: number; target: number }>
  | Readonly<{ goal: 'monthly-result'; state: GoalMonthState; current: DecimalString | null; target: DecimalString; currency: string; incompleteDays: number }>
  | Readonly<{ goal: 'review-every-trade'; state: GoalMonthState; reviewed: number; closed: number }>
  | Readonly<{ goal: 'tick-every-step'; state: GoalMonthState; ticked: number; closed: number }>
  | Readonly<{ goal: 'max-trades-per-day'; state: GoalMonthState; missedDays: number }>
  | Readonly<{ goal: 'daily-loss'; state: GoalMonthState; missedDays: number; uncounted: number; currency: string }>
  | Readonly<{ goal: 'weekly-loss'; state: GoalMonthState; missedWeeks: number; uncounted: number; currency: string }>;

export interface GoalsMonth {
  readonly monthKey: string;
  readonly thisMonth: boolean;
  /** null: no goals were set then. */
  readonly goals: readonly GoalMonthJudgment[] | null;
  readonly kept: number;
  readonly missed: number;
  readonly inProgress: number;
  readonly unknown: number;
  /** Goals judged (all but "no trades"). */
  readonly judged: number;
}

export interface GoalsMonthsInput {
  readonly settings: GoalsSettings | null;
  readonly calendar: readonly LimitsCalendarMonth[];
  /** Closed real trades in the window, in their own currencies. */
  readonly closedEntries: readonly JournalHistoryEntry[];
  readonly inHome: ResultsInHomeCurrency | null;
  /** Each month's discipline score, by month key. */
  readonly scores: ReadonlyMap<string, DisciplineScoreProjection>;
  readonly checklistSteps: number;
  readonly timeZone: string;
  readonly todayKey: string;
}

export function projectGoalsMonths(input: GoalsMonthsInput): readonly GoalsMonth[] {
  const { settings, calendar, closedEntries, inHome, scores, checklistSteps, timeZone, todayKey } = input;
  const days = summarizeVisualPnlByDay(closedEntries.filter(entry => entry.trade.status === 'closed'), timeZone).days;
  const homeDays = inHome === null ? null : summarizeVisualPnlByDay(inHome.entries.filter(entry => entry.trade.status === 'closed'), timeZone).days;
  const thisMonthKey = todayKey.slice(0, 7);

  return Object.freeze(calendar.map(month => {
    const thisMonth = month.monthKey === thisMonthKey;
    const lastKey = thisMonth ? todayKey : month.days[month.days.length - 1]!.dayKey;
    const goals = goalsInForceOn(settings, lastKey);
    if (goals === null) return Object.freeze({ monthKey: month.monthKey, thisMonth, goals: null, kept: 0, missed: 0, inProgress: 0, unknown: 0, judged: 0 });
    const open = (reached: boolean): GoalMonthState => (reached ? 'kept' : thisMonth ? 'in-progress' : 'missed');
    const monthDays = days.filter(day => day.dayKey.startsWith(`${month.monthKey}-`));
    const judgments: GoalMonthJudgment[] = [];

    if (goals.tradesPerMonthTarget !== null) {
      const current = monthDays.reduce((count, day) => count + day.summary.tradeCount, 0);
      judgments.push({ goal: 'trades-per-month', state: open(current >= goals.tradesPerMonthTarget), current, target: goals.tradesPerMonthTarget });
    }
    const target = goals.monthlyResultTarget;
    if (target !== null) {
      const resultDays = homeDays !== null && inHome?.homeCurrency === target.currency ? homeDays.filter(day => day.dayKey.startsWith(`${month.monthKey}-`)) : monthDays;
      const result = projectMonthlyResult(resultDays, target);
      judgments.push(result.kind === 'progress'
        ? { goal: 'monthly-result', state: open(result.reached), current: result.current, target: target.amount, currency: target.currency, incompleteDays: result.incompleteDays }
        : { goal: 'monthly-result', state: monthDays.length === 0 ? 'no-trades' : 'unknown', current: null, target: target.amount, currency: target.currency, incompleteDays: result.kind === 'unavailable' ? result.incompleteDays : 0 });
    }
    const score = scores.get(month.monthKey) ?? null;
    if (goals.reviewEveryTrade) {
      judgments.push(score === null || !score.available
        ? { goal: 'review-every-trade', state: 'no-trades', reviewed: 0, closed: 0 }
        : { goal: 'review-every-trade', state: open(score.review.reviewedCount === score.review.closedCount), reviewed: score.review.reviewedCount, closed: score.review.closedCount });
    }
    if (goals.tickEveryStep) {
      const ticked = score?.available ? score.checklist?.fullTradeCount ?? 0 : 0;
      judgments.push(checklistSteps === 0 ? { goal: 'tick-every-step', state: 'unknown', ticked: 0, closed: 0 }
        : score === null || !score.available ? { goal: 'tick-every-step', state: 'no-trades', ticked: 0, closed: 0 }
        : { goal: 'tick-every-step', state: open(ticked === score.review.closedCount), ticked, closed: score.review.closedCount });
    }

    // The limits: a break is final, even this month.
    const limitState = (judged: number, broken: number, unknownDays: number): GoalMonthState =>
      broken > 0 ? 'missed' : unknownDays > 0 ? 'unknown' : judged === 0 ? 'no-trades' : thisMonth ? 'in-progress' : 'kept';
    if (goals.maxTradesPerDay !== null) {
      const judged = month.days.filter(day => day.trades !== null);
      const missedDays = judged.filter(day => day.trades?.state === 'over').length;
      judgments.push({ goal: 'max-trades-per-day', state: limitState(judged.length, missedDays, 0), missedDays });
    }
    const limits = goals.lossLimits;
    if (limits !== null && limits.perDay !== null) {
      const judged = month.days.filter(day => day.dayLoss !== null);
      const missedDays = judged.filter(day => day.dayLoss?.kind === 'counted' && day.dayLoss.state === 'over').length;
      const unknownDays = judged.filter(day => day.dayLoss?.kind === 'unknown');
      const uncounted = unknownDays.reduce((count, day) => count + (day.dayLoss?.kind === 'unknown' ? day.dayLoss.uncounted : 0), 0);
      judgments.push({ goal: 'daily-loss', state: limitState(judged.length, missedDays, unknownDays.length), missedDays, uncounted, currency: limits.currency });
    }
    if (limits !== null && limits.perWeek !== null) {
      const judged = month.days.filter(day => day.weekLoss !== null);
      // A week over its limit counts once, however many of its days show it.
      const overWeeks = new Set(judged.filter(day => day.weekLoss?.kind === 'counted' && day.weekLoss.state === 'over').map(day => mondayOf(day.dayKey)));
      const unknownDays = judged.filter(day => day.weekLoss?.kind === 'unknown');
      const uncounted = unknownDays.reduce((count, day) => Math.max(count, day.weekLoss?.kind === 'unknown' ? day.weekLoss.uncounted : 0), 0);
      judgments.push({ goal: 'weekly-loss', state: limitState(judged.length, overWeeks.size, unknownDays.length), missedWeeks: overWeeks.size, uncounted, currency: limits.currency });
    }

    const count = (state: GoalMonthState) => judgments.filter(item => item.state === state).length;
    return Object.freeze({
      monthKey: month.monthKey, thisMonth, goals: Object.freeze(judgments.map(item => Object.freeze(item))),
      kept: count('kept'), missed: count('missed'), inProgress: count('in-progress'), unknown: count('unknown'), judged: judgments.length - count('no-trades'),
    });
  }));
}
