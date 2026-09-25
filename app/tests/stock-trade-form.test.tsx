import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listJournalHistory } from '../src/application/journal';
import { findGlossaryEntry, readGlossary } from '../src/application/learn/glossary';
import { createEmptyManualTradeDraft, prepareManualTradeSubmission, type ManualTradeDraft } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { STOCK_TICKER_MESSAGES } from '../src/features/journal/StockTradeNote';
import { TradeForm, type TradeFormKind } from '../src/features/journal/TradeForm';

const names: string[] = [];
async function database() { const name = `kairos-stock-form-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = (db: KairosDatabase, kind: TradeFormKind = 'journal') => render(<TradeForm db={db} kind={kind} onSaved={async () => undefined} />);
const stockDraft = (values: Partial<ManualTradeDraft>): ManualTradeDraft => ({ ...createEmptyManualTradeDraft(), marketType: 'stock', side: 'long', status: 'draft', ...values });

function quickLog(symbol = 'aapl', side = 'long', entry = '187.5', exit = '190', quantity = '10'): void {
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  type(/Symbol/, symbol);
  type(/Market/, 'stock');
  type(/Direction/, side);
  type(/Entry price/, entry);
  type(/Exit price/, exit);
  type(/^Quantity/, quantity);
  type(/^Opened/, '2026-09-12T10:00');
  type(/^Closed/, '2026-09-12T11:00');
}
const saveButton = (kind: TradeFormKind = 'journal') => screen.getByRole('button', { name: kind === 'practice' ? 'Save practice trade' : 'Save trade' });

describe('T-044b logging a stock trade', () => {
  it('checks the ticker and never fills in or refuses a currency', () => {
    const aapl = prepareManualTradeSubmission(stockDraft({ symbol: 'aapl' }));
    expect(aapl.ok).toBe(true);
    if (aapl.ok) { expect(aapl.input.symbol).toBe('aapl'); expect(aapl.input).not.toHaveProperty('grossPnlCurrency'); }
    for (const symbol of ['BRK.B', '7203.T', 'vod.l', 'BAJAJ-AUTO.NS', 'M&M.NS']) expect(prepareManualTradeSubmission(stockDraft({ symbol })).ok).toBe(true);
    const yen = prepareManualTradeSubmission(stockDraft({ symbol: '7203.T', priceCurrency: ' jpy ' }));
    expect(yen.ok && yen.input.grossPnlCurrency).toBe(' jpy ');
    const euro = prepareManualTradeSubmission(stockDraft({ symbol: 'AAPL', priceCurrency: 'EUR' }));
    expect(euro.ok && euro.input.grossPnlCurrency).toBe('EUR');
    expect(prepareManualTradeSubmission(stockDraft({ symbol: '' }))).toEqual({ ok: false, type: 'stock-ticker', field: 'symbol', reason: 'ticker-required' });
    for (const symbol of ['NASDAQ:AAPL', 'AAPL US', '$AAPL']) expect(prepareManualTradeSubmission(stockDraft({ symbol }))).toMatchObject({ ok: false, type: 'stock-ticker', reason: 'not-a-ticker' });
    expect(prepareManualTradeSubmission(stockDraft({ marketType: 'crypto', symbol: 'NASDAQ:AAPL' })).ok).toBe(true);
    expect(prepareManualTradeSubmission(stockDraft({ marketType: '', symbol: 'AAPL US' }))).toMatchObject({ ok: false, type: 'draft-incomplete', field: 'marketType' });
  });

  it('saves a quick-logged stock trade in shares with the typed currency', async () => {
    const db = await database();
    mount(db);
    quickLog();
    type('Currency code', 'usd');
    fireEvent.click(saveButton());
    expect((await screen.findByRole('status')).textContent).toBe('Trade saved to your journal.');
    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: 'AAPL', marketType: 'stock', grossPnlCurrency: 'USD', status: 'closed' });
    expect((await db.tradeExecutions.toArray()).map(row => [row.type, row.price, row.quantity]).sort()).toEqual([['entry', '187.5', '10'], ['exit', '190', '10']]);
    expect((await listJournalHistory(db))[0]!.visualPnl).toMatchObject({ outcome: 'profit', amount: '25', currency: 'USD' });
  });

  it('accepts parts of a share', async () => {
    const db = await database();
    mount(db);
    quickLog('aapl', 'long', '187.5', '190', '0.5');
    type('Currency code', 'usd');
    fireEvent.click(saveButton());
    await screen.findByRole('status');
    expect((await db.tradeExecutions.toArray()).map(row => row.quantity)).toEqual(['0.5', '0.5']);
  });

  it('never guesses a currency', async () => {
    const db = await database();
    mount(db);
    quickLog('7203.T', 'short', '2500', '2487.5', '100');
    fireEvent.click(saveButton());
    await screen.findByRole('status');
    const trades = await db.trades.toArray();
    expect(trades[0]!.grossPnlCurrency ?? null).toBeNull();
    expect((await listJournalHistory(db))[0]!.visualPnl).toMatchObject({ outcome: 'profit', amount: '1250', currency: null });
  });

  it('explains tickers, shares and the currency', async () => {
    const { container } = mount({} as KairosDatabase);
    type(/Market/, 'stock');
    expect(screen.getByText(/Stocks: type the ticker, such as AAPL, BRK\.B, 7203\.T or VOD\.L\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'What does "Ticker" mean?' }));
    expect(await within(screen.getByRole('dialog', { name: 'Ticker' })).findByText(/never guesses its currency from it/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Ticker' }), { key: 'Escape' });
    type(/Symbol/, 'aapl');
    expect(screen.getByText(/AAPL: every price is the price of one share, and Quantity is the number of shares\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What does "Share" mean?' })).toBeTruthy();
    type(/Symbol/, 'NASDAQ:AAPL');
    const note = () => container.querySelector('.kairos-trade-form__stock-note') as HTMLElement;
    expect(note().textContent).toContain(STOCK_TICKER_MESSAGES['not-a-ticker']);
    expect(note().textContent).toContain("Kairos never guesses a stock's currency from its ticker");
    type('Currency code', 'gbx');
    expect(within(note()).getByText('Your prices and your result are in GBX. Kairos never converts them.')).toBeTruthy();
    type('Currency code', 'GBp');
    expect(note().textContent).toContain('GBp means pence');
    for (const market of ['crypto', 'forex']) {
      type(/Market/, market);
      expect(container.querySelector('.kairos-trade-form__stock-note')).toBeNull();
    }
  });

  it('shows the shares hint under Quick log\'s Quantity', () => {
    mount({} as KairosDatabase);
    quickLog();
    expect(screen.getByLabelText(/^Quantity/)).toHaveAccessibleDescription('Number of shares, such as 10. Parts of a share, such as 0.5, are fine.');
    type(/Market/, 'crypto');
    expect(screen.getByLabelText(/^Quantity/)).not.toHaveAccessibleDescription();
  });

  it('refuses a symbol that is not a ticker and saves nothing', async () => {
    const db = await database();
    mount(db);
    quickLog('NASDAQ:AAPL');
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe(STOCK_TICKER_MESSAGES['not-a-ticker']);
    expect(screen.getByLabelText(/Symbol/).getAttribute('aria-invalid')).toBe('true');
    expect(await db.trades.count()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    type(/Symbol/, '');
    type(/Direction/, 'long');
    type(/Status/, 'cancelled');
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe('Stocks: type the ticker, such as AAPL, BRK.B, 7203.T or VOD.L.');
    expect(await db.trades.count()).toBe(0);
  });

  it('saves a practice stock trade the same way', async () => {
    const db = await database();
    mount(db, 'practice');
    quickLog();
    type('Currency code', 'usd');
    fireEvent.click(saveButton('practice'));
    await screen.findByRole('status');
    expect((await db.trades.toArray())[0]).toMatchObject({ source: 'paper', marketType: 'stock', grossPnlCurrency: 'USD' });
  });

  it('uses plain words, and adds "Ticker" and "Share" to the trading words', () => {
    const { container } = mount({} as KairosDatabase);
    type(/Market/, 'stock');
    type(/Symbol/, 'AAPL');
    expect(container.textContent).not.toMatch(/\b(fills?|executions?|unexecuted)\b|P&L/i);
    expect(readGlossary().problems).toEqual([]);
    expect(findGlossaryEntry('ticker')?.related.map(term => term.id)).toEqual(['share']);
    expect(findGlossaryEntry('share')?.related.map(term => term.id)).toEqual(['ticker', 'position-size']);
  });
});
