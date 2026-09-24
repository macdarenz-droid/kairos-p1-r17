import { decimalSubtract, decimalSum } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades/tradeTypes';
import type { JournalHistoryEntry } from '../journal';
import { projectVisualPnlDayKey, summarizeVisualPnlByDay } from '../visual-pnl';
import type { GoalsPreference } from './goalsPreference';

/**
 * P26.2 read-only goals progress projection.
 *
 * Counts and compares only: closed trades per calendar month and trades opened
 * per calendar day come from the released P12 history entries through the P13.6
 * day-key contract; the monthly realized result comes from the P13.7 daily
 * summaries and the P13.5 aggregation (decimal kernel, one explicit currency,
 * no FX). Nothing here writes, infers a time zone or invents a result.
 */
export interface GoalsProgressInput {
  readonly preference: GoalsPreference;
  readonly entries: readonly JournalHistoryEntry[];
  readonly timeZone: string;
  /** The current instant as a canonical UTC ISO string. */
  readonly now: string;
}

export type GoalsTradesPerMonthProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'progress'; target: number; current: number; reached: boolean }>;

export type GoalsMaxTradesPerDayProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'limit'; limit: number; today: number; remaining: number; exceeded: boolean }>;

export type GoalsMonthlyResultProgress =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'unavailable'; target: DecimalString; currency: string; reason: 'no-comparable-days' | 'aggregate-failed'; incompleteDays: number }>
  | Readonly<{ kind: 'progress'; target: DecimalString; currency: string; current: DecimalString; remaining: DecimalString; reached: boolean; comparableDays: number; incompleteDays: number }>;

export type GoalsProgressProjection =
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' | 'invalid-time-zone' }>
  | Readonly<{
      kind: 'ready';
      timeZone: string;
      todayKey: string;
      monthKey: string;
      /** How many history entries the projection could see (the P12 bound). */
      consideredEntries: number;
      tradesPerMonth: GoalsTradesPerMonthProgress;
      maxTradesPerDay: GoalsMaxTradesPerDayProgress;
      monthlyResult: GoalsMonthlyResultProgress;
    }>;

const isNegative = (value: DecimalString): boolean => value.startsWith('-');

export function projectGoalsProgress({ preference, entries, timeZone, now }: GoalsProgressInput): GoalsProgressProjection {
  const today = projectVisualPnlDayKey(now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: today.reason === 'invalid-time-zone' ? 'invalid-time-zone' as const : 'invalid-now' as const });
  const todayKey = today.dayKey, monthKey = todayKey.slice(0, 7);

  const closed = entries.filter((entry) => entry.trade.status === 'closed');
  const monthDays = summarizeVisualPnlByDay(closed, timeZone).days.filter((day) => day.dayKey.startsWith(`${monthKey}-`));
  const closedThisMonth = monthDays.reduce((count, day) => count + day.summary.tradeCount, 0);

  let openedToday = 0;
  for (const entry of entries) {
    if (entry.trade.status !== 'open' && entry.trade.status !== 'closed') continue;
    const opened = projectVisualPnlDayKey(entry.trade.openedAt, timeZone);
    if (opened.available && opened.dayKey === todayKey) openedToday += 1;
  }

  const tradesPerMonth: GoalsTradesPerMonthProgress = preference.tradesPerMonthTarget === null
    ? Object.freeze({ kind: 'unset' as const })
    : Object.freeze({ kind: 'progress' as const, target: preference.tradesPerMonthTarget, current: closedThisMonth, reached: closedThisMonth >= preference.tradesPerMonthTarget });

  const maxTradesPerDay: GoalsMaxTradesPerDayProgress = preference.maxTradesPerDay === null
    ? Object.freeze({ kind: 'unset' as const })
    : Object.freeze({ kind: 'limit' as const, limit: preference.maxTradesPerDay, today: openedToday, remaining: Math.max(0, preference.maxTradesPerDay - openedToday), exceeded: openedToday > preference.maxTradesPerDay });

  let monthlyResult: GoalsMonthlyResultProgress;
  if (preference.monthlyResultTarget === null) {
    monthlyResult = Object.freeze({ kind: 'unset' as const });
  } else {
    const { amount: target, currency } = preference.monthlyResultTarget;
    const comparable = monthDays.filter((day) => day.summary.available && day.summary.currency === currency);
    const incompleteDays = monthDays.length - comparable.length;
    if (comparable.length === 0) {
      monthlyResult = Object.freeze({ kind: 'unavailable' as const, target, currency, reason: 'no-comparable-days' as const, incompleteDays });
    } else {
      const total = decimalSum(comparable.map((day) => day.summary.total as DecimalString));
      const remaining = total.ok ? decimalSubtract(target, total.value) : total;
      monthlyResult = total.ok && remaining.ok
        ? Object.freeze({ kind: 'progress' as const, target, currency, current: total.value, remaining: isNegative(remaining.value) ? ('0' as DecimalString) : remaining.value, reached: !isNegative(remaining.value) ? remaining.value === '0' : true, comparableDays: comparable.length, incompleteDays })
        : Object.freeze({ kind: 'unavailable' as const, target, currency, reason: 'aggregate-failed' as const, incompleteDays });
    }
  }

  return Object.freeze({ kind: 'ready' as const, timeZone, todayKey, monthKey, consideredEntries: entries.length, tradesPerMonth, maxTradesPerDay, monthlyResult });
}
