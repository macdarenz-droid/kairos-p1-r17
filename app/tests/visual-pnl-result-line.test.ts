import { describe, expect, it } from 'vitest';
import {
  projectVisualPnlCumulativeRealizedPnl,
  projectVisualPnlProgressSeries,
  projectVisualPnlResultLine,
  type VisualPnlDailySummary,
} from '../src/application/visual-pnl';
import type { DecimalString } from '../src/domain/trades';

function day(dayKey: string, total: string, currency = 'USD'): VisualPnlDailySummary {
  const outcome = total === '0' ? 'breakeven' : total.startsWith('-') ? 'loss' : 'profit';
  return { dayKey, timeZone: 'UTC', summary: { available: true, currency, total: total as DecimalString, outcome, tradeCount: 1 } };
}
const line = (days: VisualPnlDailySummary[]) => projectVisualPnlResultLine(projectVisualPnlCumulativeRealizedPnl(projectVisualPnlProgressSeries(days)));

describe('projectVisualPnlResultLine', () => {
  it('scales the total so far between its lowest and highest point, with zero on the scale', () => {
    const result = line([day('2026-09-01', '100'), day('2026-09-02', '-30'), day('2026-09-03', '-100')]);
    if (!result.available) throw new Error(result.reason);
    expect(result.points.map(point => point.cumulativeAmount)).toEqual(['100', '70', '-30']);
    expect(result.points.map(point => point.yStep)).toEqual([1000, 769, 0]);
    expect(result.zeroYStep).toBe(231);
    expect(result.points.map(point => point.xStep)).toEqual([333, 667, 1000]);
    expect(result.latestOutcome).toBe('loss');
    expect(result.latest.dayKey).toBe('2026-09-03');
    expect(result.currency).toBe('USD');
  });

  it('puts a single profit day at the top with zero at the bottom', () => {
    const result = line([day('2026-09-01', '5')]);
    expect(result).toMatchObject({ available: true, zeroYStep: 0, points: [{ xStep: 1000, yStep: 1000 }], latestOutcome: 'profit' });
  });

  it('draws a flat line in the middle when every total is zero', () => {
    const result = line([day('2026-09-01', '0'), day('2026-09-02', '0')]);
    if (!result.available) throw new Error(result.reason);
    expect(result.zeroYStep).toBe(500);
    expect(result.points.map(point => point.yStep)).toEqual([500, 500]);
    expect(result.latestOutcome).toBe('breakeven');
  });

  it('passes an unavailable reason through', () => {
    expect(line([day('2026-09-01', '5', 'USD'), day('2026-09-02', '5', 'EUR')])).toEqual({ available: false, reason: 'mixed-currencies' });
    expect(line([])).toEqual({ available: false, reason: 'no-result-days' });
  });
});
