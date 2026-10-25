import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { projectYourTradeBubbleSizes } from '../src/application/dashboard/homeDashboardYourTradesSizing';
import { HomeDashboardYourTrades } from '../src/app/HomeDashboardYourTrades';
import type { HomeYourTrade, HomeYourTradesResult } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { projectVisualPnlPeriod } from '../src/application/visual-pnl';
import { JOURNAL_CHANGED_EVENT } from '../src/data/database';
import type { DecimalString, TradeId } from '../src/domain/trades';

type Comparison = HomeYourTrade['compared'];
/** A closed trade as the read gives it; by default compared as recorded (no home currency). */
const trade = (id: string, amount: string | null, currency: string | null = 'USD', overrides: Partial<HomeYourTrade> = {}): HomeYourTrade => {
  const outcome = amount === null ? 'unavailable' : amount.startsWith('-') ? 'loss' : /^-?0(\.0+)?$/.test(amount) ? 'breakeven' : 'profit';
  const compared: Comparison = amount === null ? { kind: 'no-result' } : currency ? { kind: 'compared', amount: amount as DecimalString, currency, converted: false } : { kind: 'not-compared', reason: 'unknown-currency' };
  return {
    id: id as TradeId, symbol: 'BTCUSD', side: 'long', outcome,
    resultLabel: outcome === 'unavailable' ? 'Not available' : outcome === 'loss' ? 'Loss' : outcome === 'breakeven' ? 'Break-even' : 'Profit',
    amount: amount as DecimalString | null, currency, source: amount === null ? 'none' : 'net-pnl', compared,
    closedAt: '2026-10-12T01:00:00.000Z', closeDayKey: '2026-10-12', ...overrides,
  };
};
const radius = (sizes: ReturnType<typeof projectYourTradeBubbleSizes>, key: string) => sizes.bubbles.find(bubble => bubble.key === key)!.radius;
const formula = (share: number) => .3 + .7 * Math.sqrt(share);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('T-061d Your Trades: a bigger result, a bigger bubble (D270)', () => {
  it('a loss and a win of one size match; bigger is bigger; nothing and no result are the smallest', () => {
    const sizes = projectYourTradeBubbleSizes([trade('small', '20'), trade('middle', '200'), trade('big', '2000'), trade('big-loss', '-2000'), trade('middle-loss', '-200'), trade('zero', '0'), trade('missing', null)]);
    expect(radius(sizes, 'big-loss')).toBe(radius(sizes, 'big'));
    expect(radius(sizes, 'middle-loss')).toBe(radius(sizes, 'middle'));
    expect(radius(sizes, 'big')).toBe(1);
    expect(radius(sizes, 'middle')).toBeCloseTo(formula(.1));
    expect(radius(sizes, 'small')).toBeCloseTo(formula(.01));
    expect(radius(sizes, 'small')).toBeLessThan(radius(sizes, 'middle'));
    expect(sizes.bubbles.find(bubble => bubble.key === 'zero')).toEqual({ key: 'zero', radius: .3, basis: 'compared' });
    expect(sizes.bubbles.find(bubble => bubble.key === 'missing')).toEqual({ key: 'missing', radius: .3, basis: 'no-result' });
  });

  it('compares in the home currency: a converted result sits on the same scale as one recorded in it', () => {
    const converted = trade('converted', '200', 'USD', { compared: { kind: 'compared', amount: '-160' as DecimalString, currency: 'EUR', converted: true } });
    const home = trade('home', '320', 'EUR');
    const sizes = projectYourTradeBubbleSizes([converted, home]);
    expect(radius(sizes, 'home')).toBe(1);
    expect(radius(sizes, 'converted')).toBeCloseTo(formula(.5));
    expect(sizes.currencies).toBe(1);
  });

  it('a trade that could not be compared is the smallest, never the scale, and is counted by why', () => {
    const missingRate = trade('missing-rate', '100000', 'USD', { compared: { kind: 'not-compared', reason: 'missing-rate' } });
    const unknown = trade('unknown', '5000', null);
    const sizes = projectYourTradeBubbleSizes([trade('home', '10', 'EUR'), missingRate, unknown]);
    expect(sizes.bubbles).toEqual([{ key: 'home', radius: 1, basis: 'compared' }, { key: 'missing-rate', radius: .3, basis: 'not-compared' }, { key: 'unknown', radius: .3, basis: 'not-compared' }]);
    expect(sizes.notCompared).toEqual({ missingRate: 1, unknownCurrency: 1 });
  });

  it('without a home currency, sizes compare within each recorded currency, never USD with USDT', () => {
    const sizes = projectYourTradeBubbleSizes([trade('usd', '100'), trade('usd-half', '-50'), trade('yen', '100000000', 'JPY'), trade('tether', '20', 'USDT')]);
    expect(radius(sizes, 'usd')).toBe(1);
    expect(radius(sizes, 'yen')).toBe(1);
    expect(radius(sizes, 'tether')).toBe(1);
    expect(radius(sizes, 'usd-half')).toBeCloseTo(formula(.5));
    expect(sizes.currencies).toBe(3);
  });

  it('keeps the 40 biggest of the period, the newest close first among equals, in the read order', () => {
    const many = Array.from({ length: 63 }, (_, index) => trade(`t${index + 1}`, String(index + 1)));
    const sizes = projectYourTradeBubbleSizes(many);
    expect(sizes.total).toBe(63);
    expect(sizes.bubbles.map(bubble => bubble.key)).toEqual(Array.from({ length: 40 }, (_, index) => `t${index + 24}`));
    // The scale is the biggest of the period.
    expect(radius(sizes, 't63')).toBe(1);

    // 41 equal losses, each an hour after the one before, in a shuffled order, and a newer trade with no result.
    const hour = (n: number) => new Date(Date.parse('2026-10-01T00:00:00.000Z') + n * 3_600_000).toISOString();
    const equal = Array.from({ length: 41 }, (_, index) => (index * 17) % 41).map(n => trade(`e${n}`, '-25', 'USD', { closedAt: hour(n), closeDayKey: hour(n).slice(0, 10) }));
    const tied = projectYourTradeBubbleSizes([...equal, trade('no-result', null, 'USD', { closedAt: hour(100) })]);
    // The trade with no result is the smallest, then e0 is the oldest of the equal ones: both are left out.
    expect(tied.total).toBe(42);
    expect(tied.bubbles.map(bubble => bubble.key)).toEqual(equal.map(item => item.id).filter(id => id !== 'e0'));
  });

  it('never changes its inputs', () => {
    const input = Object.freeze([trade('a', '20'), trade('b', '-2000'), trade('c', null)].map(item => Object.freeze({ ...item, compared: Object.freeze(item.compared) })));
    const before = JSON.stringify(input);
    projectYourTradeBubbleSizes(input, 1);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps the whole decimal range, with no overflow or underflow', () => {
    for (const [small, large] of [['1' + '0'.repeat(400), '2' + '0'.repeat(400)], ['0.' + '0'.repeat(400) + '1', '0.' + '0'.repeat(400) + '2']]) {
      const sizes = projectYourTradeBubbleSizes([trade('a', small), trade('b', `-${large}`)]);
      expect(radius(sizes, 'a')).toBeCloseTo(formula(.5));
      expect(radius(sizes, 'b')).toBe(1);
    }
  });

  it('draws the sizes from the read and resizes when the journal changes; a loss as big as a win is as big', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const projected = projectVisualPnlPeriod({ kind: 'month', at: null }, '2026-10-25');
    if (!projected.ok) throw new Error('fixture');
    const answer = (trades: HomeYourTrade[]): HomeYourTradesResult => ({ kind: 'ready', timeZone: 'UTC', todayKey: '2026-10-25', period: projected.period, homeCurrency: null, trades, hasTrades: true });
    const first = [trade('small', '20'), trade('big', '2000'), trade('loss', '-2000'), trade('missing', null)];
    const load = vi.fn().mockResolvedValueOnce(answer(first)).mockResolvedValue(answer([trade('small', '2000'), trade('big', '20'), ...first.slice(2)]));
    const { container } = render(<MemoryRouter><HomeDashboardYourTrades load={load} /></MemoryRouter>);
    const bubble = (key: string) => container.querySelector<HTMLElement>(`[data-glass-key="${key}"]`)!;
    await waitFor(() => expect(bubble('small')).toBeTruthy());
    const width = (key: string) => parseFloat(bubble(key).style.width);
    expect(width('big')).toBeGreaterThan(width('small'));
    expect(width('loss')).toBe(width('big'));
    expect(bubble('missing').dataset.movement).toBe('neutral');
    expect(bubble('loss').dataset.movement).toBe('negative');
    const original = bubble('small');
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await waitFor(() => expect(width('small')).toBeGreaterThan(width('big')));
    expect(bubble('small')).toBe(original);
    expect(JSON.stringify(first)).toContain('"amount":"20"');
  });
});
