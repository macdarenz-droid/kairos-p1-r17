import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import { listJournalOpenTrades } from '../journal/historyQuery';
import { projectVisualPnlDayKey, readVisualPnlTimeZonePreference } from '../visual-pnl';
import { readGoalsPreference, type GoalsPreference } from './goalsPreference';
import { projectGoalsProgress, type GoalsProgressProjection } from './goalsProgress';

export type GoalsProgressQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured'; preference: GoalsPreference }>
  | Readonly<{ kind: 'ready'; preference: GoalsPreference; timeZone: string; progress: GoalsProgressProjection }>;

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
    return Object.freeze({ kind: 'ready' as const, preference, timeZone, progress: projectGoalsProgress({ preference, entries: [], timeZone, now }) });
  }
  const [closed, open] = await Promise.all([
    listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: `${today.dayKey.slice(0, 7)}-01`, toDayKey: null }),
    listJournalOpenTrades(db),
  ]);
  if (!closed.ok) throw new Error(`Goals could not read this month's trades: ${closed.reason}.`);
  const entries = [...closed.entries, ...open];
  return Object.freeze({ kind: 'ready' as const, preference, timeZone, progress: projectGoalsProgress({ preference, entries, timeZone, now }) });
}
