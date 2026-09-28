import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  KAIROS_DATABASE_MIGRATIONS,
  createKairosDatabase,
  inspectKairosDatabaseIntegrity,
  openKairosDatabase,
  registerKairosMigrations,
  type KairosDatabase,
} from '../src/data/database';
import {
  createKairosBackupEnvelope,
  createKairosDatabaseSnapshot,
  parseKairosBackup,
  prepareKairosRestore,
  replaceKairosDatabaseFromPreparedRestore,
  serializeKairosBackup,
} from '../src/data/backup';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord, TradeSource, TradeStatus } from '../src/domain/trades';

const names: string[] = [];
const newName = (label: string) => { const name = `kairos-v7-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
const opened: KairosDatabase[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const at = '2026-09-01T00:00:00.000Z';
function trade(id: string, status: TradeStatus, source: TradeSource, closedAt: string | null): TradeRecord {
  return {
    id, symbol: id.toUpperCase(), marketType: 'crypto', side: 'long', status, source,
    openedAt: status === 'draft' ? null : at, closedAt, createdAt: at, updatedAt: closedAt ?? at,
  } as TradeRecord;
}
const plan = { id: 'plan-1', tradeId: 'closed-a', plannedEntryPrice: '100', plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: '1', createdAt: at, updatedAt: at } as unknown as TradePlanRecord;
const execution = { id: 'exec-1', tradeId: 'closed-a', type: 'entry', price: '100', quantity: '1', executedAt: at, createdAt: at } as unknown as TradeExecutionRecord;
const fee = { id: 'fee-1', tradeId: 'closed-a', executionId: 'exec-1', amount: '0.5', currency: 'USDT', createdAt: at } as unknown as TradeFeeRecord;

async function openCurrent(name: string) {
  const db = createKairosDatabase(name); opened.push(db);
  return { db, status: await openKairosDatabase(db) };
}

describe('schema v7: the close-time index', () => {
  it('upgrades a real v6 database without changing any row', async () => {
    const name = newName('upgrade');
    const old = new Dexie(name);
    registerKairosMigrations(old, KAIROS_DATABASE_MIGRATIONS.slice(0, 6), 6);
    await old.open();
    const trades = [
      trade('closed-a', 'closed', 'manual', '2026-09-02T10:00:00.000Z'),
      trade('open-b', 'open', 'manual', null),
      trade('cancelled-c', 'cancelled', 'manual', '2026-09-03T10:00:00.000Z'),
      trade('paper-d', 'closed', 'paper', '2026-09-04T10:00:00.000Z'),
    ];
    await old.table('trades').bulkPut(trades);
    await old.table('tradePlans').put(plan);
    await old.table('tradeExecutions').put(execution);
    await old.table('tradeFees').put(fee);
    old.close();

    const { db, status } = await openCurrent(name);
    expect(status).toEqual({ state: 'ready', schemaVersion: 11 });
    expect(await db.trades.orderBy('id').toArray()).toEqual([...trades].sort((l, r) => l.id.localeCompare(r.id)));
    expect(await db.tradePlans.toArray()).toEqual([plan]);
    expect(await db.tradeExecutions.toArray()).toEqual([execution]);
    expect(await db.tradeFees.toArray()).toEqual([fee]);
    const indexes = db.trades.schema.indexes.map(index => index.name);
    expect(indexes).toContain('[status+closedAt]');
    expect(indexes).toContain('[status+updatedAt]');
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    db.close();

    const again = await openCurrent(name);
    expect(again.status).toEqual({ state: 'ready', schemaVersion: 11 });
    expect(await again.db.trades.count()).toBe(4);
  });

  it('reads closed trades by close time, oldest first, within [from, to)', async () => {
    const { db } = await openCurrent(newName('range'));
    await db.trades.bulkPut([
      trade('late', 'closed', 'manual', '2026-09-20T00:00:00.000Z'),
      trade('early', 'closed', 'manual', '2026-09-01T00:00:00.000Z'),
      trade('middle', 'closed', 'manual', '2026-09-10T00:00:00.000Z'),
      trade('open', 'open', 'manual', null),
      trade('cancelled', 'cancelled', 'manual', '2026-09-05T00:00:00.000Z'),
      trade('paper', 'closed', 'paper', '2026-09-06T00:00:00.000Z'),
    ]);
    const repositories = createKairosRepositories(db);
    const manual = repositories.trades.scopedBySource(['manual']);
    expect((await manual.listClosedByClosedAtRange(null, null)).map(row => row.id)).toEqual(['early', 'middle', 'late']);
    expect((await manual.listClosedByClosedAtRange('2026-09-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z')).map(row => row.id)).toEqual(['early', 'middle']);
    expect((await repositories.trades.scopedBySource(['paper']).listClosedByClosedAtRange(null, null)).map(row => row.id)).toEqual(['paper']);
  });
});

describe('backup format V5 across schema v6 and v7', () => {
  it('restores a V5 backup whose header says schema 6 into the v7 database', async () => {
    const { db } = await openCurrent(newName('restore-v6'));
    const envelope = { ...createKairosBackupEnvelope({ metadata: [{ key: 'journal.note', value: 'kept', updatedAt: at }], trades: [trade('closed-a', 'closed', 'manual', at)], exportedAt: new Date(at) }), formatVersion: 5, databaseSchemaVersion: 6 };
    const text = JSON.stringify(envelope);
    expect(parseKairosBackup(text)).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11 });
    const prepared = await prepareKairosRestore(db, text);
    const result = await replaceKairosDatabaseFromPreparedRestore(db, prepared);
    expect(result.integrity.ok).toBe(true);
    expect((await db.trades.toArray()).map(row => row.id)).toEqual(['closed-a']);
  });

  it('writes schema 7 in a fresh snapshot, which round-trips', async () => {
    const { db } = await openCurrent(newName('snapshot'));
    await db.trades.put(trade('closed-a', 'closed', 'manual', at));
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot.databaseSchemaVersion).toBe(11);
    expect(parseKairosBackup(serializeKairosBackup(snapshot))).toEqual(snapshot);
  });

  it('refuses a V5 header that names schema 8', () => {
    const envelope = { ...createKairosBackupEnvelope({ metadata: [], exportedAt: new Date(at) }), formatVersion: 5, databaseSchemaVersion: 8 };
    expect(() => parseKairosBackup(JSON.stringify(envelope))).toThrow(expect.objectContaining({ code: 'INVALID_HEADER' }));
  });
});
