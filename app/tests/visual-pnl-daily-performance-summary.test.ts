import { describe, expect, it } from 'vitest';
import {
  summarizeVisualPnlDailyPerformance,
  type VisualPnlDailySummary,
} from '../src/application/visual-pnl';
import { parseDecimalString } from '../src/domain/trades';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid test decimal: ${value}`);
  return parsed.value;
}
function available(dayKey: string, outcome: 'profit' | 'loss' | 'breakeven'): VisualPnlDailySummary {
  return Object.freeze({
    dayKey, timeZone: 'UTC',
    summary: Object.freeze({
      available: true as const,
      currency: 'USD',
      total: outcome === 'profit' ? dec('1') : outcome === 'loss' ? dec('-1') : dec('0'),
      outcome, tradeCount: 1,
    }),
  });
}
function unavailable(dayKey: string): VisualPnlDailySummary {
  return Object.freeze({
    dayKey, timeZone: 'UTC',
    summary: Object.freeze({
      available: false as const, currency: null, total: null, outcome: null,
      tradeCount: 2, reason: 'mixed-currencies' as const,
    }),
  });
}

describe('P13.15 Visual P&L daily performance summary', () => {
  it('returns explicit zero counts for no result days', () => {
    expect(summarizeVisualPnlDailyPerformance([])).toEqual({
      availableResultDays: 0, profitDays: 0, lossDays: 0, breakEvenDays: 0,
      unavailableResultDays: 0, totalResultDays: 0,
    });
  });

  it('counts profit, loss and break-even result days without monetary aggregation', () => {
    expect(summarizeVisualPnlDailyPerformance([
      available('2026-09-01', 'profit'),
      available('2026-09-02', 'loss'),
      available('2026-09-03', 'profit'),
      available('2026-09-04', 'breakeven'),
    ])).toEqual({
      availableResultDays: 4, profitDays: 2, lossDays: 1, breakEvenDays: 1,
      unavailableResultDays: 0, totalResultDays: 4,
    });
  });

  it('counts unavailable result days separately rather than treating them as losses or zero', () => {
    expect(summarizeVisualPnlDailyPerformance([
      available('2026-09-01', 'profit'),
      unavailable('2026-09-02'),
    ])).toEqual({
      availableResultDays: 1, profitDays: 1, lossDays: 0, breakEvenDays: 0,
      unavailableResultDays: 1, totalResultDays: 2,
    });
  });
});
