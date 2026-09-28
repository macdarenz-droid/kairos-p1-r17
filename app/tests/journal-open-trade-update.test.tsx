import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import { saveManualTrade } from '../src/application/trades';
import { updateOpenManualTrade, type UpdateOpenManualTradeInput } from '../src/application/trades/updateOpenManualTrade';
import { listJournalHistory } from '../src/application/journal';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { JournalRoute } from '../src/app/JournalRoute';
import type { TradeExecutionId } from '../src/domain/trades';

let db: KairosDatabase;
const openedAt = '2026-09-12T04:00:00.000Z';
const closedAt = '2026-09-12T05:00:00.000Z';
afterEach(async () => { cleanup(); vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });
async function start() {
  db = createKairosDatabase('open-update-' + crypto.randomUUID()); await db.open();
  expect((await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt,
    plan: { plannedEntryPrice: '99', plannedStopPrice: '90', plannedTargetPrice: '125', plannedQuantity: '2' },
    executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }],
  }, { now: () => openedAt })).ok).toBe(true);
  return (await listJournalHistory(db))[0];
}
const exit = (quantity = '2') => ({ type: 'exit' as const, price: '120', quantity, executedAt: closedAt });
async function facts() { return { trades: await db.trades.toArray(), plans: await db.tradePlans.toArray(), executions: await db.tradeExecutions.toArray(), fees: await db.tradeFees.toArray() }; }

describe('existing open manual trade updates', () => {
  it('closes the same trade, retains original IDs/plan/entry exactly, and refreshes released results after reload', async () => {
    const expected = await start(); const before = await facts();
    expect(await updateOpenManualTrade(db, { expected, status: 'closed', closedAt, executions: [exit()], fees: [] })).toMatchObject({ ok: true, tradeId: expected.trade.id });
    db.close(); await db.open(); const after = await facts();
    expect(after.trades).toEqual([{ ...before.trades[0], status: 'closed', closedAt, updatedAt: expect.any(String) }]);
    expect(after.plans).toEqual(before.plans);
    expect(after.executions.find(e => e.id === before.executions[0].id)).toEqual(before.executions[0]);
    expect(after.executions).toHaveLength(2);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: '40', currency: null, resultLabel: 'Profit' });
  });
  it('keeps a partial exit open and later closes it with the remaining exit without replacing any fill', async () => {
    let expected = await start();
    expect((await updateOpenManualTrade(db, { expected, status: 'open', closedAt: null, executions: [exit('0.5')], fees: [] })).ok).toBe(true);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ status: 'open', amount: null });
    expected = (await listJournalHistory(db))[0];
    expect((await updateOpenManualTrade(db, { expected, status: 'closed', closedAt, executions: [exit('1.5')], fees: [] })).ok).toBe(true);
    expect(await db.trades.count()).toBe(1); expect(await db.tradeExecutions.count()).toBe(3);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: '40' });
  });
  it('rejects a stale or duplicate open update even if updatedAt is the same millisecond', async () => {
    const expected = await start();
    const input: UpdateOpenManualTradeInput = { expected, status: 'open', closedAt: null, executions: [exit('0.5')], fees: [] };
    const results = await Promise.all([updateOpenManualTrade(db, input, { now: () => openedAt }), updateOpenManualTrade(db, input, { now: () => openedAt })]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)).toMatchObject({ type: 'update-conflict', reason: 'trade-changed' });
    expect(await db.tradeExecutions.count()).toBe(2);
  });
  it('rolls back header and new rows together if a later fee write fails, then succeeds once on retry', async () => {
    const expected = await start(); const before = await facts();
    const input: UpdateOpenManualTradeInput = { expected, status: 'closed', closedAt, executions: [exit()], fees: [{ amount: '0.5', currency: 'USDT' }] };
    const failure = vi.spyOn(db.tradeFees, 'put').mockRejectedValue(new Error('quota'));
    expect(await updateOpenManualTrade(db, input)).toMatchObject({ ok: false, type: 'storage-error' });
    expect(await facts()).toEqual(before); failure.mockRestore();
    expect((await updateOpenManualTrade(db, input)).ok).toBe(true);
    expect(await db.tradeExecutions.count()).toBe(2); expect(await db.tradeFees.count()).toBe(1);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ amount: null, currency: null });
  });
  it.each(['missing', 'closed', 'import'])('does not change a %s trade', async state => {
    const expected = await start();
    if (state === 'missing') await db.trades.delete(expected.trade.id);
    else await db.trades.put({ ...expected.trade, ...(state === 'closed' ? { status: 'closed' as const, closedAt } : { source: 'import' as const }) });
    const before = await facts();
    expect(await updateOpenManualTrade(db, { expected, status: 'closed', closedAt, executions: [exit()], fees: [] })).toMatchObject({ ok: false, type: 'update-conflict' });
    expect(await facts()).toEqual(before);
  });
  it('never overwrites a saved execution if an allocated ID collides', async () => {
    const expected = await start(); const before = await facts();
    expect(await updateOpenManualTrade(db, { expected, status: 'closed', closedAt, executions: [exit()], fees: [] }, { createId: <T,>() => expected.executions[0].id as unknown as T })).toMatchObject({ ok: false, reason: 'identity-conflict' });
    expect(await facts()).toEqual(before);
  });
  it('preserves existing linked fees and exact decimal strings while appending new entries and fees', async () => {
    let expected = await start();
    await db.tradeFees.put({ id: 'linked-fee' as never, tradeId: expected.trade.id, executionId: expected.executions[0].id as TradeExecutionId, amount: '0.1' as never, currency: 'USDT', createdAt: openedAt });
    expected = (await listJournalHistory(db))[0]; const fee = expected.fees[0];
    expect((await updateOpenManualTrade(db, { expected, status: 'open', closedAt: null, executions: [{ type: 'entry', price: '0.000000001234500', quantity: '0.125', executedAt: closedAt }], fees: [{ amount: '0.25', currency: 'usdt' }] })).ok).toBe(true);
    expect(await db.tradeFees.get(fee.id)).toEqual(fee);
    expect((await db.tradeExecutions.toArray()).find(e => e.id !== expected.executions[0].id)).toMatchObject({ price: '0.000000001234500', quantity: '0.125' });
  });
  it('rejects invalid new quantities and closing time without changing storage', async () => {
    const expected = await start(); const before = await facts();
    for (const input of [
      { expected, status: 'closed' as const, closedAt, executions: [exit('0')], fees: [] },
      { expected, status: 'closed' as const, closedAt: '2026-09-11T04:00:00Z', executions: [exit()], fees: [] },
    ]) expect(await updateOpenManualTrade(db, input)).toMatchObject({ ok: false, type: 'validation-error' });
    expect(await facts()).toEqual(before);
  });
  it('does not invent a realized result when the user closes with incomplete fills', async () => {
    const expected = await start();
    expect((await updateOpenManualTrade(db, { expected, status: 'closed', closedAt, executions: [], fees: [] })).ok).toBe(true);
    expect((await loadHomeYourTrades(db))[0]).toMatchObject({ status: 'closed', amount: null, resultLabel: 'Not available' });
  });
});

describe('open trade update Journal UI', () => {
  async function open() { await start(); render(<JournalRoute db={db}/>); fireEvent.click(await screen.findByRole('button', { name: 'Update trade' })); return within(screen.getByRole('region', { name: 'Update BTCUSDT' })); }
  function fill(ui: ReturnType<typeof within>, quantity = '2') {
    fireEvent.click(ui.getByRole('button', { name: 'Add exit' }));
    for (const [name, value] of [['price', '120'], ['quantity', quantity], ['date and time', '2026-09-12T15:00']]) fireEvent.change(ui.getByLabelText(`Exit 1 ${name}`), { target: { value } });
    fireEvent.change(ui.getByLabelText('Trade status'), { target: { value: 'closed' } });
    fireEvent.change(ui.getByLabelText('Closed date & time'), { target: { value: '2026-09-12T15:00' } });
  }
  it('preserves invalid input and focuses the error, then saves onto the original trade', async () => {
    const ui = await open(); fill(ui, '0');
    fireEvent.click(ui.getByRole('button', { name: 'Save update' }));
    const alert = await screen.findByRole('alert'); await waitFor(() => expect(alert).toHaveFocus());
    expect(ui.getByLabelText('Exit 1 quantity')).toHaveValue('0'); expect(await db.tradeExecutions.count()).toBe(1);
    fireEvent.change(ui.getByLabelText('Exit 1 quantity'), { target: { value: '2' } });
    fireEvent.click(ui.getByRole('button', { name: 'Save update' }));
    await screen.findByText('Trade updated. Your saved details are below.');
    expect(await db.trades.count()).toBe(1); expect(await db.tradeExecutions.count()).toBe(2);
    expect(screen.queryByRole('button', { name: 'Update trade' })).toBeNull();
  });
  it('requires explicit discard for unsaved additions and never writes on Cancel', async () => {
    const ui = await open(); const before = await facts(); fill(ui);
    fireEvent.click(ui.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(ui.getByRole('button', { name: 'Keep editing' })); expect(ui.getByLabelText('Exit 1 price')).toHaveValue('120');
    fireEvent.click(ui.getByRole('button', { name: 'Cancel' })); fireEvent.click(ui.getByRole('button', { name: 'Discard additions' }));
    expect(screen.queryByRole('region', { name: 'Update BTCUSDT' })).toBeNull(); expect(await facts()).toEqual(before);
  });
  it('keeps the update form after a storage error and retries without duplication', async () => {
    const ui = await open(); fill(ui); const before = await facts();
    const failure = vi.spyOn(db.tradeExecutions, 'put').mockRejectedValue(new Error('quota'));
    fireEvent.click(ui.getByRole('button', { name: 'Save update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('kept so you can retry'); expect(await facts()).toEqual(before);
    failure.mockRestore(); fireEvent.click(ui.getByRole('button', { name: 'Save update' }));
    await screen.findByText('Trade updated. Your saved details are below.'); expect(await db.tradeExecutions.count()).toBe(2);
  });
});
