import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_HISTORY_CANDLES } from '../src/application/practice/replayCandles';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
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
    fireEvent.click(screen.getByRole('button', { name: 'Remove this trade' }));
    expect(screen.getByText('No candles are left for a new trade. Choose another moment.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your practice trade' })).toHaveFocus());
  });

  it('Remove waits for the save', async () => {
    const db = await database();
    await started(undefined, db);
    placeTrade('long', '100', '95', '110', '2');
    for (let i = 0; i < 10; i += 1) nextCandle();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const realTransaction = db.transaction.bind(db) as (...args: unknown[]) => unknown;
    vi.spyOn(db, 'transaction').mockImplementation((async (...args: unknown[]) => { await held; return realTransaction(...args); }) as never);
    fireEvent.click(screen.getByRole('button', { name: 'Save to my practice trades' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save to my practice trades' })).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('button', { name: 'Remove this trade' })).toBeDisabled();
    release();
    expect(await screen.findByText('Saved with your practice trades. It never counts in your Journal.')).toBeInTheDocument();
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

describe('T-038g play steps that arrive late', () => {
  afterEach(() => { vi.useRealTimers(); });
  const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

  it('stops on the very candle where the entry is reached', async () => {
    await started();
    placeTrade('long', '100', '95', '110', '2');
    fakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => { vi.advanceTimersByTime(25 * 5); });
    expect(screen.getByText('Your entry was reached: in at 100 USDT.')).toBeInTheDocument();
    expect(left()).toBe('239 candles left');
  });

  it('stops on the very candle where the target is reached', async () => {
    await started();
    placeTrade('long', '100', '95', '110', '2');
    nextCandle();
    fakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    for (let round = 0; round < 15; round += 1) act(() => { vi.advanceTimersByTime(25 * 4); });
    expect(screen.getByText('Your target was reached: out at 110 USDT.')).toBeInTheDocument();
    expect(left()).toBe('230 candles left');
  });

  it('never moves after Pause, however late a step fires', async () => {
    await started();
    fakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      vi.advanceTimersByTime(25 * 3);
    });
    expect(left()).toBe('240 candles left');
  });
});

describe('T-052d the share card in Replay', () => {
  it('appears once the replay trade is finished, not before', async () => {
    await started();
    expect(screen.queryByRole('button', { name: 'Share or download image' })).toBeNull();
    placeTrade('long', '100', '95', '110', '2');
    nextCandle();
    expect(screen.getByText('Your entry was reached: in at 100 USDT.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share or download image' })).toBeNull();
    for (let i = 0; i < 9; i += 1) nextCandle();
    expect(screen.getByText('Your target was reached: out at 110 USDT.')).toBeInTheDocument();
    const stage = screen.getByRole('region', { name: /^BTCUSDT · 1 hour candles$/ });
    expect(within(stage).getByRole('button', { name: 'Share or download image' })).toBeInTheDocument();
    expect(within(stage).getByRole('checkbox', { name: 'Hide money amounts' })).not.toBeChecked();
    expect(within(stage).getByRole('button', { name: 'Tall' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('T-052d fix r1 the Replay card is the trade as it closed', () => {
  it('is made once when the trade closes, and later candles do not change it', async () => {
    const context = { fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', fillRect: () => undefined, fillText: () => undefined, drawImage: () => undefined, measureText: (text: string) => ({ width: text.length * 10 }) };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => { callback(new Blob(['png'], { type: 'image/png' })); });
    vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } });
    URL.createObjectURL = vi.fn(() => 'blob:replay-card');
    URL.revokeObjectURL = vi.fn();
    try {
      await started();
      placeTrade('long', '100', '95', '110', '2');
      for (let i = 0; i < 10; i += 1) nextCandle();
      expect(screen.getByText('Your target was reached: out at 110 USDT.')).toBeInTheDocument();
      const stage = screen.getByRole('region', { name: /^BTCUSDT · 1 hour candles$/ });
      expect(await within(stage).findByRole('img', { name: /^BTCUSDT long, won, \+20 USDT/ })).toBeInTheDocument();
      const made = getContext.mock.calls.length;
      nextCandle();
      nextCandle();
      await act(async () => { await Promise.resolve(); });
      expect(getContext.mock.calls.length).toBe(made);
      expect(within(stage).getByRole('img', { name: /^BTCUSDT long, won, \+20 USDT/ })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('T-057d "Before you trade" on the Replay plan', () => {
  const steps = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist;
  it('the steps ticked while planning stay with the placed trade and are saved with it in one record', async () => {
    const db = await started();
    const list = await screen.findByRole('group', { name: /Before you trade/ });
    fireEvent.click(await within(list).findByRole('checkbox', { name: steps[0]!.label }));
    fireEvent.click(within(list).getByRole('checkbox', { name: steps[2]!.label }));
    placeTrade('long', '100', '95', '110', '2');
    for (let i = 0; i < 10; i += 1) nextCandle();
    expect(screen.getByText('Your target was reached: out at 110 USDT.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save to my practice trades' }));
    expect(await screen.findByText('Saved with your practice trades. It never counts in your Journal.')).toBeInTheDocument();
    const [trade] = await db.trades.toArray();
    expect(await db.tradeDiscipline.toArray()).toEqual([expect.objectContaining({
      tradeId: trade!.id, checklistCompletedAt: trade!.createdAt,
      preTradeChecklist: steps.map((step, index) => ({ itemId: step.id, label: step.label, answer: index === 0 || index === 2 ? 'yes' : 'no' })),
    })]);
    // The next plan starts with nothing ticked.
    fireEvent.click(screen.getByRole('button', { name: 'Place another trade' }));
    const next = await screen.findByRole('group', { name: /Before you trade/ });
    expect((await within(next).findAllByRole('checkbox')).every(box => !(box as HTMLInputElement).checked)).toBe(true);
  });
});
