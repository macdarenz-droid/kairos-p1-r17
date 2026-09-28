/**
 * P29: the read for the offline coach of one scope. It reads the saved time zone, every closed trade of the scope this month (the period query, as the discipline score does), their discipline records (the one reader), the score owner, and for real trades the goals owner. It writes nothing and never guesses a time zone.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { TradeDisciplineRecord } from '../../domain/discipline';
import { projectDisciplineScore } from '../discipline/disciplineScore';
import { loadTradeDiscipline } from '../discipline/tradeDiscipline';
import { loadGoalsProgress } from '../goals/loadGoalsProgress';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import type { JournalHistoryScope } from '../journal/historyQuery';
import { projectVisualPnlDayKey, readVisualPnlTimeZonePreference, shiftVisualPnlMonthKey } from '../visual-pnl';
import { projectCoachNotes, type CoachNote } from './coachNotes';

export type CoachNotesQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' }>
  | Readonly<{ kind: 'ready'; timeZone: string; monthKey: string; notes: readonly CoachNote[] }>;

export async function loadCoachNotes(db: KairosDatabase, options: { readonly now: string; readonly scope?: JournalHistoryScope }): Promise<CoachNotesQueryResult> {
  const timeZone = await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-now' as const });
  const monthKey = today.dayKey.slice(0, 7);
  const scope = options.scope ?? 'real';

  const closed = await listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: `${monthKey}-01`, toDayKey: `${shiftVisualPnlMonthKey(monthKey, 1)}-01`, scope });
  if (!closed.ok) throw new Error(`Your coach could not read this month's trades: ${closed.reason}.`);
  const ids = closed.entries.map(entry => entry.trade.id);
  let records: ReadonlyMap<string, TradeDisciplineRecord> = new Map();
  if (ids.length > 0) {
    const loaded = await loadTradeDiscipline(db, ids);
    if (!loaded.ok) throw new Error(`Your coach could not read your checklists and reviews: ${loaded.reason}.`);
    records = loaded.records;
  }
  const score = projectDisciplineScore({ closedTradeIds: ids, records });
  let goals = null;
  if (scope === 'real') {
    const loaded = await loadGoalsProgress(db, options.now);
    goals = loaded.kind === 'ready' ? loaded.progress : null;
  }
  return Object.freeze({ kind: 'ready' as const, timeZone, monthKey, notes: projectCoachNotes({ entries: closed.entries, records, score, goals }) });
}
