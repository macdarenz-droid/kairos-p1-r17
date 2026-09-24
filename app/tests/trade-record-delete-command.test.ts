import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSavedAnalysis } from '../src/app/savedAnalysisContract';
import { savePracticeTrade } from '../src/application/practice';
import { deleteTradeRecord, saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p30-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-18T17:00:00.000Z';
function ids() { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `p30-id-${++index}` as T; }
const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const full = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', plan: { plannedEntryPrice: '100', plannedQuantity: '1' }, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [{ amount: '0.5', currency: 'USDT' }] } as const);

const counts = async (db: Awaited<ReturnType<typeof database>>) => ({ trades: await db.trades.count(), plans: await db.tradePlans.count(), executions: await db.tradeExecutions.count(), fees: await db.tradeFees.count(), analyses: await db.savedAnalyses.count() });

describe('P30.1 trade record delete command', () => {
  it('removes exactly one trade with its plans, executions and fees in one atomic write and nothing else', async () => {
    const db = await database('delete');
    const createId = ids();
    const keep = await saveManualTrade(db, full('BTCUSDT'), { now, createId });
    const gone = await savePracticeTrade(db, full('ETHUSDT'), { now, createId });
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-1', market: eth, drawings: [], riskRewards: [] }));
    if (!keep.ok || !gone.ok) throw new Error('fixture');
    expect(await counts(db)).toEqual({ trades: 2, plans: 2, executions: 4, fees: 2, analyses: 1 });
    const result = await deleteTradeRecord(db, gone.tradeId);
    expect(result).toEqual({ ok: true, tradeId: gone.tradeId, source: 'paper', removed: { plans: 1, executions: 2, fees: 1 } });
    expect(await counts(db)).toEqual({ trades: 1, plans: 1, executions: 2, fees: 1, analyses: 1 });
    expect((await db.trades.toArray()).map(trade => trade.id)).toEqual([keep.tradeId]);
    expect((await db.tradePlans.toArray()).every(plan => plan.tradeId === keep.tradeId)).toBe(true);
    expect((await db.tradeExecutions.toArray()).every(execution => execution.tradeId === keep.tradeId)).toBe(true);
    expect((await db.tradeFees.toArray()).every(fee => fee.tradeId === keep.tradeId)).toBe(true);
  });

  it('reports a missing trade explicitly and writes nothing', async () => {
    const db = await database('missing');
    const saved = await saveManualTrade(db, full('BTCUSDT'), { now, createId: ids() });
    if (!saved.ok) throw new Error('fixture');
    const before = await counts(db);
    expect(await deleteTradeRecord(db, 'p30-id-none' as TradeId)).toEqual({ ok: false, type: 'not-found', reason: 'trade-not-found' });
    expect(await counts(db)).toEqual(before);
  });

  it('reports a storage failure explicitly and leaves the trade in place', async () => {
    const db = await database('storage');
    const saved = await saveManualTrade(db, full('BTCUSDT'), { now, createId: ids() });
    if (!saved.ok) throw new Error('fixture');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await deleteTradeRecord(db, saved.tradeId)).toEqual({ ok: false, type: 'storage-error', reason: 'trade-delete-failed' });
    vi.restoreAllMocks();
    expect(await counts(db)).toEqual({ trades: 1, plans: 1, executions: 2, fees: 1, analyses: 0 });
  });
});
