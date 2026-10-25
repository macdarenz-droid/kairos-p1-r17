/**
 * U16 (P21.A1, D267): the one read behind Home's "Today" card. It gathers what the owners already give: this month's
 * results dashboard (today's day, the month's result after fees and what blocks it, the current streak, the days for the
 * small calendar), the open trades in the Journal's order, the coach's first note, the next big news (D269) and whether
 * the journal holds any trade. It adds up no money, writes nothing and never guesses a time zone.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { DecimalString } from '../../domain/trades';
import type { CoachNote } from '../coach/coachNotes';
import { loadCoachNotes } from '../coach/loadCoachNotes';
import { loadNextBigNews, type NextBigNews } from '../economic-calendar/nextBigNews';
import type { ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { JOURNAL_HISTORY_SOURCES, listAllJournalMatches, type JournalHistoryEntry } from '../journal/historyQuery';
import { NO_JOURNAL_FILTERS } from '../journal/journalFilters';
import { loadResultsDashboard, type ResultsDashboardProjection } from '../performance/resultsDashboard';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';
import type { VisualPnlAggregationSummary } from '../visual-pnl/aggregationSummary';
import type { VisualPnlDailyStreakProjection } from '../visual-pnl/dailyStreak';
import { projectVisualPnlMonthGrid, type VisualPnlMonthGridProjection } from '../visual-pnl/monthGrid';
import { VISUAL_PNL_DEFAULT_PERIOD } from '../visual-pnl/resultsPeriod';

/** How many open trades the card lists; the rest are counted. */
export const HOME_TODAY_OPEN_TRADES_SHOWN = 3;

export interface HomeTodayOpenTrade {
  readonly entry: JournalHistoryEntry;
  /** Where the trade got in: its average entry from the trade's numbers (one entry: that entry's price); null when no entry is saved. */
  readonly inAt: DecimalString | null;
  /** The latest plan's stop and target, as saved; null when not set. */
  readonly stop: DecimalString | null;
  readonly target: DecimalString | null;
}

export interface HomeTodayProjection {
  readonly timeZone: string;
  readonly todayKey: string;
  /** Today's closed trades as one result (the month dashboard's day for `todayKey`); null when none closed today. */
  readonly today: VisualPnlAggregationSummary | null;
  /** This month (the results dashboard's default period): its result after fees, the trades that block it, and the home-currency facts. */
  readonly month: Readonly<{
    label: string;
    total: VisualPnlAggregationSummary;
    totalBlockers: ResultsDashboardProjection['totalBlockers'];
    inHomeCurrency: ResultsInHomeCurrencySummary;
  }>;
  /** The current streak over every result day of all time. */
  readonly streak: VisualPnlDailyStreakProjection | null;
  /** This month's days, coloured by their result. */
  readonly calendar: VisualPnlMonthGridProjection;
  /** The newest open trades (by when they happened, the Journal's order) and how many are open. */
  readonly openTrades: Readonly<{ shown: readonly HomeTodayOpenTrade[]; count: number }>;
  /** The coach's first note this month; null when it has none; 'unavailable' when it could not be read (the rest still shows). */
  readonly coach: CoachNote | null | 'unavailable';
  /** The next big news (D269); 'unavailable' when it could not be read (the rest still shows). */
  readonly news: NextBigNews | 'unavailable';
  /** Whether the journal holds any real trade at all (planned, open, closed or cancelled). */
  readonly hasTrades: boolean;
}

export type HomeTodayResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' | 'invalid-day-key' | 'invalid-time-zone' | 'empty-period' | 'invalid-period' }>
  | Readonly<{ kind: 'ready'; projection: HomeTodayProjection }>;

function projectOpenTrade(entry: JournalHistoryEntry): HomeTodayOpenTrade {
  const plan = latestTradePlan(entry.plans);
  return Object.freeze({
    entry,
    inAt: entry.metrics?.averageEntryPrice ?? null,
    stop: plan?.plannedStopPrice ?? null,
    target: plan?.plannedTargetPrice ?? null,
  });
}

async function loadCoachFirstNote(db: KairosDatabase, now: string): Promise<HomeTodayProjection['coach']> {
  try {
    const coach = await loadCoachNotes(db, { now });
    return coach.kind === 'ready' ? coach.notes[0] ?? null : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function loadNews(db: KairosDatabase, now: string): Promise<HomeTodayProjection['news']> {
  try {
    const news = await loadNextBigNews(db, { now });
    return news.kind === 'ready' ? news.news : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** "Today" at the moment `now`, in the saved time zone. A refusal is a result, never a throw; a storage failure rejects. */
export async function loadHomeToday(db: KairosDatabase, options: Readonly<{ now: string }>): Promise<HomeTodayResult> {
  const read = await loadResultsDashboard(db, { choice: VISUAL_PNL_DEFAULT_PERIOD, now: options.now });
  if (read.kind === 'time-zone-unconfigured') return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  if (read.kind === 'invalid-period') return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-period' as const });
  if (read.kind === 'unavailable') return Object.freeze({ kind: 'unavailable' as const, reason: read.reason });
  const { dashboard } = read;
  const { todayKey, period } = dashboard;
  const calendar = projectVisualPnlMonthGrid({ monthKey: todayKey.slice(0, 7), days: dashboard.days.days, todayKey, period: { fromDayKey: period.fromDayKey, toDayKey: period.toDayKey } });
  if (calendar === null) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-day-key' as const });

  const [open, anyTrade, coach, news] = await Promise.all([
    listAllJournalMatches(db, { scope: 'real', filters: Object.freeze({ ...NO_JOURNAL_FILTERS, status: 'open' as const }) }),
    createKairosRepositories(db).trades.scopedBySource(JOURNAL_HISTORY_SOURCES.real).listPageByJournalAt(null, null, 1),
    loadCoachFirstNote(db, options.now),
    loadNews(db, options.now),
  ]);

  const projection: HomeTodayProjection = Object.freeze({
    timeZone: dashboard.timeZone,
    todayKey,
    today: dashboard.days.days.find(day => day.dayKey === todayKey)?.summary ?? null,
    month: Object.freeze({ label: period.label, total: dashboard.total, totalBlockers: dashboard.totalBlockers, inHomeCurrency: dashboard.inHomeCurrency }),
    streak: dashboard.currentStreak,
    calendar,
    openTrades: Object.freeze({ shown: Object.freeze(open.slice(0, HOME_TODAY_OPEN_TRADES_SHOWN).map(projectOpenTrade)), count: open.length }),
    coach,
    news,
    hasTrades: anyTrade.length > 0,
  });
  return Object.freeze({ kind: 'ready' as const, projection });
}
