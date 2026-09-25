import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcbReferenceRatesPort } from '../src/application/currency/ecbRates';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadResultsInHomeCurrency } from '../src/application/currency/resultsInHomeCurrency';
import { listJournalClosedTradesInPeriod, listJournalVisualPnlDailySummary } from '../src/application/journal';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString, TradeId } from '../src/domain/trades';
import type { EcbReferenceRate } from '../src/services/exchange-rates/ecbReferenceRates';
import { CurrencyScreen } from '../src/features/currency/CurrencyScreen';

const NOW = '2026-09-26T10:00:00.000Z';
const now = () => NOW;
const openedAt = '2026-09-18T09:00:00.000Z';
const closedAt = '2026-09-18T10:00:00.000Z';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-currency-missing-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}

function trade(symbol: string, marketType: SaveManualTradeInput['marketType'], side: 'long' | 'short', currency: string, quantity: string, entry: string, exit: string, closed = closedAt): SaveManualTradeInput {
  const open = closed === closedAt ? openedAt : new Date(Date.parse(closed) - 3_600_000).toISOString();
  return {
    symbol, marketType, side, status: 'closed', openedAt: open, closedAt: closed, grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: entry, quantity, executedAt: open }, { type: 'exit', price: exit, quantity, executedAt: closed }],
    fees: [],
  } as SaveManualTradeInput;
}
const PENCE = trade('VOD.L', 'stock', 'long', 'GBX', '1000', '70', '75');
const DOLLAR = trade('AAPL', 'stock', 'long', 'USD', '10', '187.5', '190');
const YEN = trade('7203.T', 'stock', 'short', 'JPY', '100', '2500', '2487.5');
const COIN = trade('BTCUSDT', 'crypto', 'long', 'USDT', '1', '100', '112.5');

async function save(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  return saved.tradeId;
}
async function fourTradesInEuro(db: KairosDatabase) {
  const ids = { pence: await save(db, PENCE), dollar: await save(db, DOLLAR), yen: await save(db, YEN), coin: await save(db, COIN) };
  expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
  return ids;
}
const published = (currency: string, day: string, rate: string): EcbReferenceRate => ({ currency, day, rate: rate as DecimalString });
const RATES_18 = [published('GBP', '2026-09-18', '0.8588'), published('JPY', '2026-09-18', '180.94'), published('USD', '2026-09-18', '1.146'), published('USD', '2026-09-19', '1.15')];
function port(...answers: Awaited<ReturnType<EcbReferenceRatesPort['acquireRates']>>[]) {
  const acquireRates = vi.fn<EcbReferenceRatesPort['acquireRates']>();
  for (const answer of answers) acquireRates.mockResolvedValueOnce(answer);
  return { acquireRates };
}
const renderScreen = (db: KairosDatabase, rates: EcbReferenceRatesPort) => render(<CurrencyScreen db={db} rates={rates} now={now} />);
const missingRegion = () => screen.findByRole('region', { name: 'Rates you still need' });
const rowTexts = (region: HTMLElement) => within(region).queryAllByRole('listitem').map(item => item.querySelector('p')?.textContent);

describe('T-045g the rates you still need', () => {
  it('lists each missing pair and day, and says when the bank has no rate', async () => {
    const db = await database();
    await fourTradesInEuro(db);
    renderScreen(db, port());
    const region = await missingRegion();
    await waitFor(() => expect(rowTexts(region)).toEqual([
      'GBP to EUR · 18 September 2026 · 1 trade',
      'JPY to EUR · 18 September 2026 · 1 trade',
      'USD to EUR · 18 September 2026 · 1 trade',
      'USDT to EUR · 18 September 2026 · 1 trade',
    ]));
    expect(within(region).getByText('4 rates are missing. Kairos needs one for each currency and each day a trade closed.')).toBeInTheDocument();
    const note = within(region).getAllByText('The European Central Bank publishes no rate for USDT, so type yours.');
    expect(note).toHaveLength(1);
    expect(within(region).getAllByRole('listitem')[3]).toContainElement(note[0]!);
    const accessible = [
      ...within(region).getAllByRole('textbox').map(input => (input as HTMLInputElement).labels?.[0]?.textContent ?? ''),
      ...within(region).getAllByRole('button', { name: /^Save rate/ }).map(button => button.getAttribute('aria-label') ?? ''),
    ];
    expect(accessible).toHaveLength(8);
    expect(new Set(accessible).size).toBe(8);
  });

  it('gets the bank rates on a tap, once, and focuses the heading', async () => {
    const db = await database();
    await fourTradesInEuro(db);
    const fake = port({ ok: true, rates: RATES_18 });
    renderScreen(db, fake);
    const region = await missingRegion();
    fireEvent.click(await within(region).findByRole('button', { name: 'Get rates from the European Central Bank' }));
    expect(await within(region).findByText('Saved 3 rates from the European Central Bank.')).toBeInTheDocument();
    expect(within(region).getByRole('status')).toHaveTextContent('Saved 3 rates from the European Central Bank.');
    expect(fake.acquireRates).toHaveBeenCalledTimes(1);
    expect(fake.acquireRates.mock.calls[0]![0]).toEqual({ currencies: ['GBP', 'JPY', 'USD'], fromDay: '2026-09-14', toDay: '2026-09-26' });
    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Rates you still need' })).toHaveFocus());
    expect(rowTexts(region)).toEqual(['USDT to EUR · 18 September 2026 · 1 trade']);
    expect(within(region).getByText('1 rate is missing. Kairos needs one for each currency and each day a trade closed.')).toBeInTheDocument();
    const saved = screen.getByRole('region', { name: 'Your saved rates' });
    for (const line of ['18 September 2026: 1 EUR = 0.8588 GBP, from the European Central Bank.', '18 September 2026: 1 EUR = 180.94 JPY, from the European Central Bank.', '18 September 2026: 1 EUR = 1.146 USD, from the European Central Bank.']) {
      expect(within(saved).getByText(line)).toBeInTheDocument();
    }
  });

  it('says when the bank cannot be reached, saves nothing, and tries again', async () => {
    const db = await database();
    await fourTradesInEuro(db);
    const fake = port({ ok: false, reason: 'transport-failed' }, { ok: true, rates: RATES_18 });
    renderScreen(db, fake);
    const region = await missingRegion();
    fireEvent.click(await within(region).findByRole('button', { name: 'Get rates from the European Central Bank' }));
    expect(await within(region).findByRole('alert')).toHaveTextContent('Exchange rates are unavailable right now. Check your connection, then try again.');
    expect(await db.exchangeRates.count()).toBe(0);
    fireEvent.click(await within(region).findByRole('button', { name: 'Try again' }));
    expect(await within(region).findByText('Saved 3 rates from the European Central Bank.')).toBeInTheDocument();
    expect(within(region).queryByRole('alert')).toBeNull();
    expect(await db.exchangeRates.count()).toBe(3);
  });

  it('names a day the bank has not published yet, and keeps its row', async () => {
    const db = await database();
    await save(db, trade('MSFT', 'stock', 'long', 'USD', '1', '400', '410', '2026-09-26T08:00:00.000Z'));
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    renderScreen(db, port({ ok: true, rates: [published('USD', '2026-09-24', '1.14'), published('USD', '2026-09-25', '1.145')] }));
    const region = await missingRegion();
    fireEvent.click(await within(region).findByRole('button', { name: 'Get rates from the European Central Bank' }));
    expect(await within(region).findByText(/^No European Central Bank rate for 26 September 2026 yet\./)).toBeInTheDocument();
    expect(within(region).getByRole('status')).toHaveTextContent('No European Central Bank rate for 26 September 2026 yet.');
    await waitFor(() => expect(rowTexts(region)).toEqual(['USD to EUR · 26 September 2026 · 1 trade']));
  });

  it('saves a typed rate offline, and refuses one that is not a number', async () => {
    const db = await database();
    await fourTradesInEuro(db);
    const fake = port();
    renderScreen(db, fake);
    const region = await missingRegion();
    const input = await within(region).findByLabelText('1 JPY in EUR on 18 September 2026');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Save rate for JPY to EUR, 18 September 2026' }));
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(within(region).getByText('Use a number above 0, such as 1.146 or 0.0055, with at most 12 digits before and after the point.')).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(await db.exchangeRates.count()).toBe(0);
    fireEvent.change(input, { target: { value: '0.0055' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Save rate for JPY to EUR, 18 September 2026' }));
    expect(await within(region).findByRole('status')).toHaveTextContent('Saved your rate: 1 JPY = 0.0055 EUR for 18 September 2026.');
    await waitFor(() => expect(rowTexts(region)).not.toContain('JPY to EUR · 18 September 2026 · 1 trade'));
    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Rates you still need' })).toHaveFocus());
    const daily = await listJournalVisualPnlDailySummary(db, 'UTC');
    expect(daily.inHomeCurrency.missing.map(m => m.from)).not.toContain('JPY');
    expect(fake.acquireRates).not.toHaveBeenCalled();
  });

  it('changes a rate the trader typed, replacing only that row', async () => {
    const db = await database();
    const ids = await fourTradesInEuro(db);
    renderScreen(db, port());
    const region = await missingRegion();
    fireEvent.change(await within(region).findByLabelText('1 JPY in EUR on 18 September 2026'), { target: { value: '180.94' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Save rate for JPY to EUR, 18 September 2026' }));
    expect(await within(region).findByText('Saved your rate: 1 JPY = 180.94 EUR for 18 September 2026.')).toBeInTheDocument();
    const saved = screen.getByRole('region', { name: 'Your saved rates' });
    const change = await within(saved).findByLabelText('1 JPY in EUR on 18 September 2026');
    expect(change).toHaveValue('180.94');
    fireEvent.change(change, { target: { value: '0.0055' } });
    fireEvent.click(within(saved).getByRole('button', { name: 'Change rate for JPY to EUR, 18 September 2026' }));
    expect(await within(saved).findByRole('status')).toHaveTextContent('Saved your rate: 1 JPY = 0.0055 EUR for 18 September 2026.');
    expect(within(region).queryByText(/1 JPY = 180\.94 EUR/)).toBeNull();
    const rows = (await db.exchangeRates.toArray()).filter(row => row.source === 'typed' && row.from === 'JPY');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rate).toBe('0.0055');
    const period = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null });
    if (!period.ok) throw new Error(period.reason);
    const result = await loadResultsInHomeCurrency(db, period.entries);
    expect(result.byTrade[ids.yen]).toMatchObject({ kind: 'converted', amount: '6.88' });
  });

  it('says nothing is missing once every rate is saved, with no bank button', async () => {
    const db = await database();
    await fourTradesInEuro(db);
    const fake = port({ ok: true, rates: RATES_18 });
    renderScreen(db, fake);
    const region = await missingRegion();
    fireEvent.click(await within(region).findByRole('button', { name: 'Get rates from the European Central Bank' }));
    const coin = await within(region).findByLabelText('1 USDT in EUR on 18 September 2026');
    await within(region).findByText('Saved 3 rates from the European Central Bank.');
    fireEvent.change(coin, { target: { value: '0.87' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Save rate for USDT to EUR, 18 September 2026' }));
    expect(await within(region).findByText('No rates missing: every trade with a result and a currency counts in EUR.')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: /European Central Bank|Try again/ })).toBeNull();
  });

  it('shows no missing rates card without a home currency', async () => {
    const db = await database();
    await save(db, YEN);
    renderScreen(db, port());
    await screen.findByRole('combobox', { name: 'Show my totals in' });
    expect(screen.queryByRole('region', { name: 'Rates you still need' })).toBeNull();
  });
});
