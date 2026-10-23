import { describe, expect, it } from 'vitest';
import {
  projectVisualPnlMonthGrid,
  projectVisualPnlMonthTotals,
  summarizeVisualPnlAggregation,
  type VisualPnlDailySummaryDay,
  type VisualPnlOutcomeProjection,
} from '../src/application/visual-pnl';
import type { DecimalString } from '../src/domain/trades';

function result(amount: string | null, currency = 'USDT'): VisualPnlOutcomeProjection {
  if (amount === null) return { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' };
  const outcome = amount === '0' ? 'breakeven' : amount.startsWith('-') ? 'loss' : 'profit';
  return { outcome, label: outcome === 'profit' ? 'Profit' : outcome === 'loss' ? 'Loss' : 'Break-even', amount: amount as DecimalString, currency, source: 'net-pnl' };
}
function day(dayKey: string, ...amounts: (string | null)[]): VisualPnlDailySummaryDay {
  const tradeResults = amounts.map(amount => result(amount));
  return { dayKey, timeZone: 'UTC', summary: summarizeVisualPnlAggregation(tradeResults), tradeResults };
}
const totalOf = (summary: ReturnType<typeof summarizeVisualPnlAggregation> | null) => summary === null ? null : summary.available ? summary.total : summary.reason;

describe('T-051h week and month totals', () => {
  it('adds up each calendar row and the month, Monday first (September 2026 starts on a Tuesday)', () => {
    const totals = projectVisualPnlMonthTotals({ monthKey: '2026-09', days: [day('2026-09-02', '100'), day('2026-09-03', '-25'), day('2026-09-09', '10')] })!;
    expect(totals.weeks.map(week => totalOf(week.summary))).toEqual(['75', '10', null, null, null]);
    expect(totals.weeks[0]).toMatchObject({ dayKeys: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'], fromDayKey: '2026-09-01', toDayKey: '2026-09-07' });
    expect(totals.weeks[0]!.summary).toMatchObject({ available: true, outcome: 'profit', currency: 'USDT', tradeCount: 2 });
    expect(totals.weeks[4]).toMatchObject({ dayKeys: ['2026-09-28', '2026-09-29', '2026-09-30'], fromDayKey: '2026-09-28', toDayKey: '2026-10-01', summary: null, strength: null });
    expect(totals.month).toMatchObject({ available: true, total: '85', tradeCount: 3 });
    expect([totals.monthFromDayKey, totals.monthToDayKey]).toEqual(['2026-09-01', '2026-10-01']);
    expect(Object.isFrozen(totals) && Object.isFrozen(totals.weeks) && Object.isFrozen(totals.weeks[0])).toBe(true);
  });

  it('counts only the days in the period', () => {
    const totals = projectVisualPnlMonthTotals({
      monthKey: '2026-09',
      days: [day('2026-09-09', '10'), day('2026-09-14', '5'), day('2026-09-20', '7'), day('2026-09-21', '100')],
      period: { fromDayKey: '2026-09-14', toDayKey: '2026-09-21' },
    })!;
    expect(totals.weeks.map(week => week.dayKeys.length)).toEqual([0, 0, 7, 0, 0]);
    expect(totals.weeks[0]).toMatchObject({ fromDayKey: null, toDayKey: null, summary: null });
    expect(totals.weeks[2]).toMatchObject({ fromDayKey: '2026-09-14', toDayKey: '2026-09-21' });
    expect(totalOf(totals.weeks[2]!.summary)).toBe('12');
    expect(totalOf(totals.month)).toBe('12');
    expect([totals.monthFromDayKey, totals.monthToDayKey]).toEqual(['2026-09-14', '2026-09-21']);
  });

  it('blocks a week and the month on a trade with no result, and still gives the other weeks', () => {
    const totals = projectVisualPnlMonthTotals({ monthKey: '2026-09', days: [day('2026-09-02', '100', null), day('2026-09-09', '10')] })!;
    expect(totals.weeks.map(week => totalOf(week.summary))).toEqual(['unavailable-trade-outcome', '10', null, null, null]);
    expect(totals.weeks[0]!.summary).toMatchObject({ available: false, tradeCount: 2 });
    expect(totalOf(totals.month)).toBe('unavailable-trade-outcome');
    expect(totals.weeks[0]!.strength).toBeNull();
  });

  it('colours weeks against the largest week, apart from the days', () => {
    const days = [day('2026-09-02', '100'), day('2026-09-03', '-25'), day('2026-09-09', '30')];
    const totals = projectVisualPnlMonthTotals({ monthKey: '2026-09', days })!;
    // 75 is the largest week; 30 is 1.6 of 4 steps.
    expect(totals.weeks.map(week => week.strength)).toEqual([4, 2, null, null, null]);
    // The days keep their own scale: 100 is the largest day; 25 and 30 are 1 and 1.2 steps.
    const grid = projectVisualPnlMonthGrid({ monthKey: '2026-09', days, todayKey: null })!;
    expect(grid.days.filter(entry => entry.summary !== null).map(entry => entry.strength)).toEqual([4, 1, 1]);
  });

  it('gives no week strength across currencies, and nothing for a bad month', () => {
    const days = [day('2026-09-02', '100'), { ...day('2026-09-09', '10'), tradeResults: [result('10', 'EUR')], summary: summarizeVisualPnlAggregation([result('10', 'EUR')]) }];
    const totals = projectVisualPnlMonthTotals({ monthKey: '2026-09', days })!;
    expect(totals.weeks.map(week => week.strength)).toEqual([null, null, null, null, null]);
    expect(totalOf(totals.month)).toBe('mixed-currencies');
    expect(projectVisualPnlMonthTotals({ monthKey: '2026-13', days })).toBeNull();
  });
});
