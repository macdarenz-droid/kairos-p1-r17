import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, prepareBackupRestore } from '../src/application/backup';
import { KAIROS_BACKUP_FORMAT_NAME, createKairosDatabaseSnapshot, parseKairosBackup, serializeKairosBackup } from '../src/data/backup';
import { KAIROS_DATABASE_MIGRATIONS, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase } from '../src/data/database';
import {
  isLegacyTradeDisciplineRecordShape,
  isTradeDisciplineRecordShape,
  upgradeLegacyTradeDisciplineRecord,
  type LegacyTradeDisciplineRecord,
  type TradeDisciplineId,
  type TradeDisciplineRecord,
} from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-discipline-v8-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const tradeId = 'trade-p36-1' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-19T08:00:00.000Z', closedAt: '2026-09-19T09:30:00.000Z', createdAt: '2026-09-19T08:00:00.000Z', updatedAt: '2026-09-19T09:30:00.000Z' };
const legacy: LegacyTradeDisciplineRecord = {
  id: 'discipline-p36-1' as TradeDisciplineId,
  tradeId,
  preTradeChecklist: [{ key: 'plan-written', answer: 'yes' }, { key: 'risk-defined', answer: 'yes' }, { key: 'stop-placed', answer: 'no' }],
  postTradeReview: [{ key: 'followed-plan', answer: 'no' }, { key: 'emotions-in-check', answer: 'yes' }],
  mistakes: ['moved-stop', 'early-exit'],
  note: 'Moved the stop after a wick; exited before the target.',
  checklistCompletedAt: '2026-09-19T07:55:00.000Z',
  reviewedAt: '2026-09-19T10:00:00.000Z',
  createdAt: '2026-09-19T07:55:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
};
const converted: TradeDisciplineRecord = {
  id: legacy.id,
  tradeId,
  preTradeChecklist: [
    { itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' },
    { itemId: 'risk-defined', label: 'I know how much I can lose', answer: 'yes' },
    { itemId: 'stop-placed', label: 'I set my stop', answer: 'no' },
  ],
  postTradeReview: [
    { itemId: 'followed-plan', label: 'I followed my plan', answer: 'no' },
    { itemId: 'emotions-in-check', label: 'I stayed calm', answer: 'yes' },
  ],
  mistakes: [{ itemId: 'moved-stop', label: 'Moved my stop' }, { itemId: 'early-exit', label: 'Closed too early' }],
  note: legacy.note,
  checklistCompletedAt: legacy.checklistCompletedAt,
  reviewedAt: legacy.reviewedAt,
  createdAt: legacy.createdAt,
  updatedAt: legacy.updatedAt,
};

const counts = { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, total: 2 };
const payload = (discipline: unknown) => ({ metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [discipline] });
const header = { formatName: KAIROS_BACKUP_FORMAT_NAME, appVersion: 'old', buildId: 'old', exportedAt: '2026-09-20T00:00:00.000Z' };
const v5Backup = { ...header, formatVersion: 5, databaseSchemaVersion: 6, recordCounts: counts, payload: payload(legacy) };
const v6Backup = { ...header, formatVersion: 6, databaseSchemaVersion: 7, recordCounts: counts, payload: payload(legacy) };

describe('schema v8: one discipline record per trade, answers by item', () => {
  it('upgrades a v7 database, converting the old record with the default labels', async () => {
    const name = newName('upgrade');
    const old = new Dexie(name);
    registerKairosMigrations(old, KAIROS_DATABASE_MIGRATIONS.slice(0, 7), 7);
    await old.open();
    await old.table('trades').put(trade);
    await old.table('tradeDiscipline').put(legacy);
    old.close();

    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 9 });
    expect(await db.tradeDiscipline.toArray()).toEqual([converted]);
    expect(db.tradeDiscipline.schema.idxByName.tradeId?.unique).toBe(true);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('refuses a second record for the same trade', async () => {
    const db = await current('unique');
    await db.trades.put(trade);
    await db.tradeDiscipline.put(converted);
    await expect(db.tradeDiscipline.put({ ...converted, id: 'second' as TradeDisciplineId })).rejects.toMatchObject({ name: 'ConstraintError' });
    expect(await db.tradeDiscipline.count()).toBe(1);
  });

  it('checks the new shape without comparing against the current lists', () => {
    expect(upgradeLegacyTradeDisciplineRecord(legacy)).toEqual(converted);
    expect(isTradeDisciplineRecordShape(converted)).toBe(true);
    expect(isTradeDisciplineRecordShape({ ...converted, preTradeChecklist: [{ itemId: 'plan-written', label: 'My plan is on paper', answer: 'yes' }] })).toBe(true);
    for (const broken of [
      legacy,
      { ...converted, postTradeReview: [converted.postTradeReview[0], converted.postTradeReview[0]] },
      { ...converted, preTradeChecklist: [{ itemId: 'plan-written', label: '', answer: 'yes' }] },
      { ...converted, preTradeChecklist: [{ itemId: 'plan-written', label: 'a'.repeat(81), answer: 'yes' }] },
      { ...converted, preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'maybe' }] },
      { ...converted, mistakes: [{ itemId: 'Bad Id', label: 'Moved my stop' }] },
      { ...converted, mistakes: ['moved-stop'] },
    ]) expect(isTradeDisciplineRecordShape(broken)).toBe(false);
    expect(isLegacyTradeDisciplineRecordShape(legacy)).toBe(true);
  });

  it('exports format 7 with schema 8 and the new record, which round-trips', async () => {
    const db = await current('export');
    await db.trades.put(trade);
    await db.tradeDiscipline.put(converted);
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot).toMatchObject({ formatVersion: 8, databaseSchemaVersion: 9, recordCounts: { tradeDiscipline: 1 } });
    expect(snapshot.payload.tradeDiscipline).toEqual([converted]);
    expect(parseKairosBackup(serializeKairosBackup(snapshot))).toEqual(snapshot);
  });

  for (const [label, backup] of [['format 5', v5Backup], ['format 6', v6Backup]] as const) {
    it(`reads a ${label} backup as format 7, converts its record and restores it`, async () => {
      const text = JSON.stringify(backup);
      const parsed = parseKairosBackup(text);
      expect(parsed).toMatchObject({ formatVersion: 8, databaseSchemaVersion: 9, recordCounts: { tradeDiscipline: 1, total: 2 } });
      expect(parsed.payload.tradeDiscipline).toEqual([converted]);
      expect(parsed.payload.trades).toEqual([trade]);
      const db = await current('restore');
      const prepared = await prepareBackupRestore(db, text);
      if (!prepared.ok) throw new Error(prepared.type);
      expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
      expect(await db.tradeDiscipline.toArray()).toEqual([converted]);
      expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    });
  }

  it('refuses a record in the wrong shape for its format', () => {
    const v7WithLegacy = { ...header, formatVersion: 7, databaseSchemaVersion: 8, recordCounts: counts, payload: payload(legacy) };
    const v5WithNew = { ...v5Backup, payload: payload(converted) };
    expect(() => parseKairosBackup(JSON.stringify(v7WithLegacy))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    expect(() => parseKairosBackup(JSON.stringify(v5WithNew))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
  });

  it('refuses a format from the future', () => {
    const future = { ...header, formatVersion: 9, databaseSchemaVersion: 10, recordCounts: counts, payload: payload(converted) };
    expect(() => parseKairosBackup(JSON.stringify(future))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
  });
});
