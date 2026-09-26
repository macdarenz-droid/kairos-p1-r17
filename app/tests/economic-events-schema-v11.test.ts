import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, commitSavedRecordImport, commitTradeImport, prepareBackupRestore, prepareSavedRecordImport, prepareTradeImport } from '../src/application/backup';
import { KAIROS_BACKUP_FORMAT_NAME, createKairosBackupEnvelope, createKairosDatabaseSnapshot, createKairosDatabaseSnapshotWithReport, parseKairosBackup, serializeKairosBackup } from '../src/data/backup';
import { KAIROS_DATABASE_MIGRATIONS, KAIROS_V11_STORES, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import type { DecimalString, TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-news-v11-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const tradeId = 'trade-p34-2' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T08:00:00.000Z', closedAt: '2026-09-18T09:30:00.000Z', createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T09:30:00.000Z' };
const plain: TradeDisciplineRecord = {
  id: 'discipline-p34-2' as TradeDisciplineId, tradeId,
  preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }],
  postTradeReview: [], mistakes: [], note: '',
  checklistCompletedAt: '2026-09-18T07:55:00.000Z', reviewedAt: null,
  createdAt: '2026-09-18T07:55:00.000Z', updatedAt: '2026-09-18T07:55:00.000Z',
};
const header = { formatName: KAIROS_BACKUP_FORMAT_NAME, appVersion: 'old', buildId: 'old', exportedAt: '2026-09-21T00:00:00.000Z' };
const savedAt = '2026-09-19T08:00:00.000Z';
const ecbUsd: ExchangeRateRecord = { id: exchangeRateId('ecb', 'EUR', 'USD', '2026-09-18'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.146' as DecimalString, savedAt };

const cpi: EconomicEventRecord = { id: economicEventId('typed', 'cpi'), source: 'typed', title: 'US CPI', currency: 'USD', startsAt: '2026-09-24T12:30:00.000Z', impact: 'high', expected: '3.1%', previous: '2.9%', actual: null, savedAt };
const speech: EconomicEventRecord = { id: economicEventId('typed', 'speech'), source: 'typed', title: 'ECB President speaks', currency: 'EUR', startsAt: '2026-09-24T09:00:00.000Z', impact: 'medium', expected: null, previous: null, actual: null, savedAt };
const damagedEvent = { ...cpi, id: economicEventId('typed', 'bad'), title: '' } as EconomicEventRecord;

const format8 = () => JSON.stringify({
  ...header, formatVersion: 8, databaseSchemaVersion: 9,
  recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, total: 2 },
  payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [plain] },
});
const format9 = () => JSON.stringify({
  ...header, formatVersion: 9, databaseSchemaVersion: 10,
  recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, exchangeRates: 1, total: 3 },
  payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [plain], exchangeRates: [ecbUsd] },
});
const format10 = (events: readonly unknown[], trades: readonly TradeRecord[] = []) => {
  const envelope = createKairosBackupEnvelope({ metadata: [], trades, economicEvents: events as EconomicEventRecord[], exportedAt: new Date('2026-09-21T00:00:00.000Z') });
  return JSON.parse(JSON.stringify(envelope)) as Record<string, unknown> & { recordCounts: Record<string, number> };
};

describe('T-046b schema v11: news is stored', () => {
  it('upgrades a v10 database with an empty news store', async () => {
    const name = newName('upgrade');
    const old = new Dexie(name);
    registerKairosMigrations(old, KAIROS_DATABASE_MIGRATIONS.slice(0, 10), 10);
    await old.open();
    await old.table('trades').put(trade);
    await old.table('exchangeRates').put(ecbUsd);
    old.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 11 });
    expect(await db.trades.toArray()).toEqual([trade]);
    expect(await db.exchangeRates.toArray()).toEqual([ecbUsd]);
    expect(await db.economicEvents.count()).toBe(0);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    expect(KAIROS_DATABASE_MIGRATIONS[10]).toEqual({ version: 11, stores: KAIROS_V11_STORES });
  });

  it('reads news by the instant it is scheduled, both ends included', async () => {
    const db = await current('repository');
    const events = createKairosRepositories(db).economicEvents;
    await events.put(cpi);
    await events.put(speech);
    const between = await events.listStartingBetween('2026-09-24T09:00:00.000Z', '2026-09-24T12:30:00.000Z');
    expect(between.sort((a, b) => a.id.localeCompare(b.id))).toEqual([cpi, speech]);
    expect(await events.listStartingBetween('2026-09-24T09:00:00.001Z', '2026-09-24T12:29:59.999Z')).toEqual([]);
    expect(await events.count()).toBe(2);
    expect(await events.get(cpi.id)).toEqual(cpi);
    await events.delete(cpi.id);
    expect(await events.count()).toBe(1);
  });

  it('checks news in the secondary tier, and a backup leaves a damaged event out', async () => {
    const db = await current('integrity');
    await db.economicEvents.bulkPut([cpi, speech]);
    expect(await inspectKairosDatabaseIntegrity(db)).toMatchObject({ ok: true, economicEventRecordCount: 2 });
    await db.economicEvents.put(damagedEvent);
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.checks.find((check) => check.id === 'economic-event-record-shape')).toMatchObject({ ok: false, tier: 'secondary' });
    expect(report.coreOk).toBe(true);
    const snapshot = await createKairosDatabaseSnapshotWithReport(db);
    expect(snapshot.skipped.economicEvents).toBe(1);
    expect(snapshot.envelope.payload.economicEvents).toEqual([cpi, speech]);
    expect(await db.economicEvents.count()).toBe(3);
  });
});

describe('T-046b backup format 10', () => {
  it('exports format 10 with schema 11 and the news sorted by id, which round-trips', async () => {
    const db = await current('export');
    await db.economicEvents.bulkPut([speech, cpi]);
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11, recordCounts: { economicEvents: 2 } });
    expect(snapshot.payload.economicEvents).toEqual([cpi, speech]);
    expect(parseKairosBackup(serializeKairosBackup(snapshot))).toEqual(snapshot);
  });

  it('reads a format 9 backup as format 10 with its discipline record and rate, and no news', () => {
    const parsed = parseKairosBackup(format9());
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11, recordCounts: { exchangeRates: 1, economicEvents: 0, total: 3 } });
    expect(parsed.payload.tradeDiscipline).toEqual([plain]);
    expect(parsed.payload.exchangeRates).toEqual([ecbUsd]);
    expect(parsed.payload.economicEvents).toEqual([]);
  });

  it('restores a format 9 backup: the news is replaced by none, the discipline record and rate are kept', async () => {
    const db = await current('restore-9');
    await db.economicEvents.put(cpi);
    const prepared = await prepareBackupRestore(db, format9());
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.economicEvents.count()).toBe(0);
    expect(await db.tradeDiscipline.toArray()).toEqual([plain]);
    expect(await db.exchangeRates.toArray()).toEqual([ecbUsd]);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('reads a format 8 backup as format 10 with its discipline record, no rates and no news', () => {
    const parsed = parseKairosBackup(format8());
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11 });
    expect(parsed.payload.tradeDiscipline).toEqual([plain]);
    expect(parsed.payload.exchangeRates).toEqual([]);
    expect(parsed.payload.economicEvents).toEqual([]);
  });

  it('reads a format 1 metadata-only backup as format 10 with no news', () => {
    const legacy = { ...header, formatVersion: 1, databaseSchemaVersion: 1, recordCounts: { metadata: 0, total: 0 }, payload: { metadata: [] } };
    const parsed = parseKairosBackup(JSON.stringify(legacy));
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 11 });
    expect(parsed.payload.economicEvents).toEqual([]);
  });

  it('restores a format 10 backup with exactly its news', async () => {
    const source = await current('source');
    await source.economicEvents.put(cpi);
    const text = serializeKairosBackup(await createKairosDatabaseSnapshot(source));
    const db = await current('restore-10');
    const prepared = await prepareBackupRestore(db, text);
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.economicEvents.toArray()).toEqual([cpi]);
  });

  it('refuses a damaged event, a wrong header, a wrong count, a repeated id and format 11', async () => {
    const withDamaged = format10([cpi]);
    (withDamaged.payload as { economicEvents: unknown[] }).economicEvents = [damagedEvent];
    expect(() => parseKairosBackup(JSON.stringify(withDamaged))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    expect(() => parseKairosBackup(JSON.stringify({ ...format10([cpi]), databaseSchemaVersion: 10 }))).toThrow(expect.objectContaining({ code: 'INVALID_HEADER' }));
    const wrongCount = format10([cpi]);
    wrongCount.recordCounts.economicEvents = 2;
    expect(() => parseKairosBackup(JSON.stringify(wrongCount))).toThrow(expect.objectContaining({ code: 'INVALID_RECORD_COUNTS' }));
    const db = await current('duplicate');
    expect(await prepareBackupRestore(db, JSON.stringify(format10([cpi, cpi])))).toMatchObject({ ok: false, type: 'incompatible-backup', code: 'DUPLICATE_ECONOMIC_EVENT_ID' });
    expect(() => parseKairosBackup(JSON.stringify({ ...format10([]), formatVersion: 11 }))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
  });

  it('a merge import adds the trade and leaves news alone', async () => {
    const db = await current('merge');
    const text = JSON.stringify(format10([cpi], [trade]));
    const trades = await prepareTradeImport(db, text);
    if (!trades.ok) throw new Error(trades.type);
    expect((await commitTradeImport(db, trades.import)).ok).toBe(true);
    expect(await db.trades.count()).toBe(1);
    const saved = await prepareSavedRecordImport(db, text);
    if (!saved.ok) throw new Error(saved.type);
    expect(await commitSavedRecordImport(db, saved.import)).toEqual({ ok: true, added: { analyses: 0, snapshots: 0 }, skipped: 0 });
    expect(await db.economicEvents.count()).toBe(0);
  });
});
