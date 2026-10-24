import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketMinute } from '../src/application/market-reference/minuteCheck';
import type { DecimalString, MarketType } from '../src/domain/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { TradeForm } from '../src/features/journal/TradeForm';
import { TradeFormMarketContext, type TradeFormMarket } from '../src/features/journal/tradeFormMarket';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
afterEach(async () => { cleanup(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });

const minute = (market = 'BTCUSDT', source: 'binance' | 'oanda' = 'binance'): MarketMinute =>
  ({ ok: true, low: '64980' as DecimalString, high: '65120' as DecimalString, at: '2026-10-24T10:32:00.000Z', source, market, midPrice: source === 'oanda' });
type Ask = Readonly<{ marketType: MarketType; symbol: string; at: string }>;
function provider(answer: (ask: Ask) => Promise<MarketMinute> = async () => minute()) {
  return { marketList: vi.fn(async () => ({ ok: true as const, markets: [], names: null })), minute: vi.fn((ask: Ask, _signal: AbortSignal) => answer(ask)) } satisfies TradeFormMarket;
}
async function mount(market: TradeFormMarket, marketType = 'crypto', symbol = 'BTCUSDT') {
  const name = `kairos-minute-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db);
  const view = render(<TradeFormMarketContext.Provider value={market}><TradeForm db={db} kind="journal" onSaved={async () => undefined} /></TradeFormMarketContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: marketType } });
  fireEvent.change(screen.getByRole('combobox', { name: /^Symbol/ }), { target: { value: symbol } });
  fireEvent.change(screen.getByLabelText(/^Opened/), { target: { value: '2026-10-24T10:32' } });
  return view;
}
const typeEntry = (value: string) => fireEvent.change(screen.getByLabelText(/^Entry price/), { target: { value } });
const TYPO = /^BTCUSDT did not trade at 6500 at \d\d:\d\d \(it traded between 64980 and 65120\)\. Typo\?$/;

describe('T-059d the minute check on the trade form', () => {
  it('shows the market price at that minute on a tap, for the time it sits under', async () => {
    const market = provider();
    const { container } = await mount(market);
    expect(screen.queryByRole('button', { name: 'See the market price at that minute, closed' })).toBeNull();
    const link = screen.getByRole('button', { name: 'See the market price at that minute, opened' });
    expect(market.minute).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(link); });
    expect(market.minute).toHaveBeenCalledWith({ marketType: 'crypto', symbol: 'BTCUSDT', at: new Date('2026-10-24T10:32').toISOString() }, expect.any(AbortSignal));
    expect(link).toHaveAccessibleDescription(/^At \d\d:\d\d BTCUSDT traded between 64980 and 65120 \(Binance, 1-minute candle\)\.$/);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.change(screen.getByLabelText(/^Opened/), { target: { value: '2026-10-24T10:40' } });
    expect(screen.queryByText(/traded between/)).toBeNull();
  });

  it('says when the time has not happened yet', async () => {
    await mount(provider(async () => ({ ok: false, why: 'future', retryAfterSeconds: null, note: null, source: { provider: 'binance' } })));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'See the market price at that minute, opened' })); });
    expect(screen.getByText("That time hasn't happened yet.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says "Typo?" for a crypto price outside its minute, never blocking, and drops it once the price is fixed', async () => {
    await mount(provider());
    typeEntry('6500');
    const warning = await screen.findByText(TYPO, undefined, { timeout: 2000 });
    expect(screen.getByLabelText(/^Entry price/)).toHaveAccessibleDescription(expect.stringMatching(/Typo\?$/));
    expect(screen.getByLabelText(/^Entry price/)).toHaveValue('6500');
    expect(warning).toBeInTheDocument();
    typeEntry('65000');
    await waitFor(() => expect(screen.queryByText(/Typo\?/)).toBeNull(), { timeout: 2000 });
  });

  it('never says "Typo?" for forex: mid prices can\'t judge a fill', async () => {
    const market = provider(async () => minute('EUR/USD', 'oanda'));
    await mount(market, 'forex', 'EURUSD');
    typeEntry('6500');
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(market.minute).not.toHaveBeenCalled();
    expect(screen.queryByText(/Typo\?/)).toBeNull();
  });

  it('a newer price cancels the older read: its answer is never shown', async () => {
    const answers: ((value: MarketMinute) => void)[] = [];
    const market = provider(ask => new Promise<MarketMinute>(resolve => { answers.push(resolve); void ask; }));
    await mount(market);
    typeEntry('6500');
    await waitFor(() => expect(market.minute).toHaveBeenCalledTimes(1), { timeout: 2000 });
    typeEntry('65000');
    await act(async () => { answers[0]!(minute()); });
    expect(screen.queryByText(/Typo\?/)).toBeNull();
    await waitFor(() => expect(market.minute).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(market.minute.mock.calls[0]![1].aborted).toBe(true);
    await act(async () => { answers[1]!(minute()); });
    expect(screen.queryByText(/Typo\?/)).toBeNull();
  });
});
