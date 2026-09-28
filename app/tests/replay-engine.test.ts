import { describe, expect, it } from 'vitest';
import { placeReplayOrder, projectReplayView, type ReplayOrder, type ReplayOrderInput } from '../src/application/practice/replayEngine';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';
import { HOUR, replayCandle } from './fixtures/replayCandles';

const T0 = Date.parse('2024-03-01T00:00:00.000Z');
const c = (i: number, o: string, h: string, l: string, cl: string) => replayCandle(T0 + i * HOUR, o, h, l, cl);
const flat = (count: number, o = '100', h = '101', l = '99', cl = '100') => Array.from({ length: count }, (_, i) => c(i, o, h, l, cl));
/** Candles 0–4 flat at 100, then the given candles from index 5. */
const series = (...later: [string, string, string, string][]) => [...flat(5), ...later.map((p, k) => c(5 + k, ...p)), c(5 + later.length, '100', '101', '99', '100')];
const LONG: ReplayOrderInput = { side: 'long', entryPrice: '98', stopPrice: '95', targetPrice: '104', quantity: '1' };

function place(candles: readonly MarketCandle[], input: ReplayOrderInput = LONG, cursor = 5): ReplayOrder {
  const placed = placeReplayOrder(candles, cursor, input);
  if (!placed.ok) throw new Error(placed.reason);
  return placed.order;
}
const outcome = (candles: readonly MarketCandle[], cursor: number, order: ReplayOrder) => projectReplayView(candles, cursor, order)!.outcome;
const fill = (price: string, candle: MarketCandle, atOpen: boolean, jumped: boolean) => ({ price, at: candle.openTime, atOpen, jumped });

describe('T-038a placing a replay trade', () => {
  it('parses the plan and remembers where and at what price it was placed', () => {
    const candles = flat(10);
    const placed = placeReplayOrder(candles, 5, { ...LONG, entryPrice: ' 98 ' });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.order).toMatchObject({ side: 'long', entryPrice: '98', stopPrice: '95', targetPrice: '104', quantity: '1', placedAt: 5, placedPrice: '100' });
    expect(Object.isFrozen(placed.order)).toBe(true);
  });

  it.each([
    ['side-required', { ...LONG, side: '' }, 5],
    ['entry-invalid', { ...LONG, entryPrice: 'abc' }, 5],
    ['stop-invalid', { ...LONG, stopPrice: '0' }, 5],
    ['target-invalid', { ...LONG, targetPrice: '-1' }, 5],
    ['quantity-invalid', { ...LONG, quantity: '' }, 5],
    ['levels-not-ordered', { ...LONG, stopPrice: '99', targetPrice: '97' }, 5],
    ['levels-not-ordered', { side: 'short', entryPrice: '100', stopPrice: '95', targetPrice: '90', quantity: '1' }, 5],
    ['no-candle-left', LONG, 10],
    ['no-candle-shown', LONG, 0],
  ] as const)('refuses with %s', (reason, input, cursor) => {
    expect(placeReplayOrder(flat(10), cursor, input as ReplayOrderInput)).toEqual({ ok: false, reason });
  });
});

describe('T-038a what the replay shows', () => {
  it('shows the last 60 candles, the time right after the last one, and how many are left', () => {
    const candles = flat(100);
    const view = projectReplayView(candles, 80, null)!;
    expect(view.window).toEqual(candles.slice(20, 80));
    expect(view.last).toBe(candles[79]);
    expect(view.replayTime).toBe(candles[80]!.openTime);
    expect(view.candlesLeft).toBe(20);
    expect(view.outcome).toBeNull();
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.window)).toBe(true);
  });

  it('reaches back to the candle a trade was placed on', () => {
    const candles = flat(100);
    const order = place(candles, LONG, 10);
    expect(projectReplayView(candles, 80, order)!.window[0]).toBe(candles[9]);
  });

  it('has no view outside the candles', () => {
    expect(projectReplayView(flat(100), 0, null)).toBeNull();
    expect(projectReplayView(flat(100), 101, null)).toBeNull();
  });

  it('never looks at a candle that is not shown yet', () => {
    const first = series(['100', '101', '97.5', '99'], ['99', '104.5', '98.5', '104']);
    const second = [...first.slice(0, 6), ...first.slice(6).map((_, k) => c(6 + k, '95', '96', '90', '91'))];
    const order = place(first);
    expect(projectReplayView(first, 6, order)).toEqual(projectReplayView(second, 6, order));
  });
});

describe('T-038a the careful rule', () => {
  it('a touch fills the entry, and a later candle reaches the target', () => {
    const candles = series(['100', '101', '97.5', '99'], ['99', '104.5', '98.5', '104']);
    const order = place(candles);
    expect(outcome(candles, 5, order)).toEqual({ kind: 'waiting' });
    expect(outcome(candles, 6, order)).toEqual({ kind: 'open', entry: fill('98', candles[5]!, false, false) });
    expect(outcome(candles, 7, order)).toEqual({ kind: 'closed', reason: 'target', entry: fill('98', candles[5]!, false, false), exit: fill('104', candles[6]!, false, false) });
  });

  it('on the entry candle only the stop counts', () => {
    const past = series(['100', '105', '97.5', '99']);
    expect(outcome(past, 6, place(past))).toEqual({ kind: 'open', entry: fill('98', past[5]!, false, false) });
    const stopped = series(['100', '101', '94', '95']);
    expect(outcome(stopped, 6, place(stopped))).toEqual({ kind: 'closed', reason: 'stop', entry: fill('98', stopped[5]!, false, false), exit: fill('95', stopped[5]!, false, false) });
  });

  it('a candle that reaches both counts the stop', () => {
    const candles = series(['100', '101', '97.5', '99'], ['99', '105', '94', '100']);
    expect(outcome(candles, 7, place(candles))).toEqual({ kind: 'closed', reason: 'stop', entry: fill('98', candles[5]!, false, false), exit: fill('95', candles[6]!, false, false) });
  });

  it('a price that jumps past a level fills at the opening price', () => {
    const down = series(['100', '101', '97.5', '99'], ['93', '94', '92', '93']);
    expect(outcome(down, 7, place(down))).toEqual({ kind: 'closed', reason: 'stop', entry: fill('98', down[5]!, false, false), exit: fill('93', down[6]!, true, true) });
    const up = series(['100', '101', '97.5', '99'], ['106', '107', '105', '106']);
    expect(outcome(up, 7, place(up))).toEqual({ kind: 'closed', reason: 'target', entry: fill('98', up[5]!, false, false), exit: fill('106', up[6]!, true, true) });
    const gap = series(['103', '104', '102.5', '103.5']);
    expect(outcome(gap, 6, place(gap, { side: 'long', entryPrice: '102', stopPrice: '99', targetPrice: '110', quantity: '1' }))).toEqual({ kind: 'open', entry: fill('103', gap[5]!, true, true) });
  });

  it('an entry at the price now fills at the next open, and the whole candle counts', () => {
    const candles = series(['100.5', '101.5', '100', '101']);
    const order = place(candles, { side: 'long', entryPrice: '100', stopPrice: '95', targetPrice: '101', quantity: '1' });
    expect(outcome(candles, 6, order)).toEqual({ kind: 'closed', reason: 'target', entry: fill('100.5', candles[5]!, true, true), exit: fill('101', candles[5]!, false, false) });
  });

  it('short trades mirror the rule', () => {
    const SHORT: ReplayOrderInput = { side: 'short', entryPrice: '100', stopPrice: '105', targetPrice: '90', quantity: '1' };
    const stopped = series(['100', '106', '99', '104']);
    expect(outcome(stopped, 6, place(stopped, SHORT))).toEqual({ kind: 'closed', reason: 'stop', entry: fill('100', stopped[5]!, true, false), exit: fill('105', stopped[5]!, false, false) });
    const won = series(['100', '101', '89', '90']);
    expect(outcome(won, 6, place(won, SHORT))).toEqual({ kind: 'closed', reason: 'target', entry: fill('100', won[5]!, true, false), exit: fill('90', won[5]!, false, false) });
    const touch = series(['100', '102.5', '99.5', '101']);
    expect(outcome(touch, 6, place(touch, { side: 'short', entryPrice: '102', stopPrice: '104', targetPrice: '95', quantity: '1' }))).toEqual({ kind: 'open', entry: fill('102', touch[5]!, false, false) });
  });

  it('a plan the price never reaches keeps waiting', () => {
    const candles = flat(20);
    expect(outcome(candles, 20, place(candles, { side: 'long', entryPrice: '90', stopPrice: '85', targetPrice: '120', quantity: '1' }))).toEqual({ kind: 'waiting' });
  });

  it('tiny prices are compared exactly', () => {
    const candles = [...flat(5, '0.0000125', '0.0000126', '0.0000124', '0.0000125'), c(5, '0.0000125', '0.0000126', '0.00001229', '0.0000124'), c(6, '0.0000124', '0.0000125', '0.0000123', '0.0000124')];
    const order = place(candles, { side: 'long', entryPrice: '0.0000123', stopPrice: '0.000012', targetPrice: '0.000013', quantity: '1' });
    expect(outcome(candles, 6, order)).toEqual({ kind: 'open', entry: fill('0.0000123', candles[5]!, false, false) });
  });
});
