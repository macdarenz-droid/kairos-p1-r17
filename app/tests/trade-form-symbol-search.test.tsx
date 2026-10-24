import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradeForm } from '../src/features/journal/TradeForm';
import { TradeFormMarketContext, type TradeFormMarket } from '../src/features/journal/tradeFormMarket';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-symbol-search-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });

const fact = (baseAsset: string, quoteAsset: string): LiveMarketUniverseInstrumentMetadataFact =>
  ({ instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true }) as LiveMarketUniverseInstrumentMetadataFact;
const listed = [fact('BTC', 'USDT'), fact('ETH', 'USDT'), fact('ETH', 'BTC')];
function market(result: Awaited<ReturnType<TradeFormMarket['marketList']>> = { ok: true, markets: listed }, names?: () => Promise<ReadonlyMap<string, string> | null>) {
  return { marketList: vi.fn(async () => result), ...(names === undefined ? {} : { coinNames: vi.fn(names) }) } satisfies TradeFormMarket;
}
async function mount(provider: TradeFormMarket | null) {
  const db = await database();
  const form = <TradeForm db={db} kind="journal" onSaved={async () => undefined} />;
  const view = render(provider === null ? form : <TradeFormMarketContext.Provider value={provider}>{form}</TradeFormMarketContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  return { db, ...view };
}
const symbol = () => screen.getByRole('combobox', { name: /^Symbol/ });
const currency = () => screen.getByRole('textbox', { name: 'Currency code' });
const results = () => within(screen.getByRole('listbox', { name: 'Search results' })).getAllByRole('option');
const typeSymbol = (value: string) => fireEvent.change(symbol(), { target: { value } });
const FILLED = (from: string, code: string) => `Filled from ${from}: prices are in ${code}. You can change it.`;

describe('T-059a the symbol search on the trade form', () => {
  it('reads the list only once you type, then searches it by keyboard; a choice fills the market and the currency', async () => {
    const provider = market();
    const { container } = await mount(provider);
    expect(provider.marketList).not.toHaveBeenCalled();
    symbol().focus();
    typeSymbol('eth');
    await waitFor(() => expect(results().map(option => option.textContent)).toEqual(['ETHUSDT · ETH/USDT', 'ETHBTC · ETH/BTC']));
    expect(provider.marketList).toHaveBeenCalledTimes(1);
    expect(symbol()).toHaveAttribute('aria-expanded', 'true');
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.keyDown(symbol(), { key: 'ArrowDown' });
    expect(symbol()).toHaveAttribute('aria-activedescendant', results()[1]!.id);
    fireEvent.keyDown(symbol(), { key: 'ArrowUp' });
    fireEvent.keyDown(symbol(), { key: 'Enter' });
    expect(symbol()).toHaveValue('ETHUSDT');
    expect(symbol()).toHaveFocus();
    expect(symbol()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText(/^Market/)).toHaveValue('crypto');
    await waitFor(() => expect(currency()).toHaveValue('USDT'));
    expect(currency()).toHaveAccessibleDescription(expect.stringContaining(FILLED('ETHUSDT', 'USDT')));
    typeSymbol('eth');
    expect(symbol()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(symbol(), { key: 'Escape' });
    expect(symbol()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a currency Kairos filled follows the next listed symbol and goes when the symbol is not listed; one you typed stays', async () => {
    await mount(market());
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'crypto' } });
    typeSymbol('BTCUSDT');
    await waitFor(() => expect(currency()).toHaveValue('USDT'));
    typeSymbol('ETHBTC');
    await waitFor(() => expect(currency()).toHaveValue('BTC'));
    expect(screen.getByText(FILLED('ETHBTC', 'BTC'))).toBeInTheDocument();
    typeSymbol('BTCUSTD');
    await waitFor(() => expect(currency()).toHaveValue(''));
    expect(symbol()).toHaveAccessibleDescription("Binance doesn't list BTCUSTD. Check the spelling, for example BTCUSDT. You can still save.");
    fireEvent.change(currency(), { target: { value: 'USD' } });
    typeSymbol('BTCUSDT');
    await screen.findByRole('option', { name: 'BTCUSDT · BTC/USDT' });
    expect(currency()).toHaveValue('USD');
    expect(screen.queryByText(FILLED('BTCUSDT', 'USDT'))).toBeNull();
  });

  it('offers the listed spelling and never changes what you typed by itself', async () => {
    await mount(market());
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'crypto' } });
    typeSymbol('XBTUSD');
    const use = await screen.findByRole('button', { name: 'Use BTCUSDT' });
    expect(symbol()).toHaveValue('XBTUSD');
    expect(symbol()).toHaveAccessibleDescription('On Binance this market is BTCUSDT. Use BTCUSDT');
    fireEvent.click(use);
    expect(symbol()).toHaveValue('BTCUSDT');
    await waitFor(() => expect(currency()).toHaveValue('USDT'));
  });

  it('says so when the list is unavailable, and saves the filled currency with the trade', async () => {
    await mount(market({ ok: false }));
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'crypto' } });
    typeSymbol('BTCUSDT');
    expect(await screen.findByText("The market list is unavailable, so Kairos can't check the symbol. You can still type it.")).toBeInTheDocument();
    expect(currency()).toHaveValue('');
    cleanup();
    const { db } = await mount(market());
    typeSymbol('btcusdt');
    fireEvent.click(await screen.findByRole('option', { name: 'BTCUSDT · BTC/USDT' }));
    await waitFor(() => expect(currency()).toHaveValue('USDT'));
    fireEvent.change(screen.getByLabelText(/^Direction/), { target: { value: 'long' } });
    for (const [label, value] of [[/Entry price/, '100'], [/Exit price/, '110'], [/^Quantity/, '1'], [/^Opened/, '2026-09-12T10:00'], [/^Closed/, '2026-09-12T11:00']] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(async () => expect(await db.trades.toArray()).toEqual([expect.objectContaining({ symbol: 'BTCUSDT', grossPnlCurrency: 'USDT' })]));
  });

  it('is a plain text field, as before, with no market provider', async () => {
    await mount(null);
    const field = screen.getByRole('textbox', { name: /^Symbol/ });
    expect(field).toHaveAttribute('placeholder', 'BTCUSD');
    fireEvent.change(field, { target: { value: 'eth' } });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(within(field.parentElement!).queryByRole('combobox')).toBeNull();
  });

  it('T-059b finds a coin by its name, with CoinGecko credited, only when the names are there', async () => {
    await mount(market(undefined, async () => new Map([['BTC', 'Bitcoin'], ['ETH', 'Ethereum']])));
    typeSymbol('bitcoin');
    await waitFor(() => expect(results().map(option => option.textContent)).toEqual(['BTCUSDT · Bitcoin']));
    expect(screen.getByText('Coin names: CoinGecko')).toBeInTheDocument();
    fireEvent.keyDown(symbol(), { key: 'Enter' });
    expect(symbol()).toHaveValue('BTCUSDT');
    cleanup();
    await mount(market());
    typeSymbol('eth');
    await waitFor(() => expect(results()).toHaveLength(2));
    expect(screen.queryByText('Coin names: CoinGecko')).toBeNull();
  });

  it('review r1: the list never waits for coin names; the names join it when they arrive', async () => {
    let answer: (names: ReadonlyMap<string, string> | null) => void = () => undefined;
    await mount(market(undefined, () => new Promise(resolve => { answer = resolve; })));
    typeSymbol('btcusdt');
    await waitFor(() => expect(results().map(option => option.textContent)).toEqual(['BTCUSDT · BTC/USDT']));
    expect(screen.queryByText('Coin names: CoinGecko')).toBeNull();
    await act(async () => { answer(new Map([['BTC', 'Bitcoin']])); });
    await waitFor(() => expect(results().map(option => option.textContent)).toEqual(['BTCUSDT · Bitcoin']));
    expect(screen.getByText('Coin names: CoinGecko')).toBeInTheDocument();
  });

  it('review r1: "Use BTCUSDT" leaves focus on Symbol, never on the page', async () => {
    await mount(market());
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'crypto' } });
    typeSymbol('XBTUSD');
    const use = await screen.findByRole('button', { name: 'Use BTCUSDT' });
    use.focus();
    fireEvent.click(use);
    expect(screen.queryByRole('button', { name: 'Use BTCUSDT' })).toBeNull();
    expect(symbol()).toHaveFocus();
  });

  it('review r1: a currency you clear stays yours: Kairos does not fill it again', async () => {
    await mount(market());
    typeSymbol('eth');
    await waitFor(() => expect(results()).toHaveLength(2));
    fireEvent.click(results()[0]!);
    await waitFor(() => expect(currency()).toHaveValue('USDT'));
    fireEvent.change(currency(), { target: { value: '' } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(currency()).toHaveValue('');
    fireEvent.change(currency(), { target: { value: 'USD' } });
    expect(currency()).toHaveValue('USD');
  });

  it('review r1: the row the arrows reach is brought into view', async () => {
    const scrolled = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled(this.id); };
    try {
      await mount(market());
      typeSymbol('eth');
      await waitFor(() => expect(results()).toHaveLength(2));
      fireEvent.keyDown(symbol(), { key: 'ArrowDown' });
      expect(scrolled).toHaveBeenLastCalledWith(results()[1]!.id);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
