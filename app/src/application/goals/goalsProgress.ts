import { decimalCompare, decimalScaleToSteps, decimalSubtract, decimalSum } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades/tradeTypes';
import type { ResultsInHomeCurrency } from '../currency/resultsInHomeCurrency';
import type { DisciplineScoreProjection } from '../discipline/disciplineScore';
import type { JournalHistoryEntry } from '../journal';
import { projectVisualPnlDayKey, projectVisualPnlPeriod, summarizeVisualPnlByDay, type VisualPnlDailySummary } from '../visual-pnl';
import type { GoalsPreference } from './goalsPreference';
import { judgeLoss, projectCountedDays, projectLossOver, type LossCount, type LossJudgment } from './lossLimits';

/**
 * P26.2 read-only goals progress projection.
 *
 * Counts and compares only: closed trades per calendar month and trades opened
 * per calendar day come from the released P12 history entries through the P13.6
 * day-key contract; the monthly realized result comes from the P13.7 daily
 * summaries and the P13.5 aggregation (decimal kernel, one explicit currency,
 * no FX). Nothing here writes, infers a time zone or invents a result.
 */
export interface GoalsProgressInput {
  readonly preference: GoalsPreference;
  /** Closed trades since the earlier of the month's first day and this week's Monday, plus open trades, in their own currencies. */
  readonly entries: readonly JournalHistoryEntry[];
  /** U13: the closed ones in the home currency, used by a goal set in that currency (D116, D247). */
  readonly inHome?: ResultsInHomeCurrency | null;
  readonly timeZone: string;
  /** The current instant as a canonical UTC ISO string. */
  readonly now: string;
  /** U13 (D248): this month's discipline score and how many steps the checklist has, when a habit goal is on. */
  readonly discipline?: Readonly<{ score: DisciplineScoreProjection; checklistSteps: number }> | null;
}

/** U13 (D249): every goal carries `fill`, 0–100, for its ring or bar: counts half up and capped, money through the kernel. */
export type GoalsTradesPerMonthProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'progress'; target: number; current: number; reached: boolean; fill: number }>;

export type GoalsMaxTradesPerDayProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'limit'; limit: number; today: number; remaining: number; exceeded: boolean; fill: number }>;

export type GoalsMonthlyResultProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'unavailable'; target: DecimalString; currency: string; reason: 'no-comparable-days' | 'aggregate-failed'; incompleteDays: number }>
  | Readonly<{ kind: 'progress'; target: DecimalString; currency: string; current: DecimalString; remaining: DecimalString; reached: boolean; comparableDays: number; incompleteDays: number; fill: number }>;

/** U13 (D247): what was lost today or this week against its limit; `left` is never below 0. */
export type GoalsLossProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'counted'; limit: DecimalString; currency: string; lost: DecimalString; left: DecimalString; state: LossJudgment; fill: number; closedTrades: number }>
  | Readonly<{ kind: 'unknown'; limit: DecimalString; currency: string; uncounted: number }>;

/** U13 (D248): "Review every trade" over this month's closed trades. */
export type GoalsReviewProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'progress'; reviewed: number; closed: number; fill: number; reached: boolean }>;

/** U13 (D248): "Tick every step" over this month's closed trades; a trade logged after it closed counts as not ticked. */
export type GoalsTickProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'no-steps' }>
  | Readonly<{ kind: 'progress'; ticked: number; closed: number; fill: number; reached: boolean }>;

export type GoalsProgressProjection =
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' | 'invalid-time-zone' }>
  | Readonly<{
      kind: 'ready';
      timeZone: string;
      todayKey: string;
      monthKey: string;
      /** This week's Monday (D247). */
      weekFromDayKey: string;
      /** How many trades were read: every closed trade since the month (or this week) began, plus every open trade. */
      consideredEntries: number;
      tradesPerMonth: GoalsTradesPerMonthProgress;
      maxTradesPerDay: GoalsMaxTradesPerDayProgress;
      monthlyResult: GoalsMonthlyResultProgress;
      dailyLoss: GoalsLossProgress;
      weeklyLoss: GoalsLossProgress;
      reviewEveryTrade: GoalsReviewProgress;
      tickEveryStep: GoalsTickProgress;
    }>;

const isNegative = (value: DecimalString): boolean => value.startsWith('-');
const UNSET = Object.freeze({ kind: 'unset' as const });
const ZERO = '0' as DecimalString;

/** A count's fill: n ÷ of as a whole percent, half up, capped at 100 (counts, never money). */
const countFill = (n: number, of: number): number => (of <= 0 ? 0 : Math.min(100, Math.floor((200 * n + of) / (2 * of))));

/** The month result against its target (D116): only days in the target's currency count, and the others are counted apart. */
export function projectMonthlyResult(monthDays: readonly Pick<VisualPnlDailySummary, 'summary'>[], target: GoalsPreference['monthlyResultTarget']): GoalsMonthlyResultProgress {
  if (target === null) return UNSET;
  const { amount, currency } = target;
  const comparable = monthDays.filter((day) => day.summary.available && day.summary.currency === currency);
  const incompleteDays = monthDays.length - comparable.length;
  if (comparable.length === 0) return Object.freeze({ kind: 'unavailable' as const, target: amount, currency, reason: 'no-comparable-days' as const, incompleteDays });
  const total = decimalSum(comparable.map((day) => day.summary.total as DecimalString));
  const remaining = total.ok ? decimalSubtract(amount, total.value) : total;
  if (!total.ok || !remaining.ok) return Object.freeze({ kind: 'unavailable' as const, target: amount, currency, reason: 'aggregate-failed' as const, incompleteDays });
  return Object.freeze({
    kind: 'progress' as const, target: amount, currency, current: total.value, remaining: isNegative(remaining.value) ? ZERO : remaining.value,
    reached: !isNegative(remaining.value) ? remaining.value === '0' : true, comparableDays: comparable.length, incompleteDays,
    fill: decimalScaleToSteps(total.value, amount, 100) ?? 0,
  });
}

function lossProgress(count: LossCount, limit: DecimalString | null, currency: string): GoalsLossProgress {
  if (limit === null) return UNSET;
  if (count.kind === 'unknown') return Object.freeze({ kind: 'unknown' as const, limit, currency, uncounted: count.uncounted });
  const state = judgeLoss(count.lost, limit);
  const left = decimalSubtract(limit, count.lost);
  if (state === null || !left.ok) return Object.freeze({ kind: 'unknown' as const, limit, currency, uncounted: count.closedTrades });
  return Object.freeze({
    kind: 'counted' as const, limit, currency, lost: count.lost, left: isNegative(left.value) ? ZERO : left.value, state,
    fill: decimalScaleToSteps(count.lost, limit, 100) ?? 0, closedTrades: count.closedTrades,
  });
}

export function projectGoalsProgress({ preference, entries, inHome = null, timeZone, now, discipline = null }: GoalsProgressInput): GoalsProgressProjection {
  const today = projectVisualPnlDayKey(now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: today.reason === 'invalid-time-zone' ? 'invalid-time-zone' as const : 'invalid-now' as const });
  const todayKey = today.dayKey, monthKey = todayKey.slice(0, 7);
  const week = projectVisualPnlPeriod({ kind: 'week', at: null }, todayKey);
  const weekFromDayKey = week.ok && week.period.fromDayKey !== null ? week.period.fromDayKey : todayKey;

  const closed = entries.filter((entry) => entry.trade.status === 'closed');
  const monthDays = summarizeVisualPnlByDay(closed, timeZone).days.filter((day) => day.dayKey.startsWith(`${monthKey}-`));
  const closedThisMonth = monthDays.reduce((count, day) => count + day.summary.tradeCount, 0);

  let openedToday = 0;
  for (const entry of entries) {
    if (entry.trade.status !== 'open' && entry.trade.status !== 'closed') continue;
    const opened = projectVisualPnlDayKey(entry.trade.openedAt, timeZone);
    if (opened.available && opened.dayKey === todayKey) openedToday += 1;
  }

  const tradesPerMonth: GoalsTradesPerMonthProgress = preference.tradesPerMonthTarget === null
    ? UNSET
    : Object.freeze({ kind: 'progress' as const, target: preference.tradesPerMonthTarget, current: closedThisMonth, reached: closedThisMonth >= preference.tradesPerMonthTarget, fill: countFill(closedThisMonth, preference.tradesPerMonthTarget) });

  const maxTradesPerDay: GoalsMaxTradesPerDayProgress = preference.maxTradesPerDay === null
    ? UNSET
    : Object.freeze({ kind: 'limit' as const, limit: preference.maxTradesPerDay, today: openedToday, remaining: Math.max(0, preference.maxTradesPerDay - openedToday), exceeded: openedToday > preference.maxTradesPerDay, fill: countFill(openedToday, preference.maxTradesPerDay) });

  // D116: a result target in the home currency counts the results converted into it.
  const target = preference.monthlyResultTarget;
  const resultDays = target !== null && inHome !== null && inHome.homeCurrency === target.currency
    ? summarizeVisualPnlByDay(inHome.entries.filter((entry) => entry.trade.status === 'closed'), timeZone).days.filter((day) => day.dayKey.startsWith(`${monthKey}-`))
    : monthDays;
  const monthlyResult = projectMonthlyResult(resultDays, target);

  const limits = preference.lossLimits;
  let dailyLoss: GoalsLossProgress = UNSET, weeklyLoss: GoalsLossProgress = UNSET;
  if (limits !== null) {
    const days = projectCountedDays({ entries: closed, inHome, currency: limits.currency, timeZone });
    dailyLoss = lossProgress(projectLossOver(days, todayKey, todayKey), limits.perDay, limits.currency);
    weeklyLoss = lossProgress(projectLossOver(days, weekFromDayKey, todayKey), limits.perWeek, limits.currency);
  }

  const score = discipline?.score ?? null;
  const closedForHabits = score?.available ? score.review.closedCount : 0;
  const reviewEveryTrade: GoalsReviewProgress = !preference.reviewEveryTrade ? UNSET
    : discipline === null ? Object.freeze({ kind: 'unavailable' as const })
    : Object.freeze({ kind: 'progress' as const, reviewed: score?.available ? score.review.reviewedCount : 0, closed: closedForHabits,
      fill: countFill(score?.available ? score.review.reviewedCount : 0, closedForHabits), reached: closedForHabits > 0 && score?.available === true && score.review.reviewedCount === closedForHabits });
  const ticked = score?.available ? score.checklist?.fullTradeCount ?? 0 : 0;
  const tickEveryStep: GoalsTickProgress = !preference.tickEveryStep ? UNSET
    : discipline === null ? Object.freeze({ kind: 'unavailable' as const })
    : discipline.checklistSteps === 0 ? Object.freeze({ kind: 'no-steps' as const })
    : Object.freeze({ kind: 'progress' as const, ticked, closed: closedForHabits, fill: countFill(ticked, closedForHabits), reached: closedForHabits > 0 && ticked === closedForHabits });

  return Object.freeze({
    kind: 'ready' as const, timeZone, todayKey, monthKey, weekFromDayKey, consideredEntries: entries.length,
    tradesPerMonth, maxTradesPerDay, monthlyResult, dailyLoss, weeklyLoss, reviewEveryTrade, tickEveryStep,
  });
}
