import { describe, expect, it } from 'vitest';
import { EMPTY_GOALS_PREFERENCE, mondayOf, projectLimitsCalendar, type GoalsPreference, type GoalsSettings } from '../src/application/goals';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
function trade(id: string, openedAt: string, closedAt: string | null, amount: string | null = null, currency = 'USDT'): JournalHistoryEntry {
  const status = closedAt === null ? 'open' : 'closed';
  const record = { id, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status, source: 'manual', openedAt, closedAt, createdAt: openedAt, updatedAt: openedAt } as unknown as JournalHistoryEntry['trade'];
  const visualPnl = amount === null
    ? { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' }
    : { outcome: amount.startsWith('-') ? 'loss' : 'profit', label: amount.startsWith('-') ? 'Loss' : 'Profit', amount, currency, source: 'net-pnl' };
  return { trade: record, plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl } as unknown as JournalHistoryEntry;
}
const limits = (overrides: Partial<GoalsPreference>): GoalsPreference => ({ ...EMPTY_GOALS_PREFERENCE, ...overrides });
const settingsFrom = (...periods: [string, GoalsPreference][]): GoalsSettings => ({ periods: periods.map(([from, goals]) => ({ from, goals })) });
const dayOf = (months: ReturnType<typeof projectLimitsCalendar>, dayKey: string) => months.flatMap(month => month.days).find(day => day.dayKey === dayKey)!;
const all = limits({ maxTradesPerDay: 2, lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: d('250') } });

describe('T-058d the limits calendar', () => {
  it('judges each day: inside, over, can\'t tell, no trades, and later', () => {
    const months = projectLimitsCalendar({
      settings: settingsFrom(['2026-10-01', all]), inHome: null, timeZone: 'UTC', todayKey: '2026-10-24', firstMonthKey: '2026-10',
      entries: [
        trade('a', '2026-10-05T09:00:00.000Z', '2026-10-05T10:00:00.000Z', '-40'),
        trade('b', '2026-10-06T09:00:00.000Z', '2026-10-06T10:00:00.000Z', '-120'),
        trade('c1', '2026-10-07T09:00:00.000Z', '2026-10-07T10:00:00.000Z', '10'), trade('c2', '2026-10-07T11:00:00.000Z', '2026-10-07T12:00:00.000Z', '10'),
        trade('c3', '2026-10-07T13:00:00.000Z', '2026-10-07T14:00:00.000Z', '10'),
        trade('d', '2026-10-13T09:00:00.000Z', '2026-10-13T10:00:00.000Z', null),
        // A known break wins over a day that can't be counted.
        trade('e1', '2026-10-14T09:00:00.000Z', '2026-10-14T10:00:00.000Z', null), trade('e2', '2026-10-14T11:00:00.000Z', null),
        trade('e3', '2026-10-14T12:00:00.000Z', null),
      ],
    });
    expect(months.map(month => month.monthKey)).toEqual(['2026-10']);
    expect(months[0]!.leadingEmptyCells).toBe(3);
    expect(dayOf(months, '2026-10-05')).toMatchObject({ state: 'inside', trades: { opened: 1, limit: 2, state: 'within' }, dayLoss: { kind: 'counted', lost: '40', state: 'within' }, weekLoss: { kind: 'counted', lost: '40' } });
    expect(dayOf(months, '2026-10-06')).toMatchObject({ state: 'over', dayLoss: { kind: 'counted', lost: '120', state: 'over' }, weekLoss: { kind: 'counted', lost: '160', state: 'within' } });
    expect(dayOf(months, '2026-10-07')).toMatchObject({ state: 'over', trades: { opened: 3, state: 'over' }, dayLoss: { lost: '0' } });
    expect(dayOf(months, '2026-10-08')).toMatchObject({ state: 'no-trades', trades: null, dayLoss: null });
    expect(dayOf(months, '2026-10-13')).toMatchObject({ state: 'unknown', dayLoss: { kind: 'unknown', uncounted: 1 } });
    expect(dayOf(months, '2026-10-14')).toMatchObject({ state: 'over', trades: { opened: 3, state: 'over' }, dayLoss: { kind: 'unknown' } });
    expect(dayOf(months, '2026-10-25')).toMatchObject({ state: 'later' });
    expect(months[0]).toMatchObject({ inside: 1, over: 3, unknown: 1 });
  });

  it('uses the goals in force each day: before a limit was set, days have no limits', () => {
    const months = projectLimitsCalendar({
      settings: settingsFrom(['2026-10-10', limits({ maxTradesPerDay: 1 })]), inHome: null, timeZone: 'UTC', todayKey: '2026-10-24', firstMonthKey: '2026-10',
      entries: [trade('a', '2026-10-05T09:00:00.000Z', null), trade('b', '2026-10-12T09:00:00.000Z', null), trade('c', '2026-10-12T10:00:00.000Z', null)],
    });
    expect(dayOf(months, '2026-10-05').state).toBe('no-limits');
    expect(dayOf(months, '2026-10-12')).toMatchObject({ state: 'over', trades: { opened: 2, limit: 1 } });
  });

  it('a week runs from its Monday, across a month end, in the saved time zone', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    const months = projectLimitsCalendar({
      settings: settingsFrom(['2026-09-01', all]), inHome: null, timeZone: 'America/New_York', todayKey: '2026-11-03', firstMonthKey: '2026-10',
      entries: [
        trade('a', '2026-10-27T15:00:00.000Z', '2026-10-27T16:00:00.000Z', '-200'),
        // 23:00 on 1 November in New York (04:00 UTC on the 2nd): still the week of 26 October.
        trade('b', '2026-11-02T04:00:00.000Z', '2026-11-02T04:30:00.000Z', '-90'),
        trade('c', '2026-11-02T15:00:00.000Z', '2026-11-02T16:00:00.000Z', '-10'),
      ],
    });
    expect(months.map(month => month.monthKey)).toEqual(['2026-10', '2026-11']);
    expect(dayOf(months, '2026-11-01')).toMatchObject({ state: 'over', dayLoss: { lost: '90', state: 'within' }, weekLoss: { lost: '290', state: 'over' } });
    expect(dayOf(months, '2026-11-02')).toMatchObject({ state: 'inside', weekLoss: { lost: '10' } });
  });
});
