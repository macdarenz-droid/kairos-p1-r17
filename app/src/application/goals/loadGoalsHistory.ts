import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { loadResultsInHomeCurrency, summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import { listJournalOpenTrades } from '../journal/historyQuery';
import { projectVisualPnlDayKey, readVisualPnlTimeZonePreference } from '../visual-pnl';
import { readGoalsSettings, type GoalsSettings } from './goalsPreference';
import { mondayOf, projectLimitsCalendar, type LimitsCalendarMonth } from './limitsCalendar';

/** How many months the history covers, this month included (D250, D251). */
export const GOALS_HISTORY_MONTHS = 12;

export type GoalsHistoryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{
      kind: 'ready'; timeZone: string; todayKey: string; settings: GoalsSettings | null;
      calendar: readonly LimitsCalendarMonth[]; inHomeCurrency: ResultsInHomeCurrencySummary | null;
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
  return Object.freeze({ kind: 'ready' as const, timeZone, todayKey: today.dayKey, settings, calendar, inHomeCurrency: usesHome ? summarizeResultsInHomeCurrency(inHome) : null });
}
