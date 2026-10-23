/**
 * U5 (P13.A4, D200): the one read behind "Your results". For a chosen period it gives the period's closed trades (with
 * results in the home currency when one is set), the period's result after fees and the trades that block it, the U4
 * numbers, the result days, the months the calendar may show, the current streak and the discipline ring. Every number
 * comes from its owner; this module only gathers them, picks trades for a tap, and writes nothing.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { TradeId } from '../../domain/trades';
import { summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary, type TradeResultInHomeCurrency } from '../currency/resultsInHomeCurrency';
import { projectDisciplineScore, type DisciplineScoreProjection } from '../discipline/disciplineScore';
import { loadTradeDiscipline } from '../discipline/tradeDiscipline';
import type { JournalHistoryEntry, JournalHistoryScope } from '../journal/historyQuery';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from '../visual-pnl/aggregationSummary';
import { projectVisualPnlDailyStreak, type VisualPnlDailyStreakProjection } from '../visual-pnl/dailyStreak';
import { summarizeVisualPnlByDay, type VisualPnlDailySummaryProjection } from '../visual-pnl/dailySummary';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { shiftVisualPnlMonthKey } from '../visual-pnl/dayKeyCalendar';
import { projectVisualPnlPeriod, type VisualPnlPeriod, type VisualPnlPeriodChoice, type VisualPnlPeriodProblem } from '../visual-pnl/resultsPeriod';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';
import { loadPerformancePeriod } from './loadPerformanceSummary';
import { summarizePerformance, type PerformanceSummary } from './performanceSummary';

export interface ResultsDashboardProjection {
  readonly scope: JournalHistoryScope;
  readonly timeZone: string;
  readonly todayKey: string;
  readonly period: VisualPnlPeriod;
  /** The period's closed trades, oldest close first, with results in the home currency when one is set (copies, D116): for totals and numbers. */
  readonly entries: readonly JournalHistoryEntry[];
  /** The same trades as recorded, in their own currency: for trade lists, which add the "In EUR: …" line from `conversions`. */
  readonly recordedEntries: readonly JournalHistoryEntry[];
  /** Each trade's close day in the saved zone (null when its close time can't be read). */
  readonly tradeDays: Readonly<Record<string, string | null>>;
  /** Per trade, for the "In EUR: …" lines; null when no home currency is chosen. */
  readonly conversions: Readonly<Record<string, TradeResultInHomeCurrency>> | null;
  readonly inHomeCurrency: ResultsInHomeCurrencySummary;
  /** D200: summarizeVisualPnlAggregation over every entry. */
  readonly total: VisualPnlAggregationSummary;
  /** The trades that block the total, oldest close first; all empty when the total is given. */
  readonly totalBlockers: Readonly<{ noResult: readonly TradeId[]; noCurrency: readonly TradeId[]; missingRate: readonly TradeId[] }>;
  readonly summary: PerformanceSummary;
  readonly days: VisualPnlDailySummaryProjection;
  /** Months the calendar may show, oldest first, never after today's month: the period's months; for all time, the first result day's month to today's month. */
  readonly calendarMonths: readonly string[];
  /** D200: the current streak over every result day of all time; null when the period does not hold today. */
  readonly currentStreak: VisualPnlDailyStreakProjection | null;
  readonly discipline: Readonly<{ kind: 'ready'; score: DisciplineScoreProjection }> | Readonly<{ kind: 'error' }>;
}

export type ResultsDashboardQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'invalid-period'; reason: VisualPnlPeriodProblem; timeZone: string; todayKey: string }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' | 'invalid-day-key' | 'invalid-time-zone' | 'empty-period' }>
  | Readonly<{ kind: 'ready'; dashboard: ResultsDashboardProjection }>;

const NO_BLOCKERS = Object.freeze({ noResult: Object.freeze([]), noCurrency: Object.freeze([]), missingRate: Object.freeze([]) });

function projectTotalBlockers(entries: readonly JournalHistoryEntry[], conversions: Readonly<Record<string, TradeResultInHomeCurrency>> | null): ResultsDashboardProjection['totalBlockers'] {
  const noResult: TradeId[] = [];
  const noCurrency: TradeId[] = [];
  const missingRate: TradeId[] = [];
  for (const entry of entries) {
    const { outcome, amount, currency } = entry.visualPnl;
    if (outcome === 'unavailable') noResult.push(entry.trade.id);
    else if (amount !== null && !currency) noCurrency.push(entry.trade.id);
    if (conversions?.[entry.trade.id]?.kind === 'missing-rate') missingRate.push(entry.trade.id);
  }
  return Object.freeze({ noResult: Object.freeze(noResult), noCurrency: Object.freeze(noCurrency), missingRate: Object.freeze(missingRate) });
}

/** Every month from `firstMonth` to `lastMonth`, oldest first. */
function monthsFrom(firstMonth: string, lastMonth: string): string[] {
  const months: string[] = [];
  for (let month = firstMonth; month <= lastMonth; month = shiftVisualPnlMonthKey(month, 1)) months.push(month);
  return months;
}

function projectCalendarMonths(period: VisualPnlPeriod, days: VisualPnlDailySummaryProjection, todayKey: string): readonly string[] {
  const todayMonth = todayKey.slice(0, 7);
  const months = period.kind === 'all'
    ? (days.days.length === 0 ? [] : monthsFrom(days.days[0].dayKey.slice(0, 7) < todayMonth ? days.days[0].dayKey.slice(0, 7) : todayMonth, todayMonth))
    : period.monthKeys.filter((month) => month <= todayMonth);
  return Object.freeze(months.length === 0 ? [todayMonth] : months);
}

async function loadDisciplineRing(db: KairosDatabase, ids: readonly TradeId[]): Promise<ResultsDashboardProjection['discipline']> {
  if (ids.length === 0) return Object.freeze({ kind: 'ready' as const, score: projectDisciplineScore({ closedTradeIds: [], records: new Map() }) });
  const read = await loadTradeDiscipline(db, ids);
  if (!read.ok) return Object.freeze({ kind: 'error' as const });
  return Object.freeze({ kind: 'ready' as const, score: projectDisciplineScore({ closedTradeIds: ids, records: read.records }) });
}

/** The dashboard for `choice` at the moment `now`. A refusal is a result, never a throw; a storage failure rejects. */
export async function loadResultsDashboard(db: KairosDatabase, options: Readonly<{ choice: VisualPnlPeriodChoice; now: string; scope?: JournalHistoryScope }>): Promise<ResultsDashboardQueryResult> {
  const scope = options.scope ?? 'real';
  // The dashboard draws days, so it needs a zone even for all time.
  const timeZone = await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-now' as const });
  const todayKey = today.dayKey;
  const projected = projectVisualPnlPeriod(options.choice, todayKey);
  if (!projected.ok) return Object.freeze({ kind: 'invalid-period' as const, reason: projected.reason, timeZone, todayKey });
  const { period } = projected;

  const read = await loadPerformancePeriod(db, { timeZone, fromDayKey: period.fromDayKey, toDayKey: period.toDayKey, scope });
  if (read.kind === 'unavailable') return Object.freeze({ kind: 'unavailable' as const, reason: read.reason });
  const { inHome } = read;
  const entries = inHome.entries;
  const conversions = inHome.homeCurrency === null ? null : inHome.byTrade;
  const total = summarizeVisualPnlAggregation(entries.map((entry) => entry.visualPnl));
  const days = summarizeVisualPnlByDay(entries, timeZone);
  const tradeDays: Record<string, string | null> = {};
  for (const entry of entries) {
    const day = projectVisualPnlDayKey(entry.trade.closedAt, timeZone);
    tradeDays[entry.trade.id] = day.available ? day.dayKey : null;
  }

  let currentStreak: VisualPnlDailyStreakProjection | null = null;
  if (period.holdsToday) {
    if (period.kind === 'all') {
      currentStreak = projectVisualPnlDailyStreak(days.days);
    } else {
      // A streak is current, so it runs over every result day of all time; the period's first day never cuts it.
      const allTime = await loadPerformancePeriod(db, { timeZone, fromDayKey: null, toDayKey: null, scope });
      currentStreak = allTime.kind === 'ready' ? projectVisualPnlDailyStreak(summarizeVisualPnlByDay(allTime.inHome.entries, timeZone).days) : null;
    }
  }

  const dashboard: ResultsDashboardProjection = Object.freeze({
    scope,
    timeZone,
    todayKey,
    period,
    entries,
    recordedEntries: Object.freeze(read.recorded),
    tradeDays: Object.freeze(tradeDays),
    conversions,
    inHomeCurrency: summarizeResultsInHomeCurrency(inHome),
    total,
    totalBlockers: total.available ? NO_BLOCKERS : projectTotalBlockers(entries, conversions),
    summary: summarizePerformance(entries),
    days,
    calendarMonths: projectCalendarMonths(period, days, todayKey),
    currentStreak,
    discipline: await loadDisciplineRing(db, entries.map((entry) => entry.trade.id)),
  });
  return Object.freeze({ kind: 'ready' as const, dashboard });
}

/** The dashboard's trades for a tap, as recorded: those that closed from `fromDayKey` (included) to `toDayKey` (not included), or those ids, in close order. Never a new read. */
export function selectResultsEntries(dashboard: ResultsDashboardProjection, pick: Readonly<{ fromDayKey: string; toDayKey: string }> | Readonly<{ tradeIds: readonly string[] }>): readonly JournalHistoryEntry[] {
  if ('tradeIds' in pick) {
    const wanted = new Set(pick.tradeIds);
    return Object.freeze(dashboard.recordedEntries.filter((entry) => wanted.has(entry.trade.id)));
  }
  return Object.freeze(dashboard.recordedEntries.filter((entry) => {
    const day = dashboard.tradeDays[entry.trade.id];
    return day !== null && day !== undefined && day >= pick.fromDayKey && day < pick.toDayKey;
  }));
}
