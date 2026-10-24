import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listJournalHistory } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { openDraftTrade, saveManualTrade, type DraftTradeSnapshot } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p31-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
function ids() { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `p31-id-${++index}` as T; }
const savedAt = '2026-09-18T08:00:00.000Z';
const openedAt = '2026-09-18T09:00:00.000Z';
const now = () => '2026-09-18T09:05:00.000Z';
const draftInput = { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', plan: { plannedEntryPrice: '100', plannedStopPrice: '90', plannedTargetPrice: '130', plannedQuantity: '2' } } as const;
const entry = { type: 'entry', price: '101', quantity: '2', executedAt: openedAt } as const;
async function snapshot(db: Awaited<ReturnType<typeof database>>, id: TradeId): Promise<DraftTradeSnapshot> {
  const trade = (await db.trades.get(id))!;
  return { trade, executions: await db.tradeExecutions.where('tradeId').equals(id).toArray(), fees: await db.tradeFees.where('tradeId').equals(id).toArray() };
}

describe('P31.1 draft trade activation command', () => {
  it('moves one saved manual draft to open with its opened moment, first fill, fee and currency, keeping id and plan', async () => {
    const db = await database('open');
    const createId = ids();
    const saved = await saveManualTrade(db, draftInput, { now: () => savedAt, createId });
    if (!saved.ok) throw new Error('fixture');
    const before = await snapshot(db, saved.tradeId);
    const plans = await db.tradePlans.toArray();
    const result = await openDraftTrade(db, { expected: before, openedAt, grossPnlCurrency: 'usdt', executions: [entry], fees: [{ amount: '0.2', currency: 'usdt' }] }, { now, createId });
    expect(result).toEqual({ ok: true, tradeId: saved.tradeId, persisted: { plans: 0, executions: 1, fees: 1 } });
    expect(await db.trades.get(saved.tradeId)).toEqual({ ...before.trade, status: 'open', openedAt, closedAt: null, grossPnlCurrency: 'USDT', updatedAt: now() });
    expect(await db.tradePlans.toArray()).toEqual(plans);
    expect((await db.tradeExecutions.toArray()).map(e => [e.tradeId, e.type, e.price])).toEqual([[saved.tradeId, 'entry', '101']]);
    expect((await db.tradeFees.toArray()).map(f => [f.tradeId, f.amount, f.currency])).toEqual([[saved.tradeId, '0.2', 'USDT']]);
    expect((await listJournalHistory(db, { status: 'open' })).map(e => e.trade.id)).toEqual([saved.tradeId]);
  });

  it('refuses a non-draft, a practice trade, an invalid opened moment and a stale snapshot without writing', async () => {
    const db = await database('refuse');
    const createId = ids();
    const open = await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt }, { now: () => savedAt, createId });
    const paper = await savePracticeTrade(db, draftInput, { now: () => savedAt, createId });
    const draft = await saveManualTrade(db, draftInput, { now: () => savedAt, createId });
    if (!open.ok || !paper.ok || !draft.ok) throw new Error('fixture');
    expect(await openDraftTrade(db, { expected: await snapshot(db, open.tradeId), openedAt, executions: [], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' });
    expect(await openDraftTrade(db, { expected: await snapshot(db, paper.tradeId), openedAt, executions: [], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' });
    expect(await openDraftTrade(db, { expected: await snapshot(db, draft.tradeId), openedAt: '', executions: [], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'validation-error', field: 'trade', reason: 'open-requires-opened-at' });
    expect(await openDraftTrade(db, { expected: await snapshot(db, draft.tradeId), openedAt, executions: [{ ...entry, price: '-1' }], fees: [] }, { now, createId })).toMatchObject({ ok: false, type: 'validation-error', field: 'executions.0.price' });
    const stale = await snapshot(db, draft.tradeId);
    await db.trades.update(draft.tradeId, { updatedAt: '2026-09-18T08:30:00.000Z' });
    expect(await openDraftTrade(db, { expected: stale, openedAt, executions: [], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect((await db.trades.get(draft.tradeId))?.status).toBe('draft');
    expect((await db.trades.get(paper.tradeId))?.status).toBe('draft');
    expect(await db.tradeExecutions.count()).toBe(0);
  });

  it('reports a storage failure explicitly and leaves the draft untouched', async () => {
    const db = await database('storage');
    const createId = ids();
    const draft = await saveManualTrade(db, draftInput, { now: () => savedAt, createId });
    if (!draft.ok) throw new Error('fixture');
    const expected = await snapshot(db, draft.tradeId);
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await openDraftTrade(db, { expected, openedAt, executions: [entry], fees: [] }, { now, createId })).toEqual({ ok: false, type: 'storage-error', reason: 'trade-save-failed' });
    vi.restoreAllMocks();
    expect(await db.trades.get(draft.tradeId)).toEqual(expected.trade);
  });
});
