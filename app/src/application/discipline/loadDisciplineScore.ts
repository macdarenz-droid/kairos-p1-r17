import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { TradeDisciplineRecord } from '../../domain/discipline';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import type { JournalHistoryScope } from '../journal/historyQuery';
import { isVisualPnlMonthKey, projectVisualPnlDayKey, readVisualPnlTimeZonePreference, shiftVisualPnlMonthKey } from '../visual-pnl';
import { projectDisciplineScore, type DisciplineScoreProjection } from './disciplineScore';
import { loadTradeDiscipline } from './tradeDiscipline';

export type DisciplineScoreQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' | 'invalid-month' }>
  | Readonly<{ kind: 'ready'; timeZone: string; monthKey: string; score: DisciplineScoreProjection }>;

/**
 * P22.4 read for the discipline score of one month in the saved time zone:
 * every closed trade of the scope (real by default) in that month (the period query) and their saved
 * records (the one discipline reader), then the score owner. The device time
 * zone is never guessed; nothing is written.
 */
export async function loadDisciplineScore(db: KairosDatabase, options: { readonly now: string; readonly monthKey?: string; readonly scope?: JournalHistoryScope }): Promise<DisciplineScoreQueryResult> {
  const timeZone = await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-now' as const });
  const monthKey = options.monthKey ?? today.dayKey.slice(0, 7);
  if (!isVisualPnlMonthKey(monthKey)) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-month' as const });

  const closed = await listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: `${monthKey}-01`, toDayKey: `${shiftVisualPnlMonthKey(monthKey, 1)}-01`, scope: options.scope });
  if (!closed.ok) throw new Error(`The discipline score could not read this month's trades: ${closed.reason}.`);
  const ids = closed.entries.map((entry) => entry.trade.id);
  let records: ReadonlyMap<string, TradeDisciplineRecord> = new Map();
  if (ids.length > 0) {
    const loaded = await loadTradeDiscipline(db, ids);
    if (!loaded.ok) throw new Error(`The discipline score could not read your checklists and reviews: ${loaded.reason}.`);
    records = loaded.records;
  }
  return Object.freeze({ kind: 'ready' as const, timeZone, monthKey, score: projectDisciplineScore({ closedTradeIds: ids, records }) });
}
