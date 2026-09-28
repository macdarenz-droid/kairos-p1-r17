/**
 * U4 (P11.A1): the read for the period numbers of one scope. It reads the saved time zone, every closed trade of the period (the one indexed period query), puts their results in the home currency when one is set, and gives them to the period-numbers owner. It writes nothing, never guesses a time zone, and never throws on a refused period.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { loadResultsInHomeCurrency, summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import type { JournalHistoryScope } from '../journal/historyQuery';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';
import { summarizePerformance, type PerformanceSummary } from './performanceSummary';

export type PerformanceSummaryQueryResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-day-key' | 'invalid-time-zone' | 'empty-period' }>
  | Readonly<{ kind: 'ready'; timeZone: string | null; fromDayKey: string | null; toDayKey: string | null; summary: PerformanceSummary; inHomeCurrency: ResultsInHomeCurrencySummary }>;

/** `fromDayKey` is included and `toDayKey` is not (the period query's rule); both null = all time, which needs no time zone. */
export async function loadPerformanceSummary(db: KairosDatabase, options: Readonly<{ fromDayKey: string | null; toDayKey: string | null; scope?: JournalHistoryScope }>): Promise<PerformanceSummaryQueryResult> {
  const { fromDayKey, toDayKey } = options;
  const timeZone = await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata);
  if (timeZone === null && (fromDayKey !== null || toDayKey !== null)) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  // An all-time read never checks the zone, so 'UTC' only fills the field.
  const closed = await listJournalClosedTradesInPeriod(db, { timeZone: timeZone ?? 'UTC', fromDayKey, toDayKey, scope: options.scope ?? 'real' });
  if (!closed.ok) return Object.freeze({ kind: 'unavailable' as const, reason: closed.reason });
  const inHome = await loadResultsInHomeCurrency(db, closed.entries);
  return Object.freeze({ kind: 'ready' as const, timeZone, fromDayKey, toDayKey, summary: summarizePerformance(inHome.entries), inHomeCurrency: summarizeResultsInHomeCurrency(inHome) });
}
