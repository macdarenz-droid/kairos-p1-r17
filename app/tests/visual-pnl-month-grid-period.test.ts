import { describe, expect, it } from 'vitest';
import { projectVisualPnlMonthGrid, type VisualPnlDailySummary } from '../src/application/visual-pnl';
import type { DecimalString } from '../src/domain/trades';

const day = (dayKey: string, total: string): VisualPnlDailySummary => ({
  dayKey, timeZone: 'UTC', summary: { available: true, currency: 'USDT', total: total as DecimalString, outcome: total.startsWith('-') ? 'loss' : 'profit', tradeCount: 1 },
});

describe('T-051d the month calendar inside a results period', () => {
  it('marks only the days of the period, and shows no result outside it', () => {
    const grid = projectVisualPnlMonthGrid({ monthKey: '2026-09', days: [day('2026-09-13', '40'), day('2026-09-15', '10')], todayKey: '2026-09-20', period: { fromDayKey: '2026-09-14', toDayKey: '2026-09-21' } })!;
    expect(grid.days.filter(entry => entry.inPeriod).map(entry => entry.dayKey)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
    expect(grid.days.find(entry => entry.dayKey === '2026-09-13')).toMatchObject({ inPeriod: false, result: 'no-trades', summary: null, strength: null });
    expect(grid.days.find(entry => entry.dayKey === '2026-09-15')).toMatchObject({ inPeriod: true, result: 'profit', strength: 4 });
  });

  it('keeps every day in the period when no period is given, or when it has no ends', () => {
    expect(projectVisualPnlMonthGrid({ monthKey: '2026-09', days: [], todayKey: null })!.days.every(entry => entry.inPeriod)).toBe(true);
    expect(projectVisualPnlMonthGrid({ monthKey: '2026-09', days: [], todayKey: null, period: { fromDayKey: null, toDayKey: null } })!.days.every(entry => entry.inPeriod)).toBe(true);
  });
});
