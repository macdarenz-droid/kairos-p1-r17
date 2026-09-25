import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_HISTORY_CANDLES } from '../src/application/practice/replayCandles';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ReplayScreen } from '../src/features/practice/ReplayScreen';
import type { MarketCandleHistoryRequest } from '../src/services/market-data/MarketCandleHistoryPort';
import { fakeReplayMarket, HOUR, replayCandle } from './fixtures/replayCandles';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-replay-panel-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = Date.parse('2024-04-01T00:00:00.000Z');
const START = '2024-03-01T12:00';
const alignedStart = Math.floor(new Date(START).getTime() / HOUR) * HOUR;

async function started(fake = fakeReplayMarket({ nowMs: NOW }), db?: KairosDatabase) {
  const store = db ?? await database();
  render(<MemoryRouter><ReplayScreen db={store} market={fake.market} playStepMs={25} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: START } });
  fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
  await screen.findByRole('region', { name: /^BTCUSDT · 1 hour candles$/ });
  return store;
}
function placeTrade(side: string, entry: string, stop: string, target: string, quantity: string) {
  fireEvent.change(screen.getByLabelText(/^Direction/), { target: { value: side } });
  fireEvent.change(screen.getByLabelText(/^Entry price/), { target: { value: entry } });
  fireEvent.change(screen.getByLabelText(/^Stop price/), { target: { value: stop } });
  fireEvent.change(screen.getByLabelText(/^Target price/), { target: { value: target } });
  fireEvent.change(screen.getByLabelText(/^Quantity/), { target: { value: quantity } });
  fireEvent.click(screen.getByRole('button', { name: 'Place trade' }));
}
const nextCandle = () => fireEvent.click(screen.getByRole('button', { name: 'Next candle' }));
const left = () => screen.getByText(/candles? left$/).textContent;

describe('T-038e a practice trade on the replay', () => {
  it('goes from plan to entry to target, and saves as a practice trade from replay', async () => {
    const db = await started();
    placeTrade('long', '100', '95', '110', '2');
    expect(screen.getByText('Waiting for the price to reach your entry.')).toBeInTheDocument();
    expect(screen.getByText('Buy 2 at 100, stop 95, target 110.')).toBeInTheDocument();
    for (const level of ['entry', 'stop', 'target']) expect(document.querySelector(`[data-level="${level}"]`)).not.toBeNull();
    expect(document.querySelector('[data-marker]')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your practice trade' })).toHaveFocus());

    nextCandle();
    expect(screen.getByText('Your entry was reached: in at 100 USDT.')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-marker="entry"]')).toHaveLength(1);

    for (let i = 0; i < 9; i += 1) nextCandle();
    expect(screen.getByText('Your target was reached: out at 110 USDT.')).toBeInTheDocument();
    expect(document.querySelector('[data-marker="exit"]')).not.toBeNull();
    expect(document.querySelector('[data-info="result"]')!.textContent).toContain('20 USDT');

    fireEvent.click(screen.getByRole('button', { name: 'Save to my practice trades' }));
    expect(await screen.findByText('Saved with your practice trades. It never counts in your Journal.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'See your practice trades' });
    expect(link.getAttribute('href')).toBe('/practice');
    await waitFor(() => expect(link).toHaveFocus());
    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ source: 'replay', status: 'closed', grossPnlCurrency: 'USDT' });
    const executions = (await db.tradeExecutions.toArray()).sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    expect(executions.map(e => [e.price, e.quantity])).toEqual([['100', '2'], ['110', '2']]);
    expect(screen.queryByRole('button', { name: 'Save to my practice trades' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Place another trade' }));
    await waitFor(() => expect(screen.getByLabelText(/^Direction/)).toHaveFocus());
    expect(await db.trades.count()).toBe(1);
  });

  it('counts the stop when one candle reaches both', async () => {
    await started();
    placeTrade('long', '100', '99.6', '101.2', '1');
    nextCandle();
    expect(screen.getByText('Your stop was reached: out at 99.6 USDT.')).toBeInTheDocument();
  });

  it('says when the price jumped past the entry', async () => {
    const jump = (request: MarketCandleHistoryRequest) => Array.from({ length: REPLAY_HISTORY_CANDLES + 20 }, (_, i) => {
      const openMs = request.startTimeMs! + i * HOUR;
      return i < REPLAY_HISTORY_CANDLES ? replayCandle(openMs, '100', '101', '99', '100') : replayCandle(openMs, '100.5', '101', '100.2', '100.8');
    });
    await started(fakeReplayMarket({ nowMs: NOW, history: jump }));
    placeTrade('long', '100', '95', '120', '1');
    nextCandle();
    expect(screen.getByText('The candle opened past your entry, so you got in at its opening price, 100.5 USDT.')).toBeInTheDocument();
  });

  it('stops playing when the entry is reached', async () => {
    await started();
    placeTrade('long', '100', '95', '110', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await screen.findByText(/^Your entry was reached/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument());
    const count = left();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(left()).toBe(count);
  });

  it('refuses a plan in plain words', async () => {
    await started();
    placeTrade('long', '100', '105', '110', '1');
    expect(screen.getByText('On a buy, the stop goes below the entry and the target above it.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Stop price/)).toHaveFocus());
    placeTrade('long', '100', '95', '110', '');
    expect(screen.getByText('Use an amount above 0, like 1 or 0.01.')).toBeInTheDocument();
    expect(document.querySelector('.kairos-replay__status')).toBeNull();
  });

  it('cannot save a trade the candles never finished', async () => {
    await started(fakeReplayMarket({ nowMs: alignedStart + 3 * HOUR + 1 }));
    placeTrade('long', '90', '85', '120', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText("No candles are left and your trade did not reach its stop or target, so it can't be saved. Remove it, or choose another moment.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save to my practice trades' })).toBeNull();
  });

  it('says when saving fails, and keeps the button', async () => {
    const db = await database();
    await started(undefined, db);
    placeTrade('long', '100', '95', '110', '2');
    for (let i = 0; i < 10; i += 1) nextCandle();
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to my practice trades' }));
    expect(await screen.findByText('Kairos could not save this practice trade. Nothing was changed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to my practice trades' })).toBeInTheDocument();
  });
});
