import type { KairosDatabase } from '../../data/database';
import {
  summarizeVisualPnlByDay,
  type VisualPnlDailySummaryProjection,
} from '../visual-pnl';
import { listJournalHistory } from './historyQuery';

export interface JournalVisualPnlDailySummaryQueryOptions {
  readonly limit?: number;
}

/**
 * Journal-facing bounded consumer contract for daily Visual P&L.
 *
 * Database selection remains owned by Journal History. This query narrows that
 * existing indexed path to closed trades, preserves the existing history bound,
 * and delegates all calendar-day and monetary composition to P13.6/P13.7.
 *
 * The caller must supply the time-zone policy explicitly.
 */
export async function listJournalVisualPnlDailySummary(
  db: KairosDatabase,
  timeZone: string,
  options: JournalVisualPnlDailySummaryQueryOptions = {},
): Promise<VisualPnlDailySummaryProjection> {
  const historyOptions = options.limit === undefined
    ? { status: 'closed' as const }
    : { status: 'closed' as const, limit: options.limit };

  const entries = await listJournalHistory(db, historyOptions);
  return summarizeVisualPnlByDay(entries, timeZone);
}
