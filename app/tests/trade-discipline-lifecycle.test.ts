import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { loadTradeDiscipline, saveTradeDiscipline } from '../src/application/discipline';
import { deleteTradeRecord, saveManualTrade } from '../src/application/trades';
import { KAIROS_BACKUP_FORMAT_NAME } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { upgradeLegacyTradeDisciplineRecord, type LegacyTradeDisciplineRecord, type TradeDisciplineId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-discipline-lifecycle-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-24T12:00:00.000Z';
let disciplineIds = 0;
const nextDisciplineId = () => `discipline-${++disciplineIds}` as TradeDisciplineId;
const closedTrade = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-24T09:00:00.000Z', closedAt: '2026-09-24T10:00:00.000Z', plan: { plannedEntryPrice: '100', plannedQuantity: '1' }, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-24T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-24T10:00:00.000Z' }], fees: [] } as const);

async function closedWithReview(db: KairosDatabase, tradeId: string, symbol = 'BTCUSDT'): Promise<TradeDisciplineRecord> {
  let index = 0;
  const saved = await saveManualTrade(db, closedTrade(symbol), { now, createId: (() => (index++ === 0 ? tradeId : `${tradeId}-child-${index}`)) as never });
  if (!saved.ok) throw new Error('trade fixture');
  const review = await saveTradeDiscipline(db, { tradeId: tradeId as TradeId, scope: 'real', half: 'review', answers: [{ itemId: 'followed-plan', answer: 'yes' }], mistakeIds: ['early-exit'], note: 'Closed a bit early.' }, { now, createId: nextDisciplineId });
  if (!review.ok) throw new Error(review.reason);
  return review.record;
}
async function exportOf(db: KairosDatabase): Promise<string> {
  const exported = await exportKairosBackup(db, new Date(now()));
  if (!exported.ok) throw new Error('export');
  return exported.file.contents;
}

describe('P22.2 discipline records follow their trade', () => {
  it('deletes the record with its trade and keeps the other trades\' records', async () => {
    const db = await database('delete');
    await closedWithReview(db, 'trade-a', 'BTCUSDT');
    const kept = await closedWithReview(db, 'trade-b', 'ETHUSDT');
    let index = 0;
    await saveManualTrade(db, closedTrade('SOLUSDT'), { now, createId: (() => (index++ === 0 ? 'trade-c' : `trade-c-child-${index}`)) as never });

    const deleted = await deleteTradeRecord(db, 'trade-a' as TradeId);
    expect(deleted.ok && deleted.removed.discipline).toBe(1);
    expect(await db.tradeDiscipline.where('tradeId').equals('trade-a').count()).toBe(0);
    expect(await db.tradeDiscipline.toArray()).toEqual([kept]);

    const withoutRecord = await deleteTradeRecord(db, 'trade-c' as TradeId);
    expect(withoutRecord.ok && withoutRecord.removed.discipline).toBe(0);

    const before = await db.tradeDiscipline.count();
    expect(await deleteTradeRecord(db, 'missing' as TradeId)).toEqual({ ok: false, type: 'not-found', reason: 'trade-not-found' });
    expect(await db.tradeDiscipline.count()).toBe(before);
  });

  it('merge-imports the records of the trades it adds', async () => {
    const other = await database('other');
    const exported = await closedWithReview(other, 'trade-x');
    const backup = await exportOf(other);

    const db = await database('merge');
    const prepared = await prepareTradeImport(db, backup);
    if (!prepared.ok) throw new Error(prepared.type);
    expect(prepared.import.preview.discipline).toBe(1);
    const committed = await commitTradeImport(db, prepared.import);
    expect(committed.ok && committed.added.discipline).toBe(1);
    expect(await db.tradeDiscipline.toArray()).toEqual([exported]);
    const loaded = await loadTradeDiscipline(db, ['trade-x' as TradeId]);
    expect(loaded.ok && loaded.records.get('trade-x' as TradeId)).toEqual(exported);
  });

  it('keeps a present trade\'s own record and skips a discipline id already here', async () => {
    const other = await database('other-2');
    await closedWithReview(other, 'shared', 'BTCUSDT');
    const incomingNew = await closedWithReview(other, 'new-trade', 'ETHUSDT');
    const backup = await exportOf(other);

    const db = await database('present');
    const own = await closedWithReview(db, 'shared', 'BTCUSDT');
    // A record on this device that happens to use the incoming record's id (for another trade).
    let index = 0;
    await saveManualTrade(db, closedTrade('XRPUSDT'), { now, createId: (() => (index++ === 0 ? 'local-trade' : `local-child-${index}`)) as never });
    await db.tradeDiscipline.put({ ...own, id: incomingNew.id, tradeId: 'local-trade' as TradeId });

    const prepared = await prepareTradeImport(db, backup);
    if (!prepared.ok) throw new Error(prepared.type);
    expect(prepared.import.preview).toMatchObject({ newTrades: 1, alreadyPresent: 1, discipline: 0 });
    const committed = await commitTradeImport(db, prepared.import);
    expect(committed).toMatchObject({ ok: true, added: { trades: 1, discipline: 0 } });
    expect(await db.trades.get('new-trade' as TradeId)).toBeDefined();
    expect((await db.tradeDiscipline.where('tradeId').equals('shared').first())).toEqual(own);
  });

  it('merge-imports an old format 5 record converted to the new shape', async () => {
    const trade: TradeRecord = { id: 'old-trade' as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-19T08:00:00.000Z', closedAt: '2026-09-19T09:30:00.000Z', createdAt: '2026-09-19T08:00:00.000Z', updatedAt: '2026-09-19T09:30:00.000Z' };
    const legacy: LegacyTradeDisciplineRecord = { id: 'old-discipline' as TradeDisciplineId, tradeId: trade.id, preTradeChecklist: [{ key: 'plan-written', answer: 'yes' }], postTradeReview: [{ key: 'followed-plan', answer: 'no' }], mistakes: ['moved-stop'], note: 'Moved the stop.', checklistCompletedAt: '2026-09-19T07:55:00.000Z', reviewedAt: '2026-09-19T10:00:00.000Z', createdAt: '2026-09-19T07:55:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z' };
    const v5 = { formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 5, appVersion: 'old', buildId: 'old', exportedAt: '2026-09-20T00:00:00.000Z', databaseSchemaVersion: 6, recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, total: 2 }, payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [legacy] } };
    const db = await database('old');
    const prepared = await prepareTradeImport(db, JSON.stringify(v5));
    if (!prepared.ok) throw new Error(prepared.type);
    expect(await commitTradeImport(db, prepared.import)).toMatchObject({ ok: true, added: { trades: 1, discipline: 1 } });
    expect(await db.tradeDiscipline.toArray()).toEqual([upgradeLegacyTradeDisciplineRecord(legacy)]);
  });

  it('reports the restored discipline count', async () => {
    const source = await database('restore-source');
    await closedWithReview(source, 'r-1', 'BTCUSDT');
    await closedWithReview(source, 'r-2', 'ETHUSDT');
    const db = await database('restore-target');
    const prepared = await prepareBackupRestore(db, await exportOf(source));
    if (!prepared.ok) throw new Error(prepared.type);
    const committed = await commitBackupRestore(db, prepared.restore);
    expect(committed.ok && committed.restored.restoredTradeDisciplineRecords).toBe(2);
  });
});
