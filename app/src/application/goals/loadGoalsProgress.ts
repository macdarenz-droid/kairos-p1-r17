import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { MAX_JOURNAL_HISTORY_LIMIT, listJournalHistory } from '../journal/historyQuery';
import { readVisualPnlTimeZonePreference } from '../visual-pnl';
import { readGoalsPreference, type GoalsPreference } from './goalsPreference';
import { projectGoalsProgress, type GoalsProgressProjection } from './goalsProgress';

export type GoalsProgressQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured'; preference: GoalsPreference }>
  | Readonly<{ kind: 'ready'; preference: GoalsPreference; timeZone: string; progress: GoalsProgressProjection }>;

/**
 * P26.2 read-only composition: explicit P13.10R1 time-zone preference, the
 * P26.1 goals preference, the bounded P12 history (its maximum bound, so the
 * month view sees as much as the released history owner allows) and the
 * projection. Database selection stays with the released owners.
 */
export async function loadGoalsProgress(db: KairosDatabase, now: string): Promise<GoalsProgressQueryResult> {
  const repositories = createKairosRepositories(db);
  const [preference, timeZone] = await Promise.all([readGoalsPreference(repositories.metadata), readVisualPnlTimeZonePreference(repositories.metadata)]);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const, preference });
  const entries = await listJournalHistory(db, { limit: MAX_JOURNAL_HISTORY_LIMIT });
  return Object.freeze({ kind: 'ready' as const, preference, timeZone, progress: projectGoalsProgress({ preference, entries, timeZone, now }) });
}
