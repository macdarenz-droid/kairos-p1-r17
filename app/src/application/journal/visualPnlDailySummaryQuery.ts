import type { KairosDatabase } from '../../data/database';
import {
  summarizeVisualPnlByDay,
  type VisualPnlDailySummaryProjection,
} from '../visual-pnl';
import { listJournalClosedTradesInPeriod } from './closedTradePeriodQuery';

/**
 * Journal-facing consumer contract for daily Visual P&L over every closed
 * real trade.
 *
 * Database selection is owned by the all-time closed-trade period query;
 * all calendar-day and monetary composition stays with P13.6/P13.7.
 *
 * The caller must supply the time-zone policy explicitly.
 */
export async function listJournalVisualPnlDailySummary(
  db: KairosDatabase,
  timeZone: string,
): Promise<VisualPnlDailySummaryProjection> {
  const period = await listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: null, toDayKey: null });
  // The all-time period never refuses: it has no day keys to check.
  return summarizeVisualPnlByDay(period.ok ? period.entries : [], timeZone);
}
