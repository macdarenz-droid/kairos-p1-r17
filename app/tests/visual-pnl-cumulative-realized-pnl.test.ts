import { describe, expect, it } from 'vitest';
import {
  projectVisualPnlCumulativeRealizedPnl,
  type VisualPnlProgressSeriesProjection,
} from '../src/application/visual-pnl';
import { parseDecimalString } from '../src/domain/trades';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error('invalid fixture');
  return parsed.value;
}

describe('P13.18 cumulative realized P&L semantics', () => {
  it('accumulates comparable single-currency daily results exactly', () => {
    const series: VisualPnlProgressSeriesProjection = Object.freeze({
      available: true,
      currency: 'USD',
      points: Object.freeze([
        Object.freeze({ dayKey: '2026-09-01', amount: dec('100'), outcome: 'profit' as const }),
        Object.freeze({ dayKey: '2026-09-02', amount: dec('-30'), outcome: 'loss' as const }),
        Object.freeze({ dayKey: '2026-09-03', amount: dec('50'), outcome: 'profit' as const }),
      ]),
    });

    expect(projectVisualPnlCumulativeRealizedPnl(series)).toEqual({
      available: true,
      currency: 'USD',
      points: [
        { dayKey: '2026-09-01', dailyAmount: dec('100'), cumulativeAmount: dec('100') },
        { dayKey: '2026-09-02', dailyAmount: dec('-30'), cumulativeAmount: dec('70') },
        { dayKey: '2026-09-03', dailyAmount: dec('50'), cumulativeAmount: dec('120') },
      ],
    });
  });

  it('preserves mixed-currency blocking without FX', () => {
    const series: VisualPnlProgressSeriesProjection = Object.freeze({
      available: false,
      currency: null,
      points: Object.freeze([]),
      reason: 'mixed-currencies',
    });

    expect(projectVisualPnlCumulativeRealizedPnl(series)).toEqual({
      available: false,
      currency: null,
      points: [],
      reason: 'mixed-currencies',
    });
  });

  it('preserves unavailable result days instead of treating them as zero', () => {
    const series: VisualPnlProgressSeriesProjection = Object.freeze({
      available: false,
      currency: null,
      points: Object.freeze([]),
      reason: 'unavailable-result-day',
    });

    expect(projectVisualPnlCumulativeRealizedPnl(series)).toEqual({
      available: false,
      currency: null,
      points: [],
      reason: 'unavailable-result-day',
    });
  });
});
