import { describe, expect, it } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';
import {
  pickVisualPnlResultCandleUnit,
  projectVisualPnlResultCandles,
  projectVisualPnlResultCandlesBy,
  summarizeVisualPnlByDay,
  type VisualPnlOutcomeProjection,
} from '../src/application/visual-pnl';
import { parseDecimalString, type DecimalString, type TradeRecord } from '../src/domain/trades';

function visual(amount: string | null, currency = 'USD'): VisualPnlOutcomeProjection {
  if (amount === null) return Object.freeze({ outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' });
  const parsed = parseDecimalString(amount);
  if (!parsed.ok) throw new Error(`fixture ${amount}`);
  const outcome = amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit';
  return Object.freeze({ outcome, label: 'Profit', amount: parsed.value, currency, source: 'net-pnl' }) as VisualPnlOutcomeProjection;
}
let ids = 0;
function entry(closedAt: string, pnl: VisualPnlOutcomeProjection): JournalHistoryEntry {
  return {
    trade: { id: `t-${++ids}`, symbol: 'TEST', marketType: 'stock', side: 'long', status: 'closed', openedAt: '2026-07-01T00:00:00.000Z', closedAt, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' } as TradeRecord,
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: pnl,
  };
}
/** The days and each day's trade ids, as the dashboard gives them. */
function daysOf(entries: readonly JournalHistoryEntry[]) {
  const tradeIdsByDay: Record<string, string[]> = {};
  for (const item of entries) (tradeIdsByDay[item.trade.closedAt!.slice(0, 10)] ??= []).push(item.trade.id);
  return { days: summarizeVisualPnlByDay(entries, 'UTC').days, tradeIdsByDay };
}
const threeDays = () => [
  entry('2026-09-01T10:00:00.000Z', visual('100')), entry('2026-09-01T11:00:00.000Z', visual('-30')),
  entry('2026-09-02T10:00:00.000Z', visual('-50')), entry('2026-09-02T11:00:00.000Z', visual('10')), entry('2026-09-02T12:00:00.000Z', visual('-90')),
  entry('2026-09-03T10:00:00.000Z', visual('5')), entry('2026-09-03T11:00:00.000Z', visual('-5')),
];
/** 1 August to 9 September 2026, one +1 trade a day. */
const fortyDays = () => Array.from({ length: 40 }, (_, index) => entry(new Date(Date.UTC(2026, 7, 1 + index, 10)).toISOString(), visual('1')));
const prices = (candle: { open: string; high: string; low: string; close: string }) => [candle.open, candle.high, candle.low, candle.close];

describe('T-051i your total as day, week or month candles', () => {
  it('gives the day candles of the day picture for the unit "day"', () => {
    const { days } = daysOf(threeDays());
    const before = projectVisualPnlResultCandles(days);
    const after = projectVisualPnlResultCandlesBy(days, { unit: 'day' });
    if (!before.available || !after.available) throw new Error('fixture');
    expect(after.candles.map(prices)).toEqual(before.candles.map(prices));
    expect(after.candles.map(candle => [candle.openStep, candle.highStep, candle.lowStep, candle.closeStep])).toEqual(before.candles.map(candle => [candle.openStep, candle.highStep, candle.lowStep, candle.closeStep]));
    expect(after.candles.map(candle => [candle.fromDayKey, candle.toDayKey])).toEqual([['2026-09-01', '2026-09-02'], ['2026-09-02', '2026-09-03'], ['2026-09-03', '2026-09-04']]);
    expect([after.unit, after.total, after.resultDays, after.unitCount]).toEqual(['day', '-60', 3, 3]);
  });

  it('draws one week candle from its days, with the highest and lowest total inside the week', () => {
    const entries = threeDays();
    const { days, tradeIdsByDay } = daysOf(entries);
    const week = projectVisualPnlResultCandlesBy(days, { unit: 'week', tradeIdsByDay });
    if (!week.available) throw new Error(week.reason);
    expect(week.candles).toHaveLength(1);
    const [candle] = week.candles;
    expect(prices(candle!)).toEqual(['0', '100', '-60', '-60']);
    expect(candle).toMatchObject({ dayKey: '2026-08-31', fromDayKey: '2026-08-31', toDayKey: '2026-09-07', tradeCount: 7, direction: 'down' });
    expect(candle!.tradeIds).toEqual(entries.map(item => item.trade.id));
    expect(Object.isFrozen(week) && Object.isFrozen(candle) && Object.isFrozen(candle!.tradeIds)).toBe(true);
    const month = projectVisualPnlResultCandlesBy(days, { unit: 'month' });
    expect(month.available && month.candles.map(item => [item.fromDayKey, item.toDayKey])).toEqual([['2026-09-01', '2026-10-01']]);
  });

  it('draws the last 30 candles and counts every group; picks the smallest unit that fits', () => {
    const { days } = daysOf(fortyDays());
    const byDay = projectVisualPnlResultCandlesBy(days, { unit: 'day' });
    const byWeek = projectVisualPnlResultCandlesBy(days, { unit: 'week' });
    if (!byDay.available || !byWeek.available) throw new Error('fixture');
    expect([byDay.candles.length, byDay.unitCount, byDay.total]).toEqual([30, 40, '40']);
    expect(byWeek.candles.map(candle => candle.fromDayKey)).toEqual(['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']);
    expect(byWeek.candles.map(candle => candle.tradeCount)).toEqual([2, 7, 7, 7, 7, 7, 3]);
    expect(pickVisualPnlResultCandleUnit(days)).toBe('week');
    expect(pickVisualPnlResultCandleUnit(daysOf(threeDays()).days)).toBe('day');
    const year = Array.from({ length: 250 }, (_, index) => entry(new Date(Date.UTC(2026, 0, 1 + index, 10)).toISOString(), visual('1')));
    expect(pickVisualPnlResultCandleUnit(daysOf(year).days)).toBe('month');
  });

  it('places marks in the candle of their trade, at the step of their amount', () => {
    const entries = threeDays();
    const { days, tradeIdsByDay } = daysOf(entries);
    const projection = projectVisualPnlResultCandlesBy(days, {
      unit: 'day', tradeIdsByDay,
      marks: [{ key: 'after-fourth', afterTradeId: entries[3]!.trade.id, amount: '30' as DecimalString }, { key: 'start', afterTradeId: null, amount: '0' as DecimalString }],
    });
    if (!projection.available) throw new Error(projection.reason);
    // The scale runs from -60 to 100: 30 is (30 + 60) / 160 of 1000 steps, half up.
    expect(projection.marks).toEqual([
      { key: 'after-fourth', step: 563, candleIndex: 1, atStart: false },
      { key: 'start', step: projection.zeroStep, candleIndex: null, atStart: true },
    ]);
    const forty = fortyDays();
    const long = daysOf(forty);
    const cut = projectVisualPnlResultCandlesBy(long.days, {
      unit: 'day', tradeIdsByDay: long.tradeIdsByDay,
      marks: [{ key: 'early', afterTradeId: forty[0]!.trade.id, amount: '1' as DecimalString }, { key: 'start', afterTradeId: null, amount: '0' as DecimalString }, { key: 'late', afterTradeId: forty[39]!.trade.id, amount: '40' as DecimalString }],
    });
    if (!cut.available) throw new Error(cut.reason);
    // The first 10 days are not drawn, so neither are the start nor a point inside them.
    expect(cut.marks).toEqual([
      { key: 'early', step: null, candleIndex: null, atStart: false },
      { key: 'start', step: null, candleIndex: null, atStart: true },
      { key: 'late', step: 1000, candleIndex: 29, atStart: false },
    ]);
  });

  it('joins a week candle\'s trade ids in the order of its days', () => {
    const entries = [entry('2026-09-08T10:00:00.000Z', visual('2')), entry('2026-09-07T10:00:00.000Z', visual('1')), entry('2026-09-07T12:00:00.000Z', visual('3'))]
      .sort((left, right) => left.trade.closedAt!.localeCompare(right.trade.closedAt!));
    const { days, tradeIdsByDay } = daysOf(entries);
    const week = projectVisualPnlResultCandlesBy(days, { unit: 'week', tradeIdsByDay });
    expect(week.available && week.candles[0]!.tradeIds).toEqual(entries.map(item => item.trade.id));
  });

  it('draws nothing when a day has no result, or the trades mix currencies', () => {
    const noResult = daysOf([entry('2026-09-01T10:00:00.000Z', visual('10')), entry('2026-09-02T10:00:00.000Z', visual(null))]).days;
    expect(projectVisualPnlResultCandlesBy(noResult, { unit: 'week' })).toEqual({ available: false, reason: 'unavailable-result-day' });
    const mixed = daysOf([entry('2026-09-01T10:00:00.000Z', visual('10')), entry('2026-09-02T10:00:00.000Z', visual('5', 'EUR'))]).days;
    // The same reason as the day picture: the progress series' own.
    expect(projectVisualPnlResultCandles(mixed)).toMatchObject({ available: false });
    expect(projectVisualPnlResultCandlesBy(mixed, { unit: 'month' })).toEqual(projectVisualPnlResultCandles(mixed));
  });
});
