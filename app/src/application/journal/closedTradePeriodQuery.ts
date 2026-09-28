import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { isVisualPnlDayKey, projectVisualPnlDayKey, shiftVisualPnlDayKey } from '../visual-pnl';
import {
  DEFAULT_JOURNAL_HISTORY_SCOPE,
  JOURNAL_HISTORY_SOURCES,
  hydrateJournalHistoryEntries,
  type JournalHistoryEntry,
  type JournalHistoryScope,
} from './historyQuery';

export interface JournalClosedTradePeriodOptions {
  readonly timeZone: string;
  /** First calendar day in timeZone (YYYY-MM-DD), included; null = no start. */
  readonly fromDayKey: string | null;
  /** Calendar day in timeZone where the period stops (YYYY-MM-DD), not included; null = no end. */
  readonly toDayKey: string | null;
  readonly scope?: JournalHistoryScope;
}

export type JournalClosedTradePeriodResult =
  | Readonly<{ ok: true; entries: readonly JournalHistoryEntry[] }>
  | Readonly<{ ok: false; reason: 'invalid-day-key' | 'invalid-time-zone' | 'empty-period' }>;

const utcMidnight = (dayKey: string): string => `${dayKey}T00:00:00.000Z`;

/**
 * The one indexed period query for totals: every closed trade in scope whose
 * close falls on a calendar day of the period in `timeZone`, oldest close
 * first, with no limit. The visual-pnl day-key owner decides which day a
 * close belongs to, so a period holds exactly the trades the daily results
 * put on those days.
 */
export async function listJournalClosedTradesInPeriod(
  db: KairosDatabase,
  options: JournalClosedTradePeriodOptions,
): Promise<JournalClosedTradePeriodResult> {
  const { timeZone, fromDayKey: from, toDayKey: to } = options;
  if ((from !== null && !isVisualPnlDayKey(from)) || (to !== null && !isVisualPnlDayKey(to))) return Object.freeze({ ok: false as const, reason: 'invalid-day-key' as const });
  if (from !== null && to !== null && from >= to) return Object.freeze({ ok: false as const, reason: 'empty-period' as const });
  const bounded = from !== null || to !== null;
  if (bounded && !projectVisualPnlDayKey('2000-01-01T00:00:00.000Z', timeZone).available) return Object.freeze({ ok: false as const, reason: 'invalid-time-zone' as const });

  // Every time zone is between 12 h behind and 14 h ahead of UTC, so one day of padding holds the whole period.
  const lower = from === null ? null : utcMidnight(shiftVisualPnlDayKey(from, -1));
  const upper = to === null ? null : utcMidnight(shiftVisualPnlDayKey(to, 1));

  const repositories = createKairosRepositories(db);
  const entries = await db.transaction('r', ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees'], async () => {
    const trades = await repositories.trades
      .scopedBySource(JOURNAL_HISTORY_SOURCES[options.scope ?? DEFAULT_JOURNAL_HISTORY_SCOPE])
      .listClosedByClosedAtRange(lower, upper);
    const kept = bounded ? trades.filter((trade) => {
      const day = projectVisualPnlDayKey(trade.closedAt, timeZone);
      return day.available && (from === null || day.dayKey >= from) && (to === null || day.dayKey < to);
    }) : trades;
    return hydrateJournalHistoryEntries(repositories, kept);
  });
  return Object.freeze({ ok: true as const, entries });
}
