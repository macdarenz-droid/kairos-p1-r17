import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getJournalHistoryEntry } from '../src/application/journal';
import { addTradeContractSize, openDraftTrade, saveManualTrade, tradeRevision, updateTradeExecution, type SavedTradeSnapshot } from '../src/application/trades';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString, TradeExecutionId, TradeExecutionRecord, TradeFeeId, TradeFeeRecord, TradeId, TradePlanId, TradePlanRecord, TradeRecord } from '../src/domain/trades';

const tradeId = 'revision-trade' as TradeId;
const at = '2026-09-20T10:00:00.000Z';
const trade: TradeRecord = {
  id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT',
  openedAt: '2026-09-20T09:00:00.000Z', closedAt: '2026-09-20T09:45:00.000Z', createdAt: at, updatedAt: at,
};
const plan = (id: string, change: Partial<TradePlanRecord> = {}): TradePlanRecord => ({
  id: id as TradePlanId, tradeId, plannedEntryPrice: '100' as DecimalString, plannedStopPrice: '95' as DecimalString,
  plannedTargetPrice: '110' as DecimalString, plannedQuantity: '1' as DecimalString, createdAt: at, updatedAt: at, ...change,
});
const entry: TradeExecutionRecord = { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: '100' as DecimalString, quantity: '1' as DecimalString, executedAt: '2026-09-20T09:00:00.000Z', createdAt: at };
const exit: TradeExecutionRecord = { ...entry, id: 'e2' as TradeExecutionId, type: 'exit', price: '108' as DecimalString, executedAt: '2026-09-20T09:45:00.000Z' };
const fee: TradeFeeRecord = { id: 'f1' as TradeFeeId, tradeId, executionId: null, amount: '0.5' as DecimalString, currency: 'USDT', createdAt: at };
const snapshot = (change: Partial<SavedTradeSnapshot> = {}): SavedTradeSnapshot => ({
  trade, executions: [entry, exit], fees: [fee], plans: [plan('p1')], ...change,
});

describe('tradeRevision (what a form saw, so a stale form is caught)', () => {
  it('gives the same text for the same snapshot, whatever the order of its rows', () => {
    expect(tradeRevision(snapshot())).toBe(tradeRevision(snapshot()));
    const plans = [plan('p1'), plan('p2', { plannedStopPrice: '97' as DecimalString, updatedAt: '2026-09-20T10:05:00.000Z' })];
    expect(tradeRevision(snapshot({ plans }))).toBe(tradeRevision(snapshot({ plans: [...plans].reverse() })));
    expect(tradeRevision(snapshot())).toBe(tradeRevision(snapshot({ executions: [exit, entry] })));
  });

  it.each([
    ['stop', { plannedStopPrice: '97' as DecimalString }],
    ['entry', { plannedEntryPrice: '101' as DecimalString }],
    ['target', { plannedTargetPrice: '120' as DecimalString }],
    ['quantity', { plannedQuantity: '2' as DecimalString }],
    ['target removed', { plannedTargetPrice: null }],
    ['"Why I\'m taking it" added', { reason: 'Clean break' }],
    ['saved time', { updatedAt: '2026-09-20T10:05:00.000Z' }],
  ] satisfies [string, Partial<TradePlanRecord>][])('changes when a plan row\'s %s changes', (_name, change) => {
    expect(tradeRevision(snapshot({ plans: [plan('p1', change)] }))).not.toBe(tradeRevision(snapshot()));
  });

  it('changes when "Why I\'m taking it" changes or is removed', () => {
    const withReason = tradeRevision(snapshot({ plans: [plan('p1', { reason: 'Clean break' })] }));
    expect(tradeRevision(snapshot({ plans: [plan('p1', { reason: 'Chasing' })] }))).not.toBe(withReason);
    expect(tradeRevision(snapshot({ plans: [plan('p1', { reason: null })] }))).not.toBe(withReason);
  });

  it('changes when a plan version is added or taken away', () => {
    const one = tradeRevision(snapshot());
    const two = tradeRevision(snapshot({ plans: [plan('p1'), plan('p2', { plannedStopPrice: '97' as DecimalString })] }));
    expect(two).not.toBe(one);
    // A new version that says the same as the old one is still a new row.
    expect(tradeRevision(snapshot({ plans: [plan('p1'), plan('p2')] }))).not.toBe(one);
    expect(tradeRevision(snapshot({ plans: [] }))).not.toBe(one);
  });

  it('changes when the trade note changes, is added or is removed', () => {
    const none = tradeRevision(snapshot());
    const noted = tradeRevision(snapshot({ trade: { ...trade, note: 'Moved my stop' } }));
    expect(noted).not.toBe(none);
    expect(tradeRevision(snapshot({ trade: { ...trade, note: 'Held to the plan' } }))).not.toBe(noted);
    expect(tradeRevision(snapshot({ trade: { ...trade, note: 'Moved my stop' } }))).toBe(noted);
    const { note: _removed, ...withoutNote } = { ...trade, note: 'Moved my stop' };
    expect(tradeRevision(snapshot({ trade: withoutNote }))).toBe(none);
  });

  it('still changes with the trade header, the entries, exits and fees', () => {
    const base = tradeRevision(snapshot());
    const changed: SavedTradeSnapshot[] = [
      snapshot({ trade: { ...trade, symbol: 'ETHUSDT' } }),
      snapshot({ trade: { ...trade, updatedAt: '2026-09-20T10:05:00.000Z' } }),
      snapshot({ trade: { ...trade, exchange: 'Kraken' } }),
      snapshot({ trade: { ...trade, tags: ['swing'] } }),
      snapshot({ executions: [entry, { ...exit, price: '109' as DecimalString }] }),
      snapshot({ executions: [entry] }),
      snapshot({ fees: [{ ...fee, amount: '0.8' as DecimalString }] }),
      snapshot({ fees: [] }),
    ];
    for (const next of changed) expect(tradeRevision(next)).not.toBe(base);
    expect(new Set(changed.map(tradeRevision)).size).toBe(changed.length);
  });
});

// A form opened before another tab edited only the plan, at the same moment: the trade header and its rows are the same
// text, so only the plan versions can tell the form is stale.
describe('commands refuse a form that missed a plan version', () => {
  let db: KairosDatabase;
  afterEach(async () => { if (db) { db.close(); await db.delete(); } });

  const savedAt = '2026-09-20T10:00:00.000Z';
  const opened = '2026-09-20T09:00:00.000Z';
  const closed = '2026-09-20T09:45:00.000Z';
  const plannedInput = { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '1' };

  async function start(input: Parameters<typeof saveManualTrade>[1]) {
    db = createKairosDatabase('trade-revision-' + crypto.randomUUID());
    await db.open();
    const saved = await saveManualTrade(db, input, { now: () => savedAt });
    if (!saved.ok) throw new Error('fixture: ' + JSON.stringify(saved));
    const form = (await getJournalHistoryEntry(db, saved.tradeId))!;
    // The other tab saves a new plan version at the same moment: no timestamp on the trade moves.
    const original = form.plans[0]!;
    await db.tradePlans.put({ ...original, id: 'plan-from-the-other-tab' as TradePlanId, plannedStopPrice: '97' as DecimalString });
    return { form, tradeId: saved.tradeId };
  }
  const closedTrade = {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, plan: plannedInput,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: opened }, { type: 'exit', price: '108', quantity: '1', executedAt: closed }],
  } as const;

  it('updateTradeExecution refuses a correction made on the old form, and writes nothing', async () => {
    const { form } = await start(closedTrade);
    const exitRow = form.executions.find(row => row.type === 'exit')!;
    const before = await db.tradeExecutions.toArray();
    const result = await updateTradeExecution(db, { expected: form, execution: { id: exitRow.id, price: '109', quantity: exitRow.quantity, executedAt: exitRow.executedAt } }, { now: () => savedAt });
    expect(result).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect(await db.tradeExecutions.toArray()).toEqual(before);
  });

  it('updateTradeExecution applies a correction made on a form that has the new plan version', async () => {
    const { tradeId: id } = await start(closedTrade);
    const fresh = (await getJournalHistoryEntry(db, id))!;
    expect(fresh.plans).toHaveLength(2);
    const exitRow = fresh.executions.find(row => row.type === 'exit')!;
    const result = await updateTradeExecution(db, { expected: fresh, execution: { id: exitRow.id, price: '109', quantity: exitRow.quantity, executedAt: exitRow.executedAt } }, { now: () => savedAt });
    expect(result).toMatchObject({ ok: true });
  });

  it('a snapshot that carries no plans is checked on the rest only, so the old callers go on working', async () => {
    const { form } = await start(closedTrade);
    const exitRow = form.executions.find(row => row.type === 'exit')!;
    const result = await updateTradeExecution(db, { expected: { trade: form.trade, executions: form.executions, fees: form.fees }, execution: { id: exitRow.id, price: '109', quantity: exitRow.quantity, executedAt: exitRow.executedAt } }, { now: () => savedAt });
    expect(result).toMatchObject({ ok: true });
  });

  it('openDraftTrade refuses the old form of a draft', async () => {
    const { form } = await start({ symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', plan: plannedInput });
    const result = await openDraftTrade(db, { expected: form, openedAt: opened, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: opened }], fees: [] }, { now: () => savedAt });
    expect(result).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect((await db.trades.toArray())[0]!.status).toBe('draft');
  });

  it('addTradeContractSize refuses the old form of a futures trade', async () => {
    const { form } = await start({ ...closedTrade, marketType: 'futures', symbol: 'ESZ6', grossPnlCurrency: 'USD' });
    const result = await addTradeContractSize(db, { expected: form, contractSize: '50' }, () => savedAt);
    expect(result).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect((await db.trades.toArray())[0]!.contractSize ?? null).toBeNull();
  });
});
