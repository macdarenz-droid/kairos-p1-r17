import { describe, expect, it } from 'vitest';
import { projectVisualPnlMonthGrid, type VisualPnlDailySummary } from '../src/application/visual-pnl';
import type { DecimalString } from '../src/domain/trades';

function day(dayKey: string, total: string, currency = 'USD'): VisualPnlDailySummary {
  const outcome = total === '0' ? 'breakeven' : total.startsWith('-') ? 'loss' : 'profit';
  return { dayKey, timeZone: 'UTC', summary: { available: true, currency, total: total as DecimalString, outcome, tradeCount: 1 } };
}
function unavailableDay(dayKey: string): VisualPnlDailySummary {
  return { dayKey, timeZone: 'UTC', summary: { available: false, currency: null, total: null, outcome: null, tradeCount: 1, reason: 'mixed-currencies' } };
}
const grid = (monthKey: string, days: VisualPnlDailySummary[] = [], todayKey: string | null = null) => projectVisualPnlMonthGrid({ monthKey, days, todayKey });
const at = (monthKey: string, days: VisualPnlDailySummary[], dayOfMonth: number, todayKey: string | null = null) => grid(monthKey, days, todayKey)!.days[dayOfMonth - 1];

describe('projectVisualPnlMonthGrid', () => {
  it('lays out every day of the month, Monday first', () => {
    const september = grid('2026-09', [day('2026-08-31', '5'), day('2026-10-01', '5')])!;
    expect(september.days).toHaveLength(30);
    expect(september.leadingEmptyCells).toBe(1);
    expect(september.previousMonthKey).toBe('2026-08');
    expect(september.nextMonthKey).toBe('2026-10');
    expect(september.days.every(entry => entry.result === 'no-trades')).toBe(true);
    expect(grid('2026-01')!.previousMonthKey).toBe('2025-12');
    expect(grid('2028-02')!.days).toHaveLength(29);
    expect(grid('2026-13')).toBeNull();
  });

  it('gives result days a strength against the largest day of the month', () => {
    const days = [
      day('2026-09-01', '100'), day('2026-09-02', '62.5'), day('2026-09-03', '-60'), day('2026-09-04', '25'), day('2026-09-05', '0.01'),
      day('2026-09-06', '0'), unavailableDay('2026-09-07'),
    ];
    const month = grid('2026-09', days, '2026-09-10')!;
    expect(month.scale).toEqual({ kind: 'one-currency', currency: 'USD', largestAbsolute: '100' });
    expect(month.days.slice(0, 5).map(entry => entry.strength)).toEqual([4, 3, 2, 1, 1]);
    expect(month.days.slice(0, 5).map(entry => entry.result)).toEqual(['profit', 'profit', 'loss', 'profit', 'profit']);
    expect(month.days[5]).toMatchObject({ result: 'breakeven', strength: null });
    expect(month.days[6]).toMatchObject({ result: 'unavailable', strength: null });
    expect(month.days[7]).toMatchObject({ result: 'no-trades', summary: null, strength: null });
    expect(month.days.filter(entry => entry.isToday).map(entry => entry.dayKey)).toEqual(['2026-09-10']);
  });

  it('shows no strength when sizes cannot be compared', () => {
    const mixed = grid('2026-09', [day('2026-09-01', '100', 'USD'), day('2026-09-02', '-5', 'EUR')])!;
    expect(mixed.scale).toEqual({ kind: 'none', reason: 'mixed-currencies' });
    expect(mixed.days.every(entry => entry.strength === null)).toBe(true);
    expect(grid('2026-09', [day('2026-09-01', '0')])!.scale).toEqual({ kind: 'none', reason: 'no-profit-or-loss-days' });
    expect(at('2026-09', [day('2026-09-01', '0')], 1).result).toBe('breakeven');
  });
});
