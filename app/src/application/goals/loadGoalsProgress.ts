import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { loadResultsInHomeCurrency, summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import { readDisciplineLists } from '../discipline/disciplineListsPreference';
import { projectDisciplineScore } from '../discipline/disciplineScore';
import { loadTradeDiscipline } from '../discipline/tradeDiscipline';
import { listJournalOpenTrades } from '../journal/historyQuery';
import { projectVisualPnlDayKey, projectVisualPnlPeriod, readVisualPnlTimeZonePreference } from '../visual-pnl';
import { readGoalsPreference, type GoalsPreference } from './goalsPreference';
import { projectGoalsProgress, type GoalsProgressProjection } from './goalsProgress';

export type GoalsProgressQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured'; preference: GoalsPreference }>
  | Readonly<{ kind: 'ready'; preference: GoalsPreference; timeZone: string; progress: GoalsProgressProjection; inHomeCurrency: ResultsInHomeCurrencySummary | null }>;

/**
 * P26.2 read-only composition: explicit P13.10R1 time-zone preference, the
 * P26.1 goals preference, every closed trade since the month began (the
 * period query) plus every open trade, and the projection. The period has no
 * end day on purpose: a trade opened today closes today or later, so one read
 * covers both "closed this month" and "opened today". Database selection
 * stays with the journal owners.
 */
export async function loadGoalsProgress(db: KairosDatabase, now: string): Promise<GoalsProgressQueryResult> {
  const repositories = createKairosRepositories(db);
  const [preference, timeZone] = await Promise.all([readGoalsPreference(repositories.metadata), readVisualPnlTimeZonePreference(repositories.metadata)]);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const, preference });
  const today = projectVisualPnlDayKey(now, timeZone);
  if (!today.available) {
    // The projection reports invalid-now or invalid-time-zone itself.
    return Object.freeze({ kind: 'ready' as const, preference, timeZone, progress: projectGoalsProgress({ preference, entries: [], timeZone, now }), inHomeCurrency: null });
  }
  // U13: from the earlier of the month's first day and this week's Monday, so a week that began last month is whole.
  const monthKey = today.dayKey.slice(0, 7), monthStart = `${monthKey}-01`;
  const week = projectVisualPnlPeriod({ kind: 'week', at: null }, today.dayKey);
  const weekStart = week.ok && week.period.fromDayKey !== null ? week.period.fromDayKey : monthStart;
  const [closed, open] = await Promise.all([
    listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: weekStart < monthStart ? weekStart : monthStart, toDayKey: null }),
    listJournalOpenTrades(db),
  ]);
  if (!closed.ok) throw new Error(`Goals could not read this month's trades: ${closed.reason}.`);
  // P33, D247: a result target or loss limits set in the home currency count results converted into it (D116).
  const target = preference.monthlyResultTarget, limits = preference.lossLimits;
  const inHome = target === null && limits === null ? null : await loadResultsInHomeCurrency(db, closed.entries);
  const usesHome = inHome !== null && (target?.currency === inHome.homeCurrency || limits?.currency === inHome.homeCurrency);
  // D248: the habits read this month's discipline records and the checklist, only when one is on.
  let discipline: Parameters<typeof projectGoalsProgress>[0]['discipline'] = null;
  if (preference.reviewEveryTrade || preference.tickEveryStep) {
    const monthIds = closed.entries
      .filter(entry => { const day = projectVisualPnlDayKey(entry.trade.closedAt, timeZone); return day.available && day.dayKey.startsWith(`${monthKey}-`); })
      .map(entry => entry.trade.id);
    const [records, lists] = await Promise.all([loadTradeDiscipline(db, monthIds), readDisciplineLists(repositories.metadata)]);
    if (!records.ok) throw new Error('Goals could not read your reviews and checklists.');
    discipline = Object.freeze({ score: projectDisciplineScore({ closedTradeIds: monthIds, records: records.records }), checklistSteps: lists.checklist.length });
  }
  const progress = projectGoalsProgress({ preference, entries: [...closed.entries, ...open], inHome, timeZone, now, discipline });
  return Object.freeze({ kind: 'ready' as const, preference, timeZone, progress, inHomeCurrency: usesHome ? summarizeResultsInHomeCurrency(inHome) : null });
}
