import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listJournalHistory, type JournalHistoryEntry } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, updateTradeExecution, type UpdateTradeExecutionInput } from '../src/application/trades';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, type KairosDatabase } from '../src/data/database';

let db: KairosDatabase;
const openedAt = '2026-09-12T04:00:00.000Z';
const closedAt = '2026-09-12T05:00:00.000Z';
const editedAt = '2026-09-13T08:00:00.000Z';
const now = () => editedAt;
afterEach(async () => { vi.restoreAllMocks(); if (db) { db.close(); await db.delete(); } });

const closedTrade = (symbol = 'BTCUSDT') => ({
  symbol, marketType: 'crypto' as const, side: 'long' as const, status: 'closed' as const, openedAt, closedAt, grossPnlCurrency: 'USDT',
  plan: { plannedEntryPrice: '99', plannedStopPrice: '90', plannedTargetPrice: '125', plannedQuantity: '2' },
  executions: [{ type: 'entry' as const, price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit' as const, price: '120', quantity: '2', executedAt: closedAt }],
  fees: [{ amount: '0.5', currency: 'USDT' }],
});

async function start(): Promise<JournalHistoryEntry> {
  db = createKairosDatabase('trade-execution-update-' + crypto.randomUUID()); await db.open();
  expect((await saveManualTrade(db, closedTrade(), { now: () => closedAt })).ok).toBe(true);
  return (await listJournalHistory(db))[0];
}
async function facts() {
  return { trades: await db.trades.toArray(), plans: await db.tradePlans.toArray(), executions: await db.tradeExecutions.toArray(), fees: await db.tradeFees.toArray() };
}
const exitOf = (entry: JournalHistoryEntry) => entry.executions.find(row => row.type === 'exit')!;
const entryOf = (entry: JournalHistoryEntry) => entry.executions.find(row => row.type === 'entry')!;
const correctExit = (entry: JournalHistoryEntry, change: Partial<{ price: string; quantity: string; executedAt: string }>): UpdateTradeExecutionInput => {
  const exit = exitOf(entry);
  return { expected: entry, execution: { id: exit.id, price: exit.price, quantity: exit.quantity, executedAt: exit.executedAt, ...change } };
};

describe('updateTradeExecution', () => {
  it('corrects an exit price in place and the result follows', async () => {
    const expected = await start(); const before = await facts();
    const result = await updateTradeExecution(db, correctExit(expected, { price: '130' }), { now });
    expect(result).toEqual({ ok: true, tradeId: expected.trade.id, updated: { executions: 1, fees: 0 } });
    const after = await facts();
    const beforeExit = before.executions.find(row => row.type === 'exit')!;
    expect(after.executions.find(row => row.id === beforeExit.id)).toEqual({ ...beforeExit, price: '130' });
    expect(after.executions.find(row => row.type === 'entry')).toEqual(before.executions.find(row => row.type === 'entry'));
    expect(after.fees).toEqual(before.fees);
    expect(after.plans).toEqual(before.plans);
    expect(after.trades).toEqual([{ ...before.trades[0], updatedAt: editedAt }]);
    const [reloaded] = await listJournalHistory(db);
    expect(reloaded.metrics).toMatchObject({ grossPnl: '60', netPnl: '59.5' });
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('corrects a fee amount and normalises its currency, keeping its ids', async () => {
    const expected = await start(); const [beforeFee] = (await facts()).fees;
    const result = await updateTradeExecution(db, { expected, fee: { id: beforeFee.id, amount: '0.7', currency: 'usdt' } }, { now });
    expect(result).toMatchObject({ ok: true, updated: { executions: 0, fees: 1 } });
    const [afterFee] = (await facts()).fees;
    expect(afterFee).toEqual({ ...beforeFee, amount: '0.7', currency: 'USDT' });
    expect((await listJournalHistory(db))[0].metrics).toMatchObject({ netPnl: '39.3' });
  });

  it('leaves the result unavailable when entries and exits no longer match', async () => {
    const expected = await start();
    expect((await updateTradeExecution(db, correctExit(expected, { quantity: '1' }), { now })).ok).toBe(true);
    const [reloaded] = await listJournalHistory(db);
    expect(reloaded.metrics?.grossPnl ?? null).toBeNull();
    expect(reloaded.visualPnl.label).toBe('Not available');
  });

  it('rolls back every store when one write fails, and a retry succeeds', async () => {
    const expected = await start(); const before = await facts();
    const input: UpdateTradeExecutionInput = { ...correctExit(expected, { price: '130' }), fee: { id: expected.fees[0].id, amount: '0.7', currency: 'USDT' } };
    const spy = vi.spyOn(db.tradeFees, 'put').mockRejectedValue(new Error('quota'));
    expect(await updateTradeExecution(db, input, { now })).toEqual({ ok: false, type: 'storage-error', reason: 'trade-save-failed' });
    expect(await facts()).toEqual(before);
    spy.mockRestore();
    expect(await updateTradeExecution(db, input, { now })).toMatchObject({ ok: true, updated: { executions: 1, fees: 1 } });
  });

  it('names the field for each invalid value and writes nothing', async () => {
    const expected = await start(); const before = await facts();
    const fee = expected.fees[0];
    const cases: [UpdateTradeExecutionInput, string, string][] = [
      [correctExit(expected, { price: '0' }), 'execution.price', 'must-be-positive'],
      [correctExit(expected, { price: '-1' }), 'execution.price', 'must-be-positive'],
      [correctExit(expected, { price: 'abc' }), 'execution.price', 'must-be-positive'],
      [correctExit(expected, { quantity: '0' }), 'execution.quantity', 'must-be-positive'],
      [correctExit(expected, { executedAt: '' }), 'execution.executedAt', 'timestamp-required'],
      [{ expected, fee: { id: fee.id, amount: '0.5', currency: '  ' } }, 'fee.currency', 'currency-required'],
      [{ expected, fee: { id: fee.id, amount: '0', currency: 'USDT' } }, 'fee.amount', 'must-be-positive'],
      [correctExit(expected, {}), 'trade', 'no-change'],
      [{ expected }, 'trade', 'no-change'],
    ];
    for (const [input, field, reason] of cases) {
      expect(await updateTradeExecution(db, input, { now })).toEqual({ ok: false, type: 'validation-error', field, reason });
    }
    expect(await facts()).toEqual(before);
  });

  it('refuses stale forms, foreign rows, practice trades by default and deleted trades', async () => {
    const expected = await start();
    expect((await updateTradeExecution(db, correctExit(expected, { price: '130' }), { now })).ok).toBe(true);
    expect(await updateTradeExecution(db, correctExit(expected, { price: '140' }), { now })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });

    expect((await saveManualTrade(db, closedTrade('ETHUSDT'))).ok).toBe(true);
    const history = await listJournalHistory(db);
    const current = history.find(entry => entry.trade.symbol === 'BTCUSDT')!;
    const other = history.find(entry => entry.trade.symbol === 'ETHUSDT')!;
    const foreign = entryOf(other);
    expect(await updateTradeExecution(db, { expected: current, execution: { id: foreign.id, price: '1', quantity: '1', executedAt: openedAt } }, { now }))
      .toEqual({ ok: false, type: 'update-conflict', reason: 'row-not-found' });

    expect((await savePracticeTrade(db, closedTrade('SOLUSDT'))).ok).toBe(true);
    const [practice] = await listJournalHistory(db, { scope: 'practice' });
    expect(await updateTradeExecution(db, correctExit(practice, { price: '125' }), { now })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-editable' });
    expect(await updateTradeExecution(db, { ...correctExit(practice, { price: '125' }), allowedSources: ['paper'] }, { now })).toMatchObject({ ok: true });

    await db.transaction('rw', [db.trades, db.tradePlans, db.tradeExecutions, db.tradeFees], async () => {
      await db.trades.delete(other.trade.id);
      await db.tradePlans.where('tradeId').equals(other.trade.id).delete();
      await db.tradeExecutions.where('tradeId').equals(other.trade.id).delete();
      await db.tradeFees.where('tradeId').equals(other.trade.id).delete();
    });
    expect(await updateTradeExecution(db, correctExit(other, { price: '125' }), { now })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-editable' });
  });

  it('applies only one of two identical edits made at the same time', async () => {
    const expected = await start();
    const input = correctExit(expected, { price: '130' });
    const results = await Promise.all([updateTradeExecution(db, input, { now }), updateTradeExecution(db, input, { now })]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.find(result => !result.ok)).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
  });
});
