import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p29-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-18T16:30:00.000Z';
function ids() { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `p29-id-${++index}` as T; }
const input = { symbol: ' ethusdt ', marketType: 'crypto', side: 'short', status: 'closed', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', grossPnlCurrency: 'usdt', plan: { plannedEntryPrice: '2500', plannedQuantity: '1' }, executions: [{ type: 'entry', price: '2500', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '2450', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [{ amount: '1.5', currency: 'usdt' }] } as const;

describe('P29.1 practice trade save command', () => {
  it('records one practice trade aggregate atomically with source paper and the released P10 normalisation', async () => {
    const db = await database('save');
    const result = await savePracticeTrade(db, input, { now, createId: ids() });
    expect(result).toEqual({ ok: true, tradeId: 'p29-id-1', source: 'paper', persisted: { plans: 1, executions: 2, fees: 1 } });
    const trade = await db.trades.get('p29-id-1' as TradeId);
    expect(trade).toEqual({ id: 'p29-id-1', symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'closed', source: 'paper', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', createdAt: now(), updatedAt: now() });
    expect((await db.tradePlans.toArray()).map(plan => plan.tradeId)).toEqual(['p29-id-1']);
    expect((await db.tradeExecutions.toArray()).map(execution => execution.type)).toEqual(['entry', 'exit']);
    expect((await db.tradeFees.toArray()).map(fee => fee.currency)).toEqual(['USDT']);
  });

  it('refuses invalid input with the same P10 validation outcome and writes nothing', async () => {
    const db = await database('invalid');
    expect(await savePracticeTrade(db, { ...input, symbol: '   ' }, { now, createId: ids() })).toEqual({ ok: false, type: 'validation-error', field: 'symbol', reason: 'symbol-required' });
    expect(await savePracticeTrade(db, { ...input, executions: [{ type: 'entry', price: '-1', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }] }, { now, createId: ids() })).toMatchObject({ ok: false, type: 'validation-error', field: 'executions.0.price' });
    expect(await db.trades.count()).toBe(0);
    expect(await db.tradeExecutions.count()).toBe(0);
  });

  it('never touches an existing manual trade and reports a storage failure explicitly', async () => {
    const db = await database('manual');
    const createId = ids();
    const manual = await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-18T08:00:00.000Z' }, { now, createId });
    if (!manual.ok) throw new Error('unreachable');
    const before = await db.trades.get(manual.tradeId);
    const result = await savePracticeTrade(db, input, { now, createId });
    expect(result).toMatchObject({ ok: true, tradeId: 'p29-id-2', source: 'paper' });
    expect(await db.trades.get(manual.tradeId)).toEqual(before);
    expect((await db.trades.toArray()).map(trade => trade.source).sort()).toEqual(['manual', 'paper']);
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await savePracticeTrade(db, input, { now, createId })).toEqual({ ok: false, type: 'storage-error', reason: 'practice-trade-save-failed' });
  });
});
