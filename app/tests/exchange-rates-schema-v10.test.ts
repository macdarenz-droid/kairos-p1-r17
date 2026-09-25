import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, commitSavedRecordImport, commitTradeImport, prepareBackupRestore, prepareSavedRecordImport, prepareTradeImport } from '../src/application/backup';
import { KAIROS_BACKUP_FORMAT_NAME, createKairosBackupEnvelope, createKairosDatabaseSnapshot, createKairosDatabaseSnapshotWithReport, parseKairosBackup, serializeKairosBackup } from '../src/data/backup';
import { KAIROS_DATABASE_MIGRATIONS, KAIROS_V10_STORES, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { DecimalString, TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-rates-v10-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const tradeId = 'trade-p33-2' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T08:00:00.000Z', closedAt: '2026-09-18T09:30:00.000Z', createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T09:30:00.000Z' };
const plain: TradeDisciplineRecord = {
  id: 'discipline-p33-2' as TradeDisciplineId, tradeId,
  preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }],
  postTradeReview: [], mistakes: [], note: '',
  checklistCompletedAt: '2026-09-18T07:55:00.000Z', reviewedAt: null,
  createdAt: '2026-09-18T07:55:00.000Z', updatedAt: '2026-09-18T07:55:00.000Z',
};
const header = { formatName: KAIROS_BACKUP_FORMAT_NAME, appVersion: 'old', buildId: 'old', exportedAt: '2026-09-21T00:00:00.000Z' };

const savedAt = '2026-09-19T08:00:00.000Z';
const ecbUsd: ExchangeRateRecord = { id: exchangeRateId('ecb', 'EUR', 'USD', '2026-09-18'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.146' as DecimalString, savedAt };
const typedGbp: ExchangeRateRecord = { id: exchangeRateId('typed', 'GBP', 'EUR', '2026-09-18'), source: 'typed', from: 'GBP', to: 'EUR', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.17' as DecimalString, savedAt };
const ecbUsdBefore: ExchangeRateRecord = { ...ecbUsd, id: exchangeRateId('ecb', 'EUR', 'USD', '2026-09-17'), day: '2026-09-17', rateDay: '2026-09-17', rate: '1.1481' as DecimalString };
const damaged = { ...ecbUsd, rate: '0' } as ExchangeRateRecord;

const format8 = () => JSON.stringify({
  ...header, formatVersion: 8, databaseSchemaVersion: 9,
  recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, total: 2 },
  payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [plain] },
});
const format9 = (rates: readonly unknown[], trades: readonly TradeRecord[] = [trade]) => {
  const envelope = createKairosBackupEnvelope({ metadata: [], trades, exchangeRates: rates as ExchangeRateRecord[], exportedAt: new Date('2026-09-21T00:00:00.000Z') });
  return JSON.parse(JSON.stringify(envelope)) as Record<string, unknown> & { recordCounts: Record<string, number> };
};

describe('T-045b schema v10: exchange rates are stored', () => {
  it('upgrades a v9 database with an empty rate store', async () => {
    const name = newName('upgrade');
    const old = new Dexie(name);
    registerKairosMigrations(old, KAIROS_DATABASE_MIGRATIONS.slice(0, 9), 9);
    await old.open();
    await old.table('trades').put(trade);
    old.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 10 });
    expect(await db.trades.toArray()).toEqual([trade]);
    expect(await db.exchangeRates.count()).toBe(0);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    expect(KAIROS_DATABASE_MIGRATIONS[9]).toEqual({ version: 10, stores: KAIROS_V10_STORES });
  });

  it('keeps one row per source, pair and day, and reads by day', async () => {
    const db = await current('repository');
    const rates = createKairosRepositories(db).exchangeRates;
    await rates.put(ecbUsd);
    await rates.put(typedGbp);
    await rates.put(ecbUsdBefore);
    expect((await rates.listByDays(['2026-09-18'])).sort((a, b) => a.id.localeCompare(b.id))).toEqual([ecbUsd, typedGbp]);
    expect(await rates.get(ecbUsd.id)).toEqual(ecbUsd);
    await rates.put({ ...typedGbp, rate: '1.2' as DecimalString });
    const typedRows = (await rates.listAll()).filter((rate) => rate.source === 'typed');
    expect(typedRows).toEqual([{ ...typedGbp, rate: '1.2' }]);
  });

  it('checks rates in the secondary tier, and a backup leaves a damaged one out', async () => {
    const db = await current('integrity');
    await db.trades.put(trade);
    await db.exchangeRates.bulkPut([ecbUsd, typedGbp]);
    const good = await inspectKairosDatabaseIntegrity(db);
    expect(good).toMatchObject({ ok: true, exchangeRateRecordCount: 2 });
    await db.exchangeRates.put(damaged);
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.checks.find((check) => check.id === 'exchange-rate-record-shape')).toMatchObject({ ok: false, tier: 'secondary' });
    expect(report.coreOk).toBe(true);
    const snapshot = await createKairosDatabaseSnapshotWithReport(db);
    expect(snapshot.skipped.exchangeRates).toBe(1);
    expect(snapshot.envelope.payload.exchangeRates).toEqual([typedGbp]);
    expect(await db.exchangeRates.count()).toBe(2);
  });
});

describe('T-045b backup format 9', () => {
  it('exports format 9 with schema 10 and the rates sorted by id, which round-trips', async () => {
    const db = await current('export');
    await db.exchangeRates.bulkPut([typedGbp, ecbUsd]);
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot).toMatchObject({ formatVersion: 9, databaseSchemaVersion: 10, recordCounts: { exchangeRates: 2 } });
    expect(snapshot.payload.exchangeRates).toEqual([ecbUsd, typedGbp]);
    expect(parseKairosBackup(serializeKairosBackup(snapshot))).toEqual(snapshot);
  });

  it('reads a format 8 backup as format 9 with its discipline record and no rates', () => {
    const parsed = parseKairosBackup(format8());
    expect(parsed).toMatchObject({ formatVersion: 9, databaseSchemaVersion: 10, recordCounts: { exchangeRates: 0 } });
    expect(parsed.payload.tradeDiscipline).toEqual([plain]);
    expect(parsed.payload.exchangeRates).toEqual([]);
  });

  it('restores a format 8 backup: the rates are replaced by none, the discipline record is kept', async () => {
    const db = await current('restore-8');
    await db.exchangeRates.put(ecbUsd);
    const prepared = await prepareBackupRestore(db, format8());
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.exchangeRates.count()).toBe(0);
    expect(await db.tradeDiscipline.toArray()).toEqual([plain]);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('reads a format 1 metadata-only backup as format 9 with no rates', () => {
    const legacy = { ...header, formatVersion: 1, databaseSchemaVersion: 1, recordCounts: { metadata: 0, total: 0 }, payload: { metadata: [] } };
    const parsed = parseKairosBackup(JSON.stringify(legacy));
    expect(parsed).toMatchObject({ formatVersion: 9, databaseSchemaVersion: 10 });
    expect(parsed.payload.exchangeRates).toEqual([]);
  });

  it('restores a format 9 backup with exactly its rates', async () => {
    const source = await current('source');
    await source.exchangeRates.put(typedGbp);
    const text = serializeKairosBackup(await createKairosDatabaseSnapshot(source));
    const db = await current('restore-9');
    const prepared = await prepareBackupRestore(db, text);
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.exchangeRates.toArray()).toEqual([typedGbp]);
  });

  it('refuses a damaged rate, a wrong header, a wrong count, a repeated id and format 10', async () => {
    const withDamaged = format9([ecbUsd]);
    (withDamaged.payload as { exchangeRates: unknown[] }).exchangeRates = [damaged];
    expect(() => parseKairosBackup(JSON.stringify(withDamaged))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    expect(() => parseKairosBackup(JSON.stringify({ ...format9([ecbUsd]), databaseSchemaVersion: 9 }))).toThrow(expect.objectContaining({ code: 'INVALID_HEADER' }));
    const wrongCount = format9([ecbUsd]);
    wrongCount.recordCounts.exchangeRates = 2;
    expect(() => parseKairosBackup(JSON.stringify(wrongCount))).toThrow(expect.objectContaining({ code: 'INVALID_RECORD_COUNTS' }));
    const db = await current('duplicate');
    expect(await prepareBackupRestore(db, JSON.stringify(format9([ecbUsd, ecbUsd])))).toMatchObject({ ok: false, type: 'incompatible-backup', code: 'DUPLICATE_EXCHANGE_RATE_ID' });
    expect(() => parseKairosBackup(JSON.stringify({ ...format9([]), formatVersion: 10 }))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
  });

  it('a merge import adds the trade and leaves rates alone', async () => {
    const db = await current('merge');
    const text = JSON.stringify(format9([ecbUsd]));
    const trades = await prepareTradeImport(db, text);
    if (!trades.ok) throw new Error(trades.type);
    expect((await commitTradeImport(db, trades.import)).ok).toBe(true);
    expect(await db.trades.count()).toBe(1);
    const saved = await prepareSavedRecordImport(db, text);
    if (!saved.ok) throw new Error(saved.type);
    expect(await commitSavedRecordImport(db, saved.import)).toEqual({ ok: true, added: { analyses: 0, snapshots: 0 }, skipped: 0 });
    expect(await db.exchangeRates.count()).toBe(0);
  });
});
