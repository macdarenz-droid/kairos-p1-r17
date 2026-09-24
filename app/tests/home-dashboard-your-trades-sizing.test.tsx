import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { projectYourTradeBubbleSizes } from '../src/app/homeDashboardYourTradesSizing';
import { HomeDashboardYourTrades } from '../src/app/HomeDashboardYourTrades';
import type { HomeYourTrade } from '../src/application/dashboard/homeDashboardYourTradesQuery';

const trade = (id: string, amount: string | null, currency: string | null = 'USD', overrides: Partial<HomeYourTrade> = {}): HomeYourTrade => ({
  id, amount, currency, symbol: 'BTCUSD', side: 'long', status: 'closed',
  outcome: amount === null ? 'unavailable' : amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit',
  resultLabel: amount === null ? 'Not available' : amount.startsWith('-') ? 'Loss' : amount === '0' ? 'Break-even' : 'Profit',
  source: amount === null ? 'none' : 'net-pnl', timestamp: '2026-09-12T01:00:00Z', ...overrides,
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Your Trades profit size presentation', () => {
  it('makes increasing profits larger while all losses remain small and zero/missing remain distinct', () => {
    const input = Object.freeze([trade('small','20'), trade('middle','200'), trade('big','2000'), trade('loss','-5'), trade('huge-loss','-20000'), trade('zero','0'), trade('missing',null)].map(t=>Object.freeze(t)));
    const before = JSON.stringify(input), result = projectYourTradeBubbleSizes(input);
    expect(result.map(x => x.key)).toEqual(input.map(x => x.id));
    expect(result[0].radius).toBeLessThan(result[1].radius);
    expect(result[1].radius).toBeLessThan(result[2].radius);
    expect(result[3].radius).toBe(result[4].radius);
    expect(result[3].radius).toBeLessThan(result[5].radius);
    expect(result[5].radius).toBeLessThan(result[0].radius);
    expect(result[5].basis).toBe('breakeven'); expect(result[6].basis).toBe('unavailable');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('compares only exact recorded currencies and never assumes USD equals USDT or unknown', () => {
    const usd = trade('usd','100');
    const baseline = projectYourTradeBubbleSizes([usd])[0];
    const result = projectYourTradeBubbleSizes([usd, trade('yen','100000000','JPY'), trade('tether','20000','USDT'), trade('unknown','999999',null), trade('blank','500','')]);
    expect(result[0]).toEqual(baseline);
    expect(result[3]).toMatchObject({basis:'currency-missing',radius:.5});
    expect(result[4]).toMatchObject({basis:'currency-missing',radius:.5});
  });
  it('preserves decimal range without overflowing or underflowing financial amounts', () => {
    for (const [small, large] of [['1'+'0'.repeat(400),'2'+'0'.repeat(400)], ['0.'+'0'.repeat(400)+'1','0.'+'0'.repeat(400)+'2']]) {
      const result = projectYourTradeBubbleSizes([trade('a',small),trade('b',large)]);
      expect(result[0].radius).toBeCloseTo(.5+.5*Math.sqrt(.5));
      expect(result[1].radius).toBe(1);
    }
  });
  it('leaves open, partial, unavailable, invalid or inconsistent evidence unscaled', () => {
    const inputs = [trade('open','100','USD',{status:'open'}),trade('none','100','USD',{source:'none'}),trade('bad','NaN'),trade('infinite','Infinity'),trade('empty',''),trade('mismatch','-10','USD',{outcome:'profit'}),trade('hidden','100','USD',{outcome:'unavailable'}),trade('null',null)];
    expect(projectYourTradeBubbleSizes(inputs).every(x=>x.basis==='unavailable'&&x.radius===.4)).toBe(true);
    expect(projectYourTradeBubbleSizes([trade('zero','-0','USD',{outcome:'breakeven'})])[0].basis).toBe('breakeven');
  });
  it('uses the full loaded history before pagination and does not mutate or aggregate repeated symbols', () => {
    const rows=Array.from({length:14},(_,i)=>trade(String(i),i===13?'2000':'20'));
    const sizes=projectYourTradeBubbleSizes(rows);
    expect(sizes[0].radius).toBeCloseTo(.55);
    expect(sizes[12].radius).toBe(sizes[0].radius);
    expect(sizes).toHaveLength(14);
    expect(projectYourTradeBubbleSizes([...rows].reverse()).find(x=>x.key==='0')).toEqual(sizes[0]);
  });
  it('renders sizes from saved results, refreshes changed amounts, and keeps details and paging usable', async () => {
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
    const first=[trade('small','20'),trade('big','2000'),trade('loss','-50'),trade('missing',null)];
    const load=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce([trade('small','2000'),trade('big','20'),...first.slice(2)]);
    const {container}=render(<MemoryRouter><HomeDashboardYourTrades load={load}/></MemoryRouter>);
    const bubble=(key:string)=>container.querySelector(`[data-glass-key="${key}"]`) as HTMLElement;
    await waitFor(()=>expect(bubble('small')).toBeTruthy());
    const width=(key:string)=>parseFloat(bubble(key).style.width);
    expect(width('big')).toBeGreaterThan(width('small')); expect(width('loss')).toBeLessThan(width('small'));
    expect(bubble('missing').dataset.movement).toBe('neutral');
    const original=bubble('small'); fireEvent.click(original);
    expect(screen.getByLabelText('Selected trade').textContent).toContain('20 USD');
    fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
    await waitFor(()=>expect(width('small')).toBeGreaterThan(width('big')));
    expect(bubble('small').dataset.glassKey).toBe('small');
    fireEvent.click(bubble('small'));
    expect(screen.getByLabelText('Selected trade').textContent).toContain('2000 USD');
    expect(screen.queryByText(/Equal sizes/)).toBeNull();
    expect(JSON.stringify(first)).toContain('"amount":"20"');
  });
});
