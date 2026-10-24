import type { KairosDatabase } from '../../data/database';
import type { TradeId } from '../../domain/trades';
import { createKairosRepositories } from '../../data/repositories';
import { loadResultsInHomeCurrency, summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { readDisciplineLists } from '../discipline/disciplineListsPreference';
import { projectDisciplineScore, projectDisciplineTrend, type DisciplineScoreMonth, type DisciplineTrend } from '../discipline/disciplineScore';
import { loadTradeDiscipline } from '../discipline/tradeDiscipline';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import { listJournalOpenTrades } from '../journal/historyQuery';
import { projectVisualPnlDayKey, readVisualPnlTimeZonePreference } from '../visual-pnl';
import { readGoalsSettings, type GoalsSettings } from './goalsPreference';
import { projectGoalsMonths, type GoalsMonth } from './goalsMonths';
import { mondayOf, projectLimitsCalendar, type LimitsCalendarMonth } from './limitsCalendar';

/** How many months the history covers, this month included (D250, D251). */
export const GOALS_HISTORY_MONTHS = 12;

export type GoalsHistoryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{
      kind: 'ready'; timeZone: string; todayKey: string; settings: GoalsSettings | null;
      calendar: readonly LimitsCalendarMonth[]; inHomeCurrency: ResultsInHomeCurrencySummary | null;
      /** D251: goals kept month by month, and the score and common mistakes over the last 6 or 12 months. */
      months: readonly GoalsMonth[]; trend: Readonly<{ 6: DisciplineTrend; 12: DisciplineTrend }>;
    }>;

function monthsBack(monthKey: string, months: number): string {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) - months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * U13 (D250): one read of the last 12 months of real trades, from the Monday on or before the first day so the first
 * week is whole, plus the open trades and the home-currency copy when a loss limit is in that currency. A failed read
 * throws; the screen offers "Try again".
 */
export async function loadGoalsHistory(db: KairosDatabase, options: Readonly<{ now: string }>): Promise<GoalsHistoryResult> {
  const { metadata } = createKairosRepositories(db);
  const [settings, timeZone] = await Promise.all([readGoalsSettings(metadata), readVisualPnlTimeZonePreference(metadata)]);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) throw new Error('Goals could not read today in your time zone.');
  const firstMonthKey = monthsBack(today.dayKey.slice(0, 7), GOALS_HISTORY_MONTHS - 1);
  const [closed, open] = await Promise.all([
    listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: mondayOf(`${firstMonthKey}-01`), toDayKey: null }),
    listJournalOpenTrades(db),
  ]);
  if (!closed.ok) throw new Error(`Goals could not read your trades: ${closed.reason}.`);
  const lossCurrencies = new Set((settings?.periods ?? []).flatMap(period => (period.goals.lossLimits === null ? [] : [period.goals.lossLimits.currency])));
  const inHome = lossCurrencies.size === 0 ? null : await loadResultsInHomeCurrency(db, closed.entries);
  const usesHome = inHome !== null && inHome.homeCurrency !== null && lossCurrencies.has(inHome.homeCurrency);
  const calendar = projectLimitsCalendar({ settings, entries: [...closed.entries, ...open], inHome, timeZone, todayKey: today.dayKey, firstMonthKey });
  // D251: one read of the discipline records for the window; each month's score from its own closed trades.
  const idsByMonth = new Map<string, TradeId[]>();
  for (const entry of closed.entries) {
    const day = projectVisualPnlDayKey(entry.trade.closedAt, timeZone);
    if (!day.available || day.dayKey < `${firstMonthKey}-01`) continue;
    const key = day.dayKey.slice(0, 7);
    const ids = idsByMonth.get(key);
    if (ids === undefined) idsByMonth.set(key, [entry.trade.id]); else ids.push(entry.trade.id);
  }
  const [records, lists] = await Promise.all([loadTradeDiscipline(db, [...idsByMonth.values()].flat()), readDisciplineLists(metadata)]);
  if (!records.ok) throw new Error('Goals could not read your reviews and checklists.');
  const scoreMonths: DisciplineScoreMonth[] = calendar.map(month => ({ monthKey: month.monthKey, score: projectDisciplineScore({ closedTradeIds: idsByMonth.get(month.monthKey) ?? [], records: records.records }) }));
  const months = projectGoalsMonths({
    settings, calendar, closedEntries: closed.entries, inHome, scores: new Map(scoreMonths.map(month => [month.monthKey, month.score])),
    checklistSteps: lists.checklist.length, timeZone, todayKey: today.dayKey,
  });
  const trend = Object.freeze({ 6: projectDisciplineTrend({ months: scoreMonths, window: 6 }), 12: projectDisciplineTrend({ months: scoreMonths, window: 12 }) });
  return Object.freeze({ kind: 'ready' as const, timeZone, todayKey: today.dayKey, settings, calendar, inHomeCurrency: usesHome ? summarizeResultsInHomeCurrency(inHome) : null, months, trend });
}
