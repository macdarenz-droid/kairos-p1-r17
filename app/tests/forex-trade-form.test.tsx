import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listJournalHistory } from '../src/application/journal';
import { findGlossaryEntry, readGlossary } from '../src/application/learn/glossary';
import { createEmptyManualTradeDraft, prepareManualTradeSubmission, type ManualTradeDraft } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradeForm, type TradeFormKind } from '../src/features/journal/TradeForm';

const names: string[] = [];
async function database() { const name = `kairos-forex-form-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = (db: KairosDatabase, kind: TradeFormKind = 'journal') => render(<TradeForm db={db} kind={kind} onSaved={async () => undefined} />);

function quickLog(symbol = 'EUR/USD', market = 'forex', quantity = '10000'): void {
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  type(/Symbol/, symbol);
  type(/Market/, market);
  type(/Direction/, 'long');
  type(/Entry price/, '1.085');
  type(/Exit price/, '1.09');
  type(/^Quantity/, quantity);
  type(/^Opened/, '2026-09-12T10:00');
  type(/^Closed/, '2026-09-12T11:00');
}
const forexDraft = (values: Partial<ManualTradeDraft>): ManualTradeDraft => ({ ...createEmptyManualTradeDraft(), marketType: 'forex', side: 'long', status: 'draft', ...values });

describe('T-043b logging a forex trade', () => {
  it('checks the pair and fills or checks the price currency only for a known quote', () => {
    const plain = prepareManualTradeSubmission(forexDraft({ symbol: 'eur/usd' }));
    expect(plain.ok && plain.input).toMatchObject({ grossPnlCurrency: 'USD', symbol: 'eur/usd' });
    const spaced = prepareManualTradeSubmission(forexDraft({ symbol: 'EURUSD', priceCurrency: ' usd ' }));
    expect(spaced.ok && spaced.input.grossPnlCurrency).toBe('USD');
    const other = prepareManualTradeSubmission(forexDraft({ symbol: 'EURUSD', priceCurrency: 'EUR' }));
    expect(other).toMatchObject({ ok: false, type: 'forex-price-currency', field: 'grossPnlCurrency', reason: 'not-the-quote-currency' });
    expect(!other.ok && other.type === 'forex-price-currency' && other.pair.label).toBe('EUR/USD');
    expect(prepareManualTradeSubmission(forexDraft({ symbol: 'EURUSDT' }))).toEqual({ ok: false, type: 'forex-pair', field: 'symbol', reason: 'not-a-pair' });
    expect(prepareManualTradeSubmission(forexDraft({ symbol: 'EUREUR' }))).toMatchObject({ ok: false, reason: 'same-currency' });
    expect(prepareManualTradeSubmission(forexDraft({ symbol: '' }))).toMatchObject({ ok: false, reason: 'not-a-pair' });
    const gold = prepareManualTradeSubmission(forexDraft({ symbol: 'XAUUSD' }));
    expect(gold.ok && gold.input.grossPnlCurrency).toBe('USD');
    for (const symbol of ['SILVER', 'USDTRY']) {
      const unknown = prepareManualTradeSubmission(forexDraft({ symbol }));
      expect(unknown.ok).toBe(true);
      if (unknown.ok) expect(unknown.input).not.toHaveProperty('grossPnlCurrency');
    }
    const typed = prepareManualTradeSubmission(forexDraft({ symbol: 'SILVER', priceCurrency: 'USD' }));
    expect(typed.ok && typed.input.grossPnlCurrency).toBe('USD');
    const crypto = prepareManualTradeSubmission(forexDraft({ marketType: 'crypto', symbol: 'BTCUSDT' }));
    expect(crypto.ok).toBe(true);
    if (crypto.ok) expect(crypto.input).not.toHaveProperty('grossPnlCurrency');
    expect(prepareManualTradeSubmission(forexDraft({ marketType: '', symbol: 'EURUSD' }))).toMatchObject({ ok: false, type: 'draft-incomplete', field: 'marketType' });
  });

  it('saves a quick-logged forex trade in units, with the quote currency', async () => {
    const db = await database();
    mount(db);
    quickLog();
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect((await screen.findByRole('status')).textContent).toBe('Trade saved to your journal.');
    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: 'EUR/USD', marketType: 'forex', grossPnlCurrency: 'USD', status: 'closed' });
    expect((await db.tradeExecutions.toArray()).map(row => [row.type, row.price, row.quantity]).sort()).toEqual([['entry', '1.085', '10000'], ['exit', '1.09', '10000']]);
    expect((await listJournalHistory(db))[0]!.visualPnl).toMatchObject({ outcome: 'profit', amount: '50', currency: 'USD' });
  });

  it('explains the pair under the symbol', async () => {
    const db = {} as KairosDatabase;
    const { container } = mount(db);
    type(/Market/, 'forex');
    expect(screen.getByText('Forex: type the currency pair, such as EURUSD or EUR/USD.')).toBeTruthy();
    type(/Symbol/, 'EUR/USD');
    expect(screen.getByText(/EUR\/USD: the price is how many USD one EUR costs\./)).toBeTruthy();
    expect(screen.getByText(/Sizes are in units of EUR, not lots/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'What does "Lot" mean?' }));
    expect(await within(screen.getByRole('dialog', { name: 'Lot' })).findByText(/Kairos saves your size in units/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Lot' }), { key: 'Escape' });
    type(/Symbol/, 'XAUUSD');
    expect(screen.getByText('Kairos knows pips and lots for the 28 usual pairs of EUR, GBP, AUD, NZD, USD, CAD, CHF and JPY only, so it shows none for XAU/USD. Sizes are in units of XAU.')).toBeTruthy();
    type(/Symbol/, 'EURUSDT');
    expect(within(container.querySelector('.kairos-trade-form__forex-note') as HTMLElement).getByText('Type the currency pair as 6 letters, such as EURUSD or EUR/USD.')).toBeTruthy();
    type(/Market/, 'crypto');
    expect(container.querySelector('.kairos-trade-form__forex-note')).toBeNull();
  });

  it('shows the size in lots under Quick log\'s Quantity', () => {
    mount({} as KairosDatabase);
    quickLog();
    const quantity = () => screen.getByLabelText(/^Quantity/);
    expect(quantity()).toHaveAccessibleDescription('10000 units is 0.1 lots.');
    type(/^Quantity/, '100000');
    expect(quantity()).toHaveAccessibleDescription('100000 units is 1 lot.');
    type(/^Quantity/, '0.5');
    expect(quantity()).toHaveAccessibleDescription(/less than a micro lot \(1,000 units\)/);
    type(/^Quantity/, '');
    expect(quantity()).toHaveAccessibleDescription('Units of EUR, not lots: 1 lot is 100,000 units.');
    type(/Market/, 'crypto');
    expect(quantity()).not.toHaveAccessibleDescription();
  });

  it('refuses another currency or a symbol that is not a pair, and saves nothing', async () => {
    const db = await database();
    mount(db);
    quickLog();
    type('Currency code', 'EUR');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    const message = 'Prices of EUR/USD are in USD. Enter USD as the currency code, or leave it empty.';
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    const currency = screen.getByLabelText('Currency code');
    expect(currency.getAttribute('aria-invalid')).toBe('true');
    expect(currency).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(await db.trades.count()).toBe(0);

    type('Currency code', '');
    type(/Symbol/, 'EURUSDT');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Type the currency pair as 6 letters, such as EURUSD or EUR/USD.');
    expect(screen.getByLabelText(/Symbol/).getAttribute('aria-invalid')).toBe('true');
    expect(await db.trades.count()).toBe(0);
  });

  it('saves a practice forex trade the same way', async () => {
    const db = await database();
    mount(db, 'practice');
    quickLog();
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    await screen.findByRole('status');
    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ source: 'paper', grossPnlCurrency: 'USD' });
  });

  it('uses plain words, and adds "Pip" and "Lot" to the trading words', () => {
    const { container } = mount({} as KairosDatabase);
    type(/Market/, 'forex');
    type(/Symbol/, 'EURUSD');
    expect(container.textContent).not.toMatch(/\b(fills?|executions?|unexecuted)\b|P&L/i);
    expect(readGlossary().problems).toEqual([]);
    expect(findGlossaryEntry('pip')?.related.map(term => term.id)).toEqual(['lot', 'position-size']);
    expect(findGlossaryEntry('lot')).not.toBeNull();
  });
});
