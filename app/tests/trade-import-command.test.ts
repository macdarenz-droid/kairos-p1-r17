import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitTradeImport, exportKairosBackup, prepareTradeImport, TRADE_IMPORT_RESTAMPED_SOURCES } from '../src/application/backup';
import { listJournalHistory } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p32-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
function ids(prefix: string) { let index = 0; return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `${prefix}-${++index}` as T; }
const now = () => '2026-09-18T17:00:00.000Z';
const closed = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', plan: { plannedEntryPrice: '100', plannedQuantity: '1' }, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [{ amount: '0.5', currency: 'USDT' }] } as const);
const counts = async (db: Awaited<ReturnType<typeof database>>) => ({ trades: await db.trades.count(), plans: await db.tradePlans.count(), executions: await db.tradeExecutions.count(), fees: await db.tradeFees.count(), metadata: await db.metadata.count() });

/** A backup from "another device": one shared trade, one manual trade and one practice trade this device lacks. */
async function otherDeviceBackup(shared: { readonly symbol: string; readonly createId: () => TradeId }) {
  const other = await database('other');
  const createId = ids('o');
  await saveManualTrade(other, closed(shared.symbol), { now, createId: shared.createId as never });
  await saveManualTrade(other, closed('ETHUSDT'), { now, createId });
  await savePracticeTrade(other, closed('SOLUSDT'), { now, createId });
  await other.metadata.put({ key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: now() });
  const exported = await exportKairosBackup(other, new Date(now()));
  if (!exported.ok) throw new Error('fixture');
  return exported.file.contents;
}

describe('P32.1 trade merge-import command', () => {
  it('previews the trades this device lacks with their children and adds exactly them on confirmation, re-stamping real sources as import', async () => {
    const db = await database('merge');
    const sharedIds = ids('s');
    await saveManualTrade(db, closed('BTCUSDT'), { now, createId: sharedIds as never });
    const backup = await otherDeviceBackup({ symbol: 'BTCUSDT', createId: ids('s') as never });
    const before = await counts(db);
    const prepared = await prepareTradeImport(db, backup);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error('unreachable');
    expect(prepared.import.preview).toEqual({ exportedAt: now(), formatVersion: 7, newTrades: 1, newPracticeTrades: 1, alreadyPresent: 1, plans: 2, executions: 4, fees: 2, discipline: 0 });
    expect(await counts(db)).toEqual(before);
    const result = await commitTradeImport(db, prepared.import);
    expect(result).toEqual({ ok: true, added: { trades: 2, plans: 2, executions: 4, fees: 2, discipline: 0 }, skipped: 0 });
    expect(await counts(db)).toEqual({ trades: 3, plans: 3, executions: 6, fees: 3, metadata: 0 });
    expect((await db.trades.toArray()).map(trade => [trade.symbol, trade.source]).sort()).toEqual([['BTCUSDT', 'manual'], ['ETHUSDT', 'import'], ['SOLUSDT', 'paper']]);
    expect((await listJournalHistory(db)).map(entry => entry.trade.symbol).sort()).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect((await listJournalHistory(db, { scope: 'practice' })).map(entry => entry.trade.symbol)).toEqual(['SOLUSDT']);
    expect(TRADE_IMPORT_RESTAMPED_SOURCES).toEqual(['manual', 'import', 'broker-import']);
  });

  it('keeps an existing trade byte-identical and skips a trade that appears between preview and confirmation', async () => {
    const db = await database('skip');
    await saveManualTrade(db, closed('BTCUSDT'), { now, createId: ids('s') as never });
    const backup = await otherDeviceBackup({ symbol: 'BTCUSDT', createId: ids('s') as never });
    const existing = await db.trades.toArray();
    const prepared = await prepareTradeImport(db, backup);
    if (!prepared.ok) throw new Error('unreachable');
    const eth = prepared.import.trades.find(trade => trade.symbol === 'ETHUSDT')!;
    await db.trades.put({ ...eth, source: 'manual', symbol: 'ETHUSDT-LOCAL' });
    const result = await commitTradeImport(db, prepared.import);
    expect(result).toEqual({ ok: true, added: { trades: 1, plans: 1, executions: 2, fees: 1, discipline: 0 }, skipped: 1 });
    expect((await db.trades.toArray()).filter(trade => trade.symbol === 'BTCUSDT')).toEqual(existing);
    expect((await db.trades.get(eth.id))?.symbol).toBe('ETHUSDT-LOCAL');
    expect((await db.tradeExecutions.toArray()).every(execution => execution.tradeId !== eth.id)).toBe(true);
  });

  it('refuses an over-size file, a non-backup, an inconsistent backup and a child id already on the device, writing nothing', async () => {
    const db = await database('refuse');
    await saveManualTrade(db, closed('BTCUSDT'), { now, createId: ids('s') as never });
    await saveManualTrade(db, closed('LOCALONLY'), { now, createId: ids('l') as never });
    const before = await counts(db);
    expect(await prepareTradeImport(db, 'x'.repeat(64 * 1024 * 1024 + 1))).toMatchObject({ ok: false, type: 'invalid-input', reason: 'backup-file-too-large' });
    expect(await prepareTradeImport(db, '{"formatName":"other"}')).toEqual({ ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: 'FORMAT_NAME_MISMATCH' });
    const backup = await otherDeviceBackup({ symbol: 'BTCUSDT', createId: ids('s') as never });
    const broken = JSON.parse(backup) as { payload: { tradeExecutions: Array<{ tradeId: string }> } };
    broken.payload.tradeExecutions[0]!.tradeId = 'missing-trade';
    expect(await prepareTradeImport(db, JSON.stringify(broken))).toEqual({ ok: false, type: 'incompatible-backup', reason: 'import-preflight-refused', code: 'INVALID_TRADE_REFERENCE' });
    const collision = JSON.parse(backup) as { payload: { tradeExecutions: Array<{ id: string; tradeId: string }>; trades: Array<{ id: string; symbol: string }> } };
    const localExecution = (await db.tradeExecutions.toArray()).find(execution => execution.id.startsWith('l-'))!;
    const foreign = collision.payload.tradeExecutions.find(execution => collision.payload.trades.find(trade => trade.id === execution.tradeId)?.symbol === 'ETHUSDT')!;
    foreign.id = localExecution.id;
    expect(await prepareTradeImport(db, JSON.stringify(collision))).toEqual({ ok: false, type: 'identity-conflict', reason: 'child-id-present' });
    expect(await counts(db)).toEqual(before);
  });

  it('reports a storage failure explicitly on both steps', async () => {
    const db = await database('storage');
    const backup = await otherDeviceBackup({ symbol: 'BTCUSDT', createId: ids('s') as never });
    const prepared = await prepareTradeImport(db, backup);
    if (!prepared.ok) throw new Error('unreachable');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await prepareTradeImport(db, backup)).toEqual({ ok: false, type: 'storage-error', reason: 'import-prepare-failed' });
    expect(await commitTradeImport(db, prepared.import)).toEqual({ ok: false, type: 'storage-error', reason: 'import-commit-failed' });
    vi.restoreAllMocks();
    expect(await db.trades.count()).toBe(0);
  });
});
