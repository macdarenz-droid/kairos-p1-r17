import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, prepareBackupRestore } from '../src/application/backup';
import { KAIROS_BACKUP_FORMAT_NAME, createKairosDatabaseSnapshot, createKairosDatabaseSnapshotWithReport, parseKairosBackup, serializeKairosBackup } from '../src/data/backup';
import { KAIROS_DATABASE_MIGRATIONS, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase } from '../src/data/database';
import { isTradeDisciplineRecordShape, type LegacyTradeDisciplineRecord, type TradeDisciplineId, type TradeDisciplineRecord, type TradeStrategyMark } from '../src/domain/discipline';
import type { DecimalString, TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-strategy-v9-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const tradeId = 'trade-p28-3' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-20T08:00:00.000Z', closedAt: '2026-09-20T09:30:00.000Z', createdAt: '2026-09-20T08:00:00.000Z', updatedAt: '2026-09-20T09:30:00.000Z' };
const mark: TradeStrategyMark = {
  strategyId: 'breakout', revision: 1, name: 'Breakout',
  rules: [{ id: 'risk', kind: 'max-risk', amount: '50' as DecimalString, currency: 'USDT' }, { id: 'wait', kind: 'written', label: 'I wait for a close' }],
  answers: [{ ruleId: 'wait', answer: 'yes' }], linkedAt: '2026-09-20T10:00:00.000Z',
};
const plain: TradeDisciplineRecord = {
  id: 'discipline-p28-3' as TradeDisciplineId, tradeId,
  preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }],
  postTradeReview: [], mistakes: [], note: '',
  checklistCompletedAt: '2026-09-20T07:55:00.000Z', reviewedAt: null,
  createdAt: '2026-09-20T07:55:00.000Z', updatedAt: '2026-09-20T07:55:00.000Z',
};
const marked: TradeDisciplineRecord = { ...plain, strategy: mark };
const legacy: LegacyTradeDisciplineRecord = {
  id: plain.id, tradeId, preTradeChecklist: [{ key: 'plan-written', answer: 'yes' }], postTradeReview: [], mistakes: [], note: '',
  checklistCompletedAt: plain.checklistCompletedAt, reviewedAt: null, createdAt: plain.createdAt, updatedAt: plain.updatedAt,
};

const counts = { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, total: 2 };
const payload = (discipline: unknown) => ({ metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [discipline] });
const header = { formatName: KAIROS_BACKUP_FORMAT_NAME, appVersion: 'old', buildId: 'old', exportedAt: '2026-09-21T00:00:00.000Z' };

describe('T-040c schema v9: a trade can carry its strategy', () => {
  it('upgrades a v8 database with nothing to convert', async () => {
    const name = newName('upgrade');
    const old = new Dexie(name);
    registerKairosMigrations(old, KAIROS_DATABASE_MIGRATIONS.slice(0, 8), 8);
    await old.open();
    await old.table('trades').put(trade);
    await old.table('tradeDiscipline').put(plain);
    old.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 11 });
    expect(await db.tradeDiscipline.toArray()).toEqual([plain]);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('accepts a record with or without a good mark, and refuses a bad one', () => {
    expect(isTradeDisciplineRecordShape(plain)).toBe(true);
    expect(isTradeDisciplineRecordShape(marked)).toBe(true);
    for (const broken of [
      { ...plain, strategy: null },
      { ...plain, strategy: { ...mark, answers: [{ ruleId: 'risk', answer: 'yes' }] } },
      { ...plain, strategy: { ...mark, linkedAt: '2026-09-20' } },
      { ...plain, strategy: { ...mark, revision: 0 } },
      { ...plain, strategy: { ...mark, rules: [{ id: 'x', kind: 'max-trades' }] } },
      { ...plain, strategy: { ...mark, rules: [] } },
    ]) expect(isTradeDisciplineRecordShape(broken)).toBe(false);
  });

  it('keeps a marked record on the current database, and reports a damaged one', async () => {
    const db = await current('integrity');
    await db.trades.put(trade);
    await db.tradeDiscipline.put(marked);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    await db.tradeDiscipline.put({ ...marked, strategy: { ...mark, revision: 0 } });
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.checks.find(check => check.id === 'trade-discipline-record-shape')?.ok).toBe(false);
    expect(report.coreOk).toBe(true);
    const snapshot = await createKairosDatabaseSnapshotWithReport(db);
    expect(snapshot.skipped.tradeDiscipline).toBe(1);
    expect(snapshot.envelope.payload.tradeDiscipline).toEqual([]);
  });

  it('exports format 8 with schema 9 and the mark, which round-trips', async () => {
    const db = await current('export');
    await db.trades.put(trade);
    await db.tradeDiscipline.put(marked);
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11 });
    expect(snapshot.payload.tradeDiscipline).toEqual([marked]);
    expect(parseKairosBackup(serializeKairosBackup(snapshot))).toEqual(snapshot);
  });

  it('reads a format 7 backup as format 8, keeping its record, and restores it', async () => {
    const text = JSON.stringify({ ...header, formatVersion: 7, databaseSchemaVersion: 8, recordCounts: counts, payload: payload(plain) });
    const parsed = parseKairosBackup(text);
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11, recordCounts: { tradeDiscipline: 1 } });
    expect(parsed.payload.tradeDiscipline).toEqual([plain]);
    const db = await current('restore');
    const prepared = await prepareBackupRestore(db, text);
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.tradeDiscipline.toArray()).toEqual([plain]);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('reads a format 5 backup as format 8 with the converted record and no mark', () => {
    const parsed = parseKairosBackup(JSON.stringify({ ...header, formatVersion: 5, databaseSchemaVersion: 6, recordCounts: counts, payload: payload(legacy) }));
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11 });
    expect(parsed.payload.tradeDiscipline).toEqual([plain]);
    expect('strategy' in parsed.payload.tradeDiscipline[0]!).toBe(false);
  });

  it('refuses a mark in format 7, a format 8 header naming schema 8, and format 10', () => {
    expect(() => parseKairosBackup(JSON.stringify({ ...header, formatVersion: 7, databaseSchemaVersion: 8, recordCounts: counts, payload: payload(marked) }))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    expect(() => parseKairosBackup(JSON.stringify({ ...header, formatVersion: 8, databaseSchemaVersion: 8, recordCounts: counts, payload: payload(marked) }))).toThrow(expect.objectContaining({ code: 'INVALID_HEADER' }));
    expect(() => parseKairosBackup(JSON.stringify({ ...header, formatVersion: 11, databaseSchemaVersion: 12, recordCounts: counts, payload: payload(marked) }))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
  });
});
