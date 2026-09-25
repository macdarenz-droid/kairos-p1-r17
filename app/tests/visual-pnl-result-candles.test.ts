import { describe, expect, it } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import { projectVisualPnlResultCandles, summarizeVisualPnlByDay, type VisualPnlOutcomeProjection } from '../src/application/visual-pnl';
import { parseDecimalString, type TradeRecord } from '../src/domain/trades';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid fixture decimal: ${value}`);
  return parsed.value;
}
function visual(amount: string | null, currency: string | null = 'USD'): VisualPnlOutcomeProjection {
  if (amount === null) return Object.freeze({ outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' }) as VisualPnlOutcomeProjection;
  const outcome = amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit';
  return Object.freeze({ outcome, label: outcome === 'profit' ? 'Profit' : outcome === 'loss' ? 'Loss' : 'Break-even', amount: dec(amount), currency, source: 'net-pnl' }) as VisualPnlOutcomeProjection;
}
let ids = 0;
function entry(closedAt: string, pnl: VisualPnlOutcomeProjection): JournalHistoryEntry {
  return {
    trade: { id: `t-${++ids}`, symbol: 'TEST', marketType: 'stock', side: 'long', status: 'closed', openedAt: '2026-08-01T00:00:00.000Z', closedAt, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' } as TradeRecord,
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: pnl,
  };
}
const daysOf = (...entries: JournalHistoryEntry[]) => summarizeVisualPnlByDay(entries, 'UTC').days;
const threeDays = () => daysOf(
  entry('2026-09-01T10:00:00.000Z', visual('100')), entry('2026-09-01T11:00:00.000Z', visual('-30')),
  entry('2026-09-02T10:00:00.000Z', visual('-50')), entry('2026-09-02T11:00:00.000Z', visual('10')), entry('2026-09-02T12:00:00.000Z', visual('-90')),
  entry('2026-09-03T10:00:00.000Z', visual('5')), entry('2026-09-03T11:00:00.000Z', visual('-5')),
);
const monthOfDays = () => daysOf(...Array.from({ length: 31 }, (_, i) => entry(`2026-08-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`, visual('1'))));

describe('P13.A3 day candles of the total so far', () => {
  it('keeps each day trades in the order given', () => {
    expect(daysOf(entry('2026-09-01T10:00:00.000Z', visual('100')), entry('2026-09-01T11:00:00.000Z', visual('-30')))[0].tradeResults.map((result) => result.amount)).toEqual(['100', '-30']);
    expect(daysOf(entry('2026-09-01T11:00:00.000Z', visual('-30')), entry('2026-09-01T10:00:00.000Z', visual('100')))[0].tradeResults.map((result) => result.amount)).toEqual(['-30', '100']);
  });

  it('draws three days with zero on the scale', () => {
    const result = projectVisualPnlResultCandles(threeDays());
    if (!result.available) throw new Error(result.reason);
    expect(result.candles.map((c) => [c.open, c.high, c.low, c.close, c.direction])).toEqual([
      ['0', '100', '0', '70', 'up'], ['70', '70', '-60', '-60', 'down'], ['-60', '-55', '-60', '-60', 'even'],
    ]);
    expect(result.candles.map((c) => [c.openStep, c.highStep, c.lowStep, c.closeStep])).toEqual([[375, 1000, 375, 813], [813, 813, 0, 0], [0, 31, 0, 0]]);
    expect(result).toMatchObject({ zeroStep: 375, total: '-60', totalOutcome: 'loss', resultDays: 3, currency: 'USD' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candles)).toBe(true);
    expect(Object.isFrozen(result.candles[0])).toBe(true);
  });

  it('lets the order of the trades decide the highest and lowest', () => {
    const result = projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual('-30')), entry('2026-09-01T11:00:00.000Z', visual('100'))));
    expect(result.available && [result.candles[0].open, result.candles[0].high, result.candles[0].low, result.candles[0].close]).toEqual(['0', '70', '-30', '70']);
  });

  it('puts one profit day on a scale from zero', () => {
    expect(projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual('5'))))).toMatchObject({ zeroStep: 0, candles: [{ open: '0', close: '5', openStep: 0, closeStep: 1000 }] });
  });

  it('draws flat days in the middle', () => {
    const result = projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual('0')), entry('2026-09-02T10:00:00.000Z', visual('0'))));
    if (!result.available) throw new Error(result.reason);
    expect(result.zeroStep).toBe(500);
    expect(result.candles.flatMap((c) => [c.openStep, c.highStep, c.lowStep, c.closeStep])).toEqual(Array(8).fill(500));
    expect(result.candles.map((c) => c.direction)).toEqual(['even', 'even']);
    expect(result.totalOutcome).toBe('breakeven');
  });

  it('draws the last 30 days and counts every day in the total', () => {
    const result = projectVisualPnlResultCandles(monthOfDays());
    if (!result.available) throw new Error(result.reason);
    expect(result.candles).toHaveLength(30);
    expect(result.candles[0]).toMatchObject({ dayKey: '2026-08-02', open: '1', close: '2' });
    expect(result.candles[29]).toMatchObject({ dayKey: '2026-08-31', close: '31' });
    expect(result).toMatchObject({ resultDays: 31, total: '31' });
  });

  it('never counts a missing result as zero and never mixes currencies', () => {
    expect(projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual(null))))).toEqual({ available: false, reason: 'unavailable-result-day' });
    expect(projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual('5', 'USD')), entry('2026-09-02T10:00:00.000Z', visual('5', 'EUR'))))).toEqual({ available: false, reason: 'mixed-currencies' });
    expect(projectVisualPnlResultCandles([])).toEqual({ available: false, reason: 'no-result-days' });
  });
});

describe('T-039d the highest and lowest total drawn', () => {
  it('three days', () => {
    expect(projectVisualPnlResultCandles(threeDays())).toMatchObject({ highest: '100', highestStep: 1000, lowest: '-60', lowestStep: 0 });
  });
  it('the 30-day cap counts only the drawn days', () => {
    expect(projectVisualPnlResultCandles(monthOfDays())).toMatchObject({ highest: '31', highestStep: 1000, lowest: '1', lowestStep: 32 });
  });
  it('one profit day reaches zero at its start', () => {
    expect(projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual('5'))))).toMatchObject({ highest: '5', highestStep: 1000, lowest: '0', lowestStep: 0 });
  });
  it('flat days', () => {
    expect(projectVisualPnlResultCandles(daysOf(entry('2026-09-01T10:00:00.000Z', visual('0')), entry('2026-09-02T10:00:00.000Z', visual('0'))))).toMatchObject({ highest: '0', highestStep: 500, lowest: '0', lowestStep: 500 });
  });
});
