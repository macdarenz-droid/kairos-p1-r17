/**
 * U13 (D247): the one owner of what was lost in a day or a week, in one currency. A day's loss is its net result after
 * fees (the same total as its square on "Your results"), when that is below zero. Results are converted only into the
 * home currency, by its one owner; a missing result, a missing rate or another currency makes the day "can't tell",
 * never 0. Open trades count when they close.
 */
import { decimalAbs, decimalCompare, decimalSum } from '../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../domain/trades';
import type { ResultsInHomeCurrency } from '../currency/resultsInHomeCurrency';
import type { JournalHistoryEntry } from '../journal';
import { summarizeVisualPnlByDay } from '../visual-pnl';

/** A loss counted over a day or a span of days; `lost` is '0' when the net is zero or above. */
export type LossCount =
  | Readonly<{ kind: 'counted'; total: DecimalString; lost: DecimalString; closedTrades: number }>
  | Readonly<{ kind: 'unknown'; closedTrades: number; uncounted: number }>;

export type CountedDay = LossCount & Readonly<{ dayKey: string }>;

export type LossJudgment = 'within' | 'at-limit' | 'over';

const ZERO = '0' as DecimalString;

function lostOf(total: DecimalString): DecimalString | null {
  if (decimalCompare(total, ZERO) !== -1) return ZERO;
  const abs = decimalAbs(total);
  return abs.ok ? abs.value : null;
}

export interface CountedDaysInput {
  readonly entries: readonly JournalHistoryEntry[];
  /** The same entries in the home currency, when they were read; used only when the limit is in the home currency. */
  readonly inHome: ResultsInHomeCurrency | null;
  readonly currency: string;
  readonly timeZone: string;
}

/** Each day with a closed trade, by its day in the time zone: counted in `currency`, or unknown with the trades that could not be. */
export function projectCountedDays({ entries, inHome, currency, timeZone }: CountedDaysInput): ReadonlyMap<string, CountedDay> {
  const source = inHome !== null && inHome.homeCurrency === currency ? inHome.entries : entries;
  const closed = source.filter(entry => entry.trade.status === 'closed');
  const counted = new Map<string, CountedDay>();
  for (const day of summarizeVisualPnlByDay(closed, timeZone).days) {
    const closedTrades = day.summary.tradeCount;
    const total = day.summary.available && day.summary.currency === currency ? day.summary.total as DecimalString : null;
    const lost = total === null ? null : lostOf(total);
    if (total !== null && lost !== null) {
      counted.set(day.dayKey, Object.freeze({ kind: 'counted' as const, dayKey: day.dayKey, total, lost, closedTrades }));
      continue;
    }
    const uncounted = day.tradeResults.filter(result => result.amount === null || result.currency !== currency).length;
    counted.set(day.dayKey, Object.freeze({ kind: 'unknown' as const, dayKey: day.dayKey, closedTrades, uncounted: uncounted === 0 ? closedTrades : uncounted }));
  }
  return counted;
}

/** The net over the days from `fromDayKey` to `lastDayKey` (a week to date): unknown when any of its days is. */
export function projectLossOver(days: ReadonlyMap<string, CountedDay>, fromDayKey: string, lastDayKey: string): LossCount {
  const inSpan = [...days.values()].filter(day => day.dayKey >= fromDayKey && day.dayKey <= lastDayKey);
  const closedTrades = inSpan.reduce((count, day) => count + day.closedTrades, 0);
  const unknown = inSpan.filter((day): day is Extract<CountedDay, { kind: 'unknown' }> => day.kind === 'unknown');
  if (unknown.length > 0) return Object.freeze({ kind: 'unknown' as const, closedTrades, uncounted: unknown.reduce((count, day) => count + day.uncounted, 0) });
  const sum = decimalSum(inSpan.map(day => (day.kind === 'counted' ? day.total : ZERO)));
  const lost = sum.ok ? lostOf(sum.value) : null;
  if (!sum.ok || lost === null) return Object.freeze({ kind: 'unknown' as const, closedTrades, uncounted: closedTrades });
  return Object.freeze({ kind: 'counted' as const, total: sum.value, lost, closedTrades });
}

/** At the limit is still inside; null when the two can't be compared. */
export function judgeLoss(lost: DecimalString, limit: DecimalString): LossJudgment | null {
  const compared = decimalCompare(lost, limit);
  if (compared === null) return null;
  return compared === 1 ? 'over' : compared === 0 ? 'at-limit' : 'within';
}
