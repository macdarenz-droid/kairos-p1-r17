import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { KAIROS_BACKUP_FORMAT_NAME, KairosRestorePreflightError, createKairosBackupEnvelope, createKairosDatabaseSnapshot, parseKairosBackup, preflightKairosRestore, prepareKairosRestore, replaceKairosDatabaseFromPreparedRestore, restoreAndVerifyKairosDatabase, serializeKairosBackup } from '../src/data/backup';
import { DatabaseIntegrityError, KAIROS_DB_SCHEMA_VERSION, KAIROS_V5_STORES, KAIROS_V6_STORES, assertKairosDatabaseIntegrity, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, runKairosAtomicWrite } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { KAIROS_DISCIPLINE_MISTAKE_TAGS, KAIROS_DISCIPLINE_NOTE_MAX_LENGTH, KAIROS_POST_TRADE_REVIEW_KEYS, KAIROS_PRE_TRADE_CHECKLIST_KEYS, createTradeDisciplineId, isTradeDisciplineRecordShape, validateTradeDisciplineRecord, type TradeDisciplineId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p36-1-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const tradeId = 'trade-p36-1' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-19T08:00:00.000Z', closedAt: '2026-09-19T09:30:00.000Z', createdAt: '2026-09-19T08:00:00.000Z', updatedAt: '2026-09-19T09:30:00.000Z' };
const discipline: TradeDisciplineRecord = {
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

async function seedTrade(db: ReturnType<typeof createKairosDatabase>, record: TradeRecord = trade) {
  await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { await repositories.trades.put(record); });
}

describe('P36.1 trade discipline record foundation', () => {
  it('fixes the checklist, review and mistake vocabularies and validates the record shape closed', () => {
    expect(KAIROS_PRE_TRADE_CHECKLIST_KEYS).toEqual(['plan-written', 'risk-defined', 'stop-placed', 'size-within-limit', 'setup-matches-rules']);
    expect(KAIROS_POST_TRADE_REVIEW_KEYS).toEqual(['followed-plan', 'respected-stop', 'exit-per-plan', 'emotions-in-check']);
    expect(KAIROS_DISCIPLINE_MISTAKE_TAGS).toEqual(['no-plan', 'moved-stop', 'oversized', 'chased-entry', 'early-exit', 'late-exit', 'revenge-trade', 'ignored-rules']);
    expect(KAIROS_DISCIPLINE_NOTE_MAX_LENGTH).toBe(500);
    expect(validateTradeDisciplineRecord(discipline)).toEqual({ ok: true, value: discipline });
    expect(isTradeDisciplineRecordShape({ ...discipline, preTradeChecklist: [], postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: null, reviewedAt: null })).toBe(true);
    for (const broken of [
      { ...discipline, preTradeChecklist: [{ key: 'plan-written', answer: 'maybe' }] },
      { ...discipline, preTradeChecklist: [{ key: 'unknown', answer: 'yes' }] },
      { ...discipline, preTradeChecklist: [{ key: 'plan-written', answer: 'yes' }, { key: 'plan-written', answer: 'no' }] },
      { ...discipline, postTradeReview: [{ key: 'plan-written', answer: 'yes' }] },
      { ...discipline, mistakes: ['moved-stop', 'moved-stop'] },
      { ...discipline, mistakes: ['fomo'] },
      { ...discipline, note: 'x'.repeat(KAIROS_DISCIPLINE_NOTE_MAX_LENGTH + 1) },
      { ...discipline, reviewedAt: '2026-09-19 10:00' },
      { ...discipline, updatedAt: '2026-09-19T07:00:00.000Z' },
      { ...discipline, tradeId: '' },
    ]) expect(isTradeDisciplineRecordShape(broken)).toBe(false);
    expect(validateTradeDisciplineRecord({ ...discipline, mistakes: ['fomo' as never] })).toEqual({ ok: false, reason: 'invalid-discipline-record' });
    const id = createTradeDisciplineId();
    expect(id).not.toBe(createTradeDisciplineId());
    expect(id).not.toBe(tradeId);
  });

  it('appends schema v6 with the one-per-trade discipline store and keeps v5 history intact', async () => {
    expect(KAIROS_DB_SCHEMA_VERSION).toBe(7);
    expect(KAIROS_V6_STORES).toEqual({ tradeDiscipline: '&id,tradeId,updatedAt' });
    expect(KAIROS_V5_STORES).toEqual({ savedTimeAssistedSnapshots: '&id' });
    const db = createKairosDatabase(dbName('schema'));
    await expect(openKairosDatabase(db)).resolves.toEqual({ state: 'ready', schemaVersion: 7 });
    expect(db.tradeDiscipline.schema.primKey.keyPath).toBe('id');
    expect(db.tradeDiscipline.schema.indexes.map((index) => index.name)).toEqual(['tradeId', 'updatedAt']);
    expect(db.savedTimeAssistedSnapshots.schema.primKey.keyPath).toBe('id');
    db.close();
  });

  it('persists the record verbatim through its repository with clone-safe reads and a tradeId lookup', async () => {
    const db = createKairosDatabase(dbName('repo'));
    await openKairosDatabase(db);
    await seedTrade(db);
    const repo = createKairosRepositories(db).tradeDiscipline;
    await repo.put(discipline);
    const loaded = await repo.get(discipline.id);
    expect(loaded).toEqual(discipline);
    expect(loaded).not.toBe(discipline);
    expect(JSON.stringify(loaded)).not.toMatch(/"price"|"pnl"|"result"|"quantity"|executionId/);
    await expect(repo.getByTradeId(tradeId)).resolves.toEqual(discipline);
    await expect(repo.getByTradeId('other-trade' as TradeId)).resolves.toBeUndefined();
    await expect(repo.listAll()).resolves.toEqual([discipline]);
    await expect(assertKairosDatabaseIntegrity(db)).resolves.toMatchObject({ ok: true, schemaVersion: 7, tradeRecordCount: 1, tradeDisciplineRecordCount: 1 });
    await repo.delete(discipline.id);
    await expect(repo.get(discipline.id)).resolves.toBeUndefined();
    db.close();
  });

  it('fails integrity closed on a malformed record, an orphan record and two records for one trade', async () => {
    const db = createKairosDatabase(dbName('integrity'));
    await openKairosDatabase(db);
    await seedTrade(db);
    await db.tradeDiscipline.put({ ...discipline, mistakes: ['fomo' as never] });
    let report = await inspectKairosDatabaseIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'trade-discipline-record-shape')).toMatchObject({ ok: false });
    await expect(assertKairosDatabaseIntegrity(db)).rejects.toThrow(DatabaseIntegrityError);
    await db.tradeDiscipline.put({ ...discipline, tradeId: 'missing-trade' as TradeId });
    report = await inspectKairosDatabaseIntegrity(db);
    expect(report.checks.find((check) => check.id === 'trade-discipline-record-shape')).toMatchObject({ ok: true });
    expect(report.checks.find((check) => check.id === 'trade-discipline-reference-integrity')).toMatchObject({ ok: false });
    await db.tradeDiscipline.put(discipline);
    await db.tradeDiscipline.put({ ...discipline, id: 'second-for-same-trade' as TradeDisciplineId });
    report = await inspectKairosDatabaseIntegrity(db);
    expect(report.checks.find((check) => check.id === 'trade-discipline-reference-integrity')).toMatchObject({ ok: false });
    expect(report.checks.find((check) => check.id === 'trade-discipline-primary-key')).toMatchObject({ ok: true });
    db.close();
  });

  it('round-trips a discipline record through current backup V5 and counts it in the envelope', async () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], trades: [trade], tradeDiscipline: [discipline] });
    const parsed = parseKairosBackup(serializeKairosBackup(envelope));
    expect(parsed).toMatchObject({ formatVersion: 6, databaseSchemaVersion: 7, recordCounts: { trades: 1, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, total: 2 } });
    expect(parsed.payload.tradeDiscipline).toEqual([discipline]);
    const db = createKairosDatabase(dbName('snapshot'));
    await openKairosDatabase(db);
    await seedTrade(db);
    await createKairosRepositories(db).tradeDiscipline.put(discipline);
    const exported = await createKairosDatabaseSnapshot(db);
    expect(exported.recordCounts).toMatchObject({ trades: 1, tradeDiscipline: 1, total: 2 });
    expect(exported.payload.tradeDiscipline).toEqual([discipline]);
    db.close();
  });

  it('migrates a released V4 backup to V5 with an empty discipline store and still accepts V1 through V3', () => {
    const legacyV4 = { formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 4, appVersion: 'old-v4', buildId: 'old-v4', exportedAt: '2026-09-18T08:30:00.000Z', databaseSchemaVersion: 5, recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, total: 1 }, payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [] } };
    const migrated = parseKairosBackup(JSON.stringify(legacyV4));
    expect(migrated).toMatchObject({ formatVersion: 6, databaseSchemaVersion: 7, recordCounts: { trades: 1, tradeDiscipline: 0, total: 1 } });
    expect(migrated.payload.tradeDiscipline).toEqual([]);
    expect(migrated.payload.trades).toEqual([trade]);
    const legacyV3 = { ...legacyV4, formatVersion: 3, databaseSchemaVersion: 4, recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, total: 1 }, payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [] } };
    expect(parseKairosBackup(JSON.stringify(legacyV3))).toMatchObject({ formatVersion: 6, databaseSchemaVersion: 7, recordCounts: { trades: 1, savedTimeAssistedSnapshots: 0, tradeDiscipline: 0, total: 1 } });
    const legacyV1 = { formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 1, appVersion: 'old', buildId: 'old', exportedAt: '2026-08-31T08:30:00.000Z', databaseSchemaVersion: 1, recordCounts: { metadata: 0, total: 0 }, payload: { metadata: [] } };
    expect(parseKairosBackup(JSON.stringify(legacyV1)).payload.tradeDiscipline).toEqual([]);
  });

  it('rejects malformed discipline payloads, duplicate ids, two records per trade and orphans before any replacement', () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], trades: [trade], tradeDiscipline: [discipline] });
    expect(() => parseKairosBackup(JSON.stringify({ ...envelope, payload: { ...envelope.payload, tradeDiscipline: [{ ...discipline, mistakes: ['fomo'] }] } }))).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    expect(() => parseKairosBackup(JSON.stringify({ ...envelope, recordCounts: { ...envelope.recordCounts, tradeDiscipline: 0 } }))).toThrowError(expect.objectContaining({ code: 'INVALID_RECORD_COUNTS' }));
    const duplicated = { ...envelope, recordCounts: { ...envelope.recordCounts, tradeDiscipline: 2, total: 3 }, payload: { ...envelope.payload, tradeDiscipline: [discipline, discipline] } };
    expect(() => preflightKairosRestore(JSON.stringify(duplicated))).toThrowError(expect.objectContaining({ code: 'DUPLICATE_TRADE_DISCIPLINE_ID' }));
    expect(() => preflightKairosRestore(JSON.stringify(duplicated))).toThrow(KairosRestorePreflightError);
    const twoPerTrade = { ...duplicated, payload: { ...envelope.payload, tradeDiscipline: [discipline, { ...discipline, id: 'second' }] } };
    expect(() => preflightKairosRestore(JSON.stringify(twoPerTrade))).toThrowError(expect.objectContaining({ code: 'DUPLICATE_TRADE_DISCIPLINE_TRADE_ID' }));
    const orphan = { ...envelope, recordCounts: { ...envelope.recordCounts, trades: 0, total: 1 }, payload: { ...envelope.payload, trades: [] } };
    expect(() => preflightKairosRestore(JSON.stringify(orphan))).toThrowError(expect.objectContaining({ code: 'INVALID_TRADE_REFERENCE' }));
  });

  it('replaces discipline records atomically from a prepared restore and verifies the reload', async () => {
    const db = createKairosDatabase(dbName('restore'));
    await openKairosDatabase(db);
    await seedTrade(db);
    const current: TradeDisciplineRecord = { ...discipline, id: 'current-discipline' as TradeDisciplineId };
    await createKairosRepositories(db).tradeDiscipline.put(current);
    const incoming: TradeDisciplineRecord = { ...discipline, id: 'incoming-discipline' as TradeDisciplineId, mistakes: [], note: '' };
    const prepared = await prepareKairosRestore(db, serializeKairosBackup(createKairosBackupEnvelope({ metadata: [], trades: [trade], tradeDiscipline: [incoming] })));
    expect(prepared.preview.tradeDisciplineRecords).toBe(1);
    expect(prepared.recovery.envelope.payload.tradeDiscipline).toEqual([current]);
    const result = await replaceKairosDatabaseFromPreparedRestore(db, prepared);
    expect(result.restoredTradeDisciplineRecords).toBe(1);
    expect(await db.tradeDiscipline.toArray()).toEqual([incoming]);
    const otherTrade: TradeRecord = { ...trade, id: 'trade-other' as TradeId };
    const verified = await restoreAndVerifyKairosDatabase(db, await prepareKairosRestore(db, serializeKairosBackup(createKairosBackupEnvelope({ metadata: [], trades: [trade, otherTrade], tradeDiscipline: [incoming, { ...current, tradeId: otherTrade.id }] }))));
    expect(verified).toMatchObject({ verifiedAfterReload: true, restoredTradeRecords: 2, restoredTradeDisciplineRecords: 2, reloadedTotalRecords: 4 });
    expect(verified.integrity).toMatchObject({ ok: true, tradeDisciplineRecordCount: 2 });
    db.close();
  });
});
