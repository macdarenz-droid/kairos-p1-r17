/**
 * U13 (D250): the one owner of the limits calendar. Each day is judged against the limits in force that day (D246):
 * trades in a day, lost in a day, lost in the week to that day. A day with no trades is never green, a known break
 * makes it "over" even when another limit can't be checked, and "can't tell" is kept apart from "no trades".
 */
import type { DecimalString } from '../../domain/trades';
import type { ResultsInHomeCurrency } from '../currency/resultsInHomeCurrency';
import type { JournalHistoryEntry } from '../journal';
import { projectVisualPnlDayKey, shiftVisualPnlDayKey } from '../visual-pnl';
import { goalsInForceOn, type GoalsSettings } from './goalsPreference';
import { judgeLoss, projectCountedDays, projectLossOver, type CountedDay, type LossCount, type LossJudgment } from './lossLimits';

export type LimitsDayState = 'inside' | 'over' | 'unknown' | 'no-trades' | 'no-limits' | 'later';

/** A loss against its limit that day: counted and judged, or unknown with the trades that could not be counted. */
export type LimitsDayLoss =
  | Readonly<{ kind: 'counted'; lost: DecimalString; limit: DecimalString; currency: string; state: LossJudgment }>
  | Readonly<{ kind: 'unknown'; limit: DecimalString; currency: string; uncounted: number }>;

export interface LimitsCalendarDay {
  readonly dayKey: string;
  readonly state: LimitsDayState;
  /** Trades opened that day against "Most trades in a day", when that limit was set. */
  readonly trades: Readonly<{ opened: number; limit: number; state: LossJudgment }> | null;
  readonly dayLoss: LimitsDayLoss | null;
  /** The week from its Monday to this day. */
  readonly weekLoss: LimitsDayLoss | null;
}

export interface LimitsCalendarMonth {
  readonly monthKey: string;
  /** Empty cells before the 1st, Monday first. */
  readonly leadingEmptyCells: number;
  readonly days: readonly LimitsCalendarDay[];
  readonly inside: number;
  readonly over: number;
  readonly unknown: number;
}

export interface LimitsCalendarInput {
  readonly settings: GoalsSettings | null;
  /** Closed trades from the Monday on or before the first day, plus open trades, in their own currencies. */
  readonly entries: readonly JournalHistoryEntry[];
  readonly inHome: ResultsInHomeCurrency | null;
  readonly timeZone: string;
  readonly todayKey: string;
  readonly firstMonthKey: string;
}

/** Monday 0 … Sunday 6. */
const weekdayOf = (dayKey: string): number => (new Date(`${dayKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
export const mondayOf = (dayKey: string): string => shiftVisualPnlDayKey(dayKey, -weekdayOf(dayKey));

function monthKeysFrom(first: string, last: string): string[] {
  const keys: string[] = [];
  let [year, month] = first.split('-').map(Number) as [number, number];
  for (let guard = 0; guard < 240; guard += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > last) break;
    keys.push(key);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return keys;
}

function judged(count: LossCount, limit: DecimalString, currency: string): LimitsDayLoss {
  if (count.kind === 'unknown') return Object.freeze({ kind: 'unknown' as const, limit, currency, uncounted: count.uncounted });
  const state = judgeLoss(count.lost, limit);
  if (state === null) return Object.freeze({ kind: 'unknown' as const, limit, currency, uncounted: count.closedTrades });
  return Object.freeze({ kind: 'counted' as const, lost: count.lost, limit, currency, state });
}

export function projectLimitsCalendar(input: LimitsCalendarInput): readonly LimitsCalendarMonth[] {
  const { settings, entries, inHome, timeZone, todayKey, firstMonthKey } = input;
  const closed = entries.filter(entry => entry.trade.status === 'closed');

  // Trades opened (open or closed) and closed on each day.
  const opened = new Map<string, number>(), closedOn = new Set<string>();
  for (const entry of entries) {
    if (entry.trade.status !== 'open' && entry.trade.status !== 'closed') continue;
    const open = projectVisualPnlDayKey(entry.trade.openedAt, timeZone);
    if (open.available) opened.set(open.dayKey, (opened.get(open.dayKey) ?? 0) + 1);
    if (entry.trade.status === 'closed') {
      const shut = projectVisualPnlDayKey(entry.trade.closedAt, timeZone);
      if (shut.available) closedOn.add(shut.dayKey);
    }
  }
  // Losses counted per currency in force (a limit's currency may change from one period to the next).
  const countedByCurrency = new Map<string, ReadonlyMap<string, CountedDay>>();
  const countedIn = (currency: string) => {
    let days = countedByCurrency.get(currency);
    if (days === undefined) { days = projectCountedDays({ entries: closed, inHome, currency, timeZone }); countedByCurrency.set(currency, days); }
    return days;
  };

  return Object.freeze(monthKeysFrom(firstMonthKey, todayKey.slice(0, 7)).map(monthKey => {
    const [year, month] = monthKey.split('-').map(Number) as [number, number];
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days: LimitsCalendarDay[] = [];
    for (let date = 1; date <= length; date += 1) {
      const dayKey = `${monthKey}-${String(date).padStart(2, '0')}`;
      const goals = goalsInForceOn(settings, dayKey);
      const limits = goals?.lossLimits ?? null;
      const maxTrades = goals?.maxTradesPerDay ?? null;
      const empty = (state: LimitsDayState) => Object.freeze({ dayKey, state, trades: null, dayLoss: null, weekLoss: null });
      if (dayKey > todayKey) { days.push(empty('later')); continue; }
      if (maxTrades === null && (limits === null || (limits.perDay === null && limits.perWeek === null))) { days.push(empty('no-limits')); continue; }
      const openedThatDay = opened.get(dayKey) ?? 0;
      if (openedThatDay === 0 && !closedOn.has(dayKey)) { days.push(empty('no-trades')); continue; }

      const trades = maxTrades === null ? null : Object.freeze({
        opened: openedThatDay, limit: maxTrades,
        state: (openedThatDay > maxTrades ? 'over' : openedThatDay === maxTrades ? 'at-limit' : 'within') as LossJudgment,
      });
      const counted = limits === null ? null : countedIn(limits.currency);
      const dayLoss = limits === null || limits.perDay === null || counted === null ? null : judged(projectLossOver(counted, dayKey, dayKey), limits.perDay, limits.currency);
      const weekLoss = limits === null || limits.perWeek === null || counted === null ? null : judged(projectLossOver(counted, mondayOf(dayKey), dayKey), limits.perWeek, limits.currency);
      const parts = [trades?.state, dayLoss?.kind === 'counted' ? dayLoss.state : dayLoss?.kind, weekLoss?.kind === 'counted' ? weekLoss.state : weekLoss?.kind];
      const state: LimitsDayState = parts.includes('over') ? 'over' : parts.includes('unknown') ? 'unknown' : 'inside';
      days.push(Object.freeze({ dayKey, state, trades, dayLoss, weekLoss }));
    }
    const count = (state: LimitsDayState) => days.filter(day => day.state === state).length;
    return Object.freeze({
      monthKey, leadingEmptyCells: weekdayOf(`${monthKey}-01`), days: Object.freeze(days),
      inside: count('inside'), over: count('over'), unknown: count('unknown'),
    });
  }));
}
