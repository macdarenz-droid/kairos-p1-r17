import type { KairosDatabase } from '../../data/database';
import {
  summarizeVisualPnlByDay,
  type VisualPnlDailySummaryProjection,
} from '../visual-pnl';
import { loadResultsInHomeCurrency, summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { listJournalClosedTradesInPeriod } from './closedTradePeriodQuery';
import type { JournalHistoryScope } from './historyQuery';

/** P33: the daily results, with the home currency they are in (null: none chosen), how many results were converted and the rates still missing. */
export interface JournalVisualPnlDailySummary extends VisualPnlDailySummaryProjection {
  readonly inHomeCurrency: ResultsInHomeCurrencySummary;
}

/**
 * Journal-facing consumer contract for daily Visual P&L over every closed
 * trade of one scope (real unless the caller asks for practice).
 *
 * Database selection is owned by the all-time closed-trade period query;
 * all calendar-day and monetary composition stays with P13.6/P13.7.
 *
 * The caller must supply the time-zone policy explicitly. When a home currency
 * is chosen, the totals are in it (P33): each result is converted by the
 * currency owner, and a result without a rate keeps its own currency.
 */
export async function listJournalVisualPnlDailySummary(
  db: KairosDatabase,
  timeZone: string,
  options: { readonly scope?: JournalHistoryScope } = {},
): Promise<JournalVisualPnlDailySummary> {
  const period = await listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: null, toDayKey: null, scope: options.scope });
  // The all-time period never refuses: it has no day keys to check.
  const inHome = await loadResultsInHomeCurrency(db, period.ok ? period.entries : []);
  return Object.freeze({ ...summarizeVisualPnlByDay(inHome.entries, timeZone), inHomeCurrency: summarizeResultsInHomeCurrency(inHome) });
}
