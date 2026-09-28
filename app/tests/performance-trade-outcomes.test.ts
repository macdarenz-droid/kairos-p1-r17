import { describe, expect, it } from 'vitest';
import { summarizeTradeOutcomes } from '../src/application/performance/performanceSummary';
import type { VisualPnlOutcomeProjection } from '../src/application/visual-pnl/outcomeProjection';

const LABELS = { profit: 'Profit', loss: 'Loss', breakeven: 'Break-even', unavailable: 'Not available' } as const;
function entry(outcome: VisualPnlOutcomeProjection['outcome']): { visualPnl: VisualPnlOutcomeProjection } {
  const amount = outcome === 'profit' ? '5' : outcome === 'loss' ? '-5' : outcome === 'breakeven' ? '0' : null;
  return { visualPnl: { outcome, label: LABELS[outcome], amount, currency: amount === null ? null : 'USDT', source: amount === null ? 'none' : 'net-pnl' } as VisualPnlOutcomeProjection };
}
const many = (outcome: VisualPnlOutcomeProjection['outcome'], count: number) => Array.from({ length: count }, () => entry(outcome));
const KEYS = ['tradeCount', 'won', 'lost', 'breakEven', 'noResult', 'resultCount', 'enough', 'wonPercent'];

describe('T-050a how a group of trades went (performance owner)', () => {
  it('counts every outcome, gates on 10 results and gives the share won half up', () => {
    const summary = summarizeTradeOutcomes([...many('profit', 7), ...many('loss', 3), entry('breakeven'), ...many('unavailable', 2)]);
    expect(summary).toEqual({ tradeCount: 13, won: 7, lost: 3, breakEven: 1, noResult: 2, resultCount: 11, enough: true, wonPercent: 64 });
  });

  it('rounds 12.5% half up to 13', () => {
    expect(summarizeTradeOutcomes([...many('profit', 3), ...many('loss', 21)]).wonPercent).toBe(13);
  });

  it('gives no share won below 10 results', () => {
    const summary = summarizeTradeOutcomes([...many('profit', 5), ...many('loss', 4), ...many('unavailable', 3)]);
    expect(summary).toMatchObject({ resultCount: 9, enough: false, wonPercent: null });
  });

  it('an empty list gives zeros and no share won', () => {
    expect(summarizeTradeOutcomes([])).toEqual({ tradeCount: 0, won: 0, lost: 0, breakEven: 0, noResult: 0, resultCount: 0, enough: false, wonPercent: null });
  });

  it('every result is frozen with exactly the 8 names', () => {
    for (const summary of [summarizeTradeOutcomes([]), summarizeTradeOutcomes(many('profit', 12))]) {
      expect(Object.isFrozen(summary)).toBe(true);
      expect(Object.keys(summary).sort()).toEqual([...KEYS].sort());
    }
  });
});
