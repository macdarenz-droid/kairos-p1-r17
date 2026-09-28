import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { listJournalHistory } from '../src/application/journal';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradeForm, TRADE_FORM_MODE_STORAGE_KEY, type TradeFormKind } from '../src/features/journal/TradeForm';

const names: string[] = [];
async function database() { const name = `kairos-quick-log-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = (db: KairosDatabase, kind: TradeFormKind = 'journal', now?: () => Date) => render(<TradeForm db={db} kind={kind} onSaved={async () => undefined} now={now} />);
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

function quickLog(side: 'long' | 'short', entry = '100'): void {
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  type(/Symbol/, 'BTCUSDT');
  type(/Market/, 'crypto');
  type(/Direction/, side);
  type(/Entry price/, entry);
  type(/Exit price/, '120');
  type(/^Quantity/, '2');
  type(/^Opened/, '2026-09-12T10:00');
  type(/^Closed/, '2026-09-12T11:00');
}

describe('quick log on the trade form', () => {
  it('saves a closed long trade with one entry and one exit, and resets the fields', async () => {
    const db = await database();
    mount(db);
    quickLog('long');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect((await screen.findByRole('status')).textContent).toBe('Trade saved to your journal.');
    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ status: 'closed', source: 'manual' });
    expect(trades[0].grossPnlCurrency ?? null).toBeNull();
    const executions = (await db.tradeExecutions.toArray()).map(row => [row.type, row.price, row.quantity]).sort();
    expect(executions).toEqual([['entry', '100', '2'], ['exit', '120', '2']]);
    expect(await db.tradeFees.count()).toBe(0);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: '40', resultLabel: 'Profit', currency: null });
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('');
    expect(screen.getByLabelText(/Entry price/)).toHaveValue('');
    expect(screen.getByLabelText(/^Opened/)).toHaveValue('');
    expect(pressed('Quick log')).toBe('true');
  });

  it('gives a short trade a loss when the price rises', async () => {
    const db = await database();
    mount(db);
    quickLog('short');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await screen.findByRole('status');
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: '-40', resultLabel: 'Loss' });
  });

  it('saves a practice trade that stays out of the journal', async () => {
    const db = await database();
    mount(db, 'practice');
    quickLog('long');
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    await screen.findByRole('status');
    const trades = await db.trades.toArray();
    expect(trades.map(trade => trade.source)).toEqual(['paper']);
    expect(await db.tradeExecutions.count()).toBe(2);
    expect(await listJournalHistory(db)).toEqual([]);
  });

  it('names the missing quick field and writes nothing', async () => {
    const db = await database();
    mount(db);
    quickLog('long', '');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter the entry price as a number above 0, such as 64000.5.');
    expect(screen.getByLabelText(/Entry price/)).toHaveAttribute('aria-invalid', 'true');
    expect(await db.trades.count()).toBe(0);

    type(/Entry price/, '100');
    type(/Market/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Choose a market.'));
    expect(screen.getByLabelText(/Market/)).toHaveAttribute('aria-invalid', 'true');
    expect(await db.trades.count()).toBe(0);
  });

  it('fills the closed time from the device clock with "Now"', async () => {
    const db = await database();
    mount(db, 'journal', () => new Date(2026, 8, 12, 11, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set closed time to now' }));
    expect(screen.getByLabelText(/^Closed/)).toHaveValue('2026-09-12T11:05');
  });

  it('keeps typed values when switching modes', async () => {
    const db = await database();
    mount(db);
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    type(/Symbol/, 'ETHUSDT');
    type(/Entry price/, '2500');
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    expect(pressed('All details')).toBe('true');
    expect(screen.getByLabelText(/^Status/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Entry price/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('ETHUSDT');
    expect(screen.getByLabelText(/Entry price/)).toHaveValue('2500');
  });

  it('opens in the remembered mode, and in All details when storage cannot be read', async () => {
    const db = await database();
    localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, 'quick');
    const first = mount(db);
    expect(pressed('Quick log')).toBe('true');
    expect(screen.getByLabelText(/Entry price/)).toBeInTheDocument();
    first.unmount();

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    mount(db);
    expect(pressed('All details')).toBe('true');
    expect(screen.getByLabelText(/^Status/)).toBeInTheDocument();
  });
});
