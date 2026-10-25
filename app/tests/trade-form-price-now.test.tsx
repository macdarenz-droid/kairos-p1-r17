import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceNowResult } from '../src/application/market-reference/priceNow';
import type { DecimalString } from '../src/domain/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { TradeForm } from '../src/features/journal/TradeForm';
import { TradeFormMarketContext, type TradeFormMarket } from '../src/features/journal/tradeFormMarket';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
afterEach(async () => { cleanup(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });

const FILLED: PriceNowResult = { ok: true, price: '65000.5' as DecimalString, at: '2026-10-24T10:32:00.000Z', source: 'binance', market: 'BTCUSDT', midPrice: false, futures: false, quote: 'USDT' };
const OFFLINE: PriceNowResult = { ok: false, why: 'offline', retryAfterSeconds: null, note: null, source: { provider: 'binance' } };
function provider(...results: PriceNowResult[]) {
  const queue = [...results];
  return { marketList: vi.fn(async () => ({ ok: true as const, markets: [] })), priceNow: vi.fn(async () => queue.shift() ?? FILLED) } satisfies TradeFormMarket;
}
async function mount(market: TradeFormMarket, mode: 'Quick log' | 'All details' = 'Quick log') {
  const name = `kairos-price-now-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db);
  const view = render(<TradeFormMarketContext.Provider value={market}><TradeForm db={db} kind="journal" onSaved={async () => undefined} /></TradeFormMarketContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: mode }));
  fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'crypto' } });
  fireEvent.change(screen.getByRole('combobox', { name: /^Symbol/ }), { target: { value: 'BTCUSDT' } });
  return view;
}
const entry = () => screen.getByLabelText(/^Entry price/);
const source = /^Binance · BTCUSDT · \d\d:\d\d$/;

describe('T-059c "Price now" beside the prices', () => {
  it('fills the price only on a tap, says where it came from, and forgets the source once you type', async () => {
    const market = provider();
    const { container } = await mount(market);
    const button = screen.getByRole('button', { name: 'Price now for the entry price' });
    expect(screen.getByRole('button', { name: 'Price now for the exit price' })).toBeInTheDocument();
    expect(market.priceNow).not.toHaveBeenCalled();
    expect(entry()).toHaveValue('');
    button.focus();
    await act(async () => { fireEvent.click(button); });
    expect(market.priceNow).toHaveBeenCalledWith({ marketType: 'crypto', symbol: 'BTCUSDT' }, expect.any(AbortSignal));
    expect(entry()).toHaveValue('65000.5');
    expect(entry()).toHaveAccessibleDescription(source);
    expect(button).toHaveFocus();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.change(entry(), { target: { value: '65001' } });
    expect(screen.queryByText(source)).toBeNull();
    expect(screen.getByLabelText(/^Exit price/)).toHaveValue('');
  });

  it('says why when it fails, moves focus to "Try again", and back to "Price now" once it works', async () => {
    await mount(provider(OFFLINE, FILLED));
    const button = screen.getByRole('button', { name: 'Price now for the entry price' });
    button.focus();
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByText(/^Price now: you're offline/)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(entry()).toHaveValue('');
    await act(async () => { fireEvent.click(retry); });
    expect(entry()).toHaveValue('65000.5');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('offers no "Price now" for stocks, and one beside each entry and exit in All details', async () => {
    await mount(provider(), 'All details');
    fireEvent.change(screen.getByLabelText(/^Status/), { target: { value: 'closed' } });
    fireEvent.click(screen.getByRole('button', { name: /Add entry/ }));
    expect(await screen.findByRole('button', { name: 'Price now for entry 1' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'stock' } });
    expect(screen.queryByRole('button', { name: /^Price now/ })).toBeNull();
  });

  it('review r1: during a retry "Try again" stays, busy, and keeps focus; an answer without "Try again" moves focus to "Price now"', async () => {
    const answers: ((result: PriceNowResult) => void)[] = [];
    const market = { marketList: vi.fn(async () => ({ ok: true as const, markets: [] })), priceNow: vi.fn(() => new Promise<PriceNowResult>(resolve => { answers.push(resolve); })) } satisfies TradeFormMarket;
    await mount(market);
    const button = screen.getByRole('button', { name: 'Price now for the entry price' });
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveFocus();
    await act(async () => { answers[0]!(OFFLINE); });
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toHaveFocus());
    fireEvent.click(retry);
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry).toHaveFocus();
    await act(async () => { answers[1]!({ ok: false, why: 'not-set-up', retryAfterSeconds: null, note: null, source: { provider: 'binance' } }); });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('review r1: offers no "Price now" for options or other markets', async () => {
    await mount(provider());
    for (const [marketType, symbol] of [['options', 'AAPL240119C00150000'], ['other', 'GOLDCOIN']]) {
      fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: marketType } });
      fireEvent.change(screen.getByRole('combobox', { name: /^Symbol/ }), { target: { value: symbol } });
      expect(screen.queryByRole('button', { name: /^Price now/ }), marketType).toBeNull();
    }
  });
});
