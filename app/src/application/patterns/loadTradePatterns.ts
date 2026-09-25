/**
 * P30: the read for the patterns of one scope. It reads the saved time zone, then every closed trade of the scope whose close falls in the last TRADE_PATTERN_PERIOD_DAYS days (the one indexed period query, never the bounded history list), and gives them to the patterns owner. It writes nothing and never guesses a time zone.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import type { JournalHistoryScope } from '../journal/historyQuery';
import { projectVisualPnlDayKey, readVisualPnlTimeZonePreference, shiftVisualPnlDayKey } from '../visual-pnl';
import { projectTradePatterns, type TradePatternsProjection } from './tradePatterns';

/** Patterns look at the trades closed today and in the 89 days before it, in the saved time zone. */
export const TRADE_PATTERN_PERIOD_DAYS = 90;
export type TradePatternsQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' }>
  | Readonly<{ kind: 'ready'; timeZone: string; firstDayKey: string; lastDayKey: string; projection: TradePatternsProjection }>;

export async function loadTradePatterns(db: KairosDatabase, options: { readonly now: string; readonly scope?: JournalHistoryScope }): Promise<TradePatternsQueryResult> {
  const timeZone = await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-now' as const });
  const firstDayKey = shiftVisualPnlDayKey(today.dayKey, -(TRADE_PATTERN_PERIOD_DAYS - 1));
  const lastDayKey = today.dayKey;
  const closed = await listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: firstDayKey, toDayKey: shiftVisualPnlDayKey(today.dayKey, 1), scope: options.scope ?? 'real' });
  if (!closed.ok) throw new Error(`Your patterns could not read your trades: ${closed.reason}.`);
  return Object.freeze({ kind: 'ready' as const, timeZone, firstDayKey, lastDayKey, projection: projectTradePatterns({ entries: closed.entries, timeZone }) });
}
