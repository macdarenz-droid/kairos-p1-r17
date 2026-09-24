import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { prepareManualTradeExecutionDetails } from '../src/application/trades/manualTradeExecutionDraft';

let db: KairosDatabase;
afterEach(async () => { cleanup(); vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });
async function start(side = 'long') {
  db = createKairosDatabase('execution-form-' + crypto.randomUUID()); await db.open();
  render(<JournalRoute db={db}/>);
  for (const [label, value] of [['Symbol', 'BTCUSDT'], ['Market', 'crypto'], ['Direction', side], ['Status', 'closed'], ['Opened', '2026-09-12T10:00'], ['Closed', '2026-09-12T11:00']]) {
    fireEvent.change(screen.getByLabelText(new RegExp('^' + label), { selector: 'input,select' }), { target: { value } });
  }
}
function fill(type: 'entry' | 'exit', index: number, price: string, quantity: string) {
  fireEvent.click(screen.getByRole('button', { name: `Add ${type}` }));
  const title = `${type === 'entry' ? 'Entry' : 'Exit'} ${index}`;
  fireEvent.change(screen.getByLabelText(`${title} price`), { target: { value: price } });
  fireEvent.change(screen.getByLabelText(`${title} quantity`), { target: { value: quantity } });
  fireEvent.change(screen.getByLabelText(`${title} date and time`), { target: { value: `2026-09-12T${type === 'entry' ? '10' : '11'}:00` } });
}
async function save() { fireEvent.click(screen.getByRole('button', { name: 'Save trade' })); await screen.findByText('Trade saved to your journal.'); }

describe('Journal actual execution entry integration', () => {
  it.each([['long', '40', 'Profit'], ['short', '-40', 'Loss']])('saves %s executions through the real form and exposes exact released results after reopening storage', async (side, amount, resultLabel) => {
    await start(side); fill('entry', 1, '100', '2'); fill('exit', 2, '120', '2'); await save();
    expect(await db.tradeExecutions.count()).toBe(2);
    expect(screen.queryByLabelText('Entry 1 price')).toBeNull();
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('');
    db.close(); await db.open();
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount, resultLabel, currency: null });
  });
  it('retains each partial exit and delegates the weighted result to P11', async () => {
    await start(); fill('entry', 1, '100', '2'); fill('exit', 2, '110', '0.5'); fill('exit', 3, '120', '1.5'); await save();
    expect(await db.tradeExecutions.count()).toBe(3);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: '35', resultLabel: 'Profit' });
  });
  it('does not report a fully realized result when exit quantity is incomplete', async () => {
    await start(); fill('entry', 1, '100', '2'); fill('exit', 2, '120', '1'); await save();
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: null, resultLabel: 'Not available' });
  });
  it('preserves invalid input and commits no aggregate until the save command validates it', async () => {
    await start(); fill('entry', 1, '100', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('positive execution price or quantity');
    expect(screen.getByLabelText('Entry 1 quantity')).toHaveValue('0');
    expect(screen.getByLabelText('Entry 1 quantity')).toHaveAttribute('aria-invalid', 'true');
    expect(await db.trades.count()).toBe(0); expect(await db.tradeExecutions.count()).toBe(0);
  });
  it('preserves entered rows on an incompatible status and requires explicit removal', async () => {
    await start(); fill('entry', 1, '100', '2');
    fireEvent.change(screen.getByLabelText(/Status/, { selector: 'select' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose Open or Closed');
    expect(screen.getByLabelText('Entry 1 price')).toHaveValue('100'); expect(await db.trades.count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' })); await save();
    expect(await db.tradeExecutions.count()).toBe(0);
  });
  it('persists explicit fees without inventing a missing result currency', async () => {
    await start(); fill('entry', 1, '100', '2'); fill('exit', 2, '120', '2');
    fireEvent.click(screen.getByText('Fees · Optional'));
    fireEvent.click(screen.getByRole('button', { name: 'Add fee' }));
    fireEvent.change(screen.getByLabelText('Fee 1 amount'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Fee 1 currency'), { target: { value: ' usdt ' } }); await save();
    expect(await db.tradeFees.toArray()).toEqual([expect.objectContaining({ amount: '0.5', currency: 'USDT' })]);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: null, currency: null, resultLabel: 'Not available' });
  });
  it('rolls back the whole save on storage failure and keeps all form facts for retry', async () => {
    await start(); fill('entry', 1, '100', '2'); fill('exit', 2, '120', '2');
    const failure = vi.spyOn(db.tradeExecutions, 'put').mockRejectedValue(new Error('storage failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your form has been kept');
    expect(screen.getByLabelText('Exit 2 price')).toHaveValue('120');
    await waitFor(async () => expect(await db.trades.count()).toBe(0));
    failure.mockRestore(); await save(); expect(await db.trades.count()).toBe(1);
  });
  it('normalizes explicit timestamp offsets and keeps decimal strings unchanged for command validation', () => {
    const result = prepareManualTradeExecutionDetails({ symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-12T14:00:00+10:00' }, [{ key: 'only-ui', type: 'entry', price: '0.000000001234500', quantity: ' 2.500 ', executedAt: '2026-09-12T14:00:00+10:00' }], []);
    expect(result).toMatchObject({ ok: true, input: { openedAt: '2026-09-12T04:00:00.000Z', executions: [{ type: 'entry', price: '0.000000001234500', quantity: ' 2.500 ', executedAt: '2026-09-12T04:00:00.000Z' }] } });
    if (result.ok) expect(result.input.executions![0]).not.toHaveProperty('key');
  });
});
