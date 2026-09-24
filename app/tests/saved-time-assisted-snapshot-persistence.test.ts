import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defineSavedTimeAssistedSnapshot, type SavedTimeAssistedSnapshot } from '../src/app/savedTimeAssistedSnapshotContract';
import { KAIROS_BACKUP_FORMAT_NAME, KairosRestorePreflightError, createKairosBackupEnvelope, createKairosDatabaseSnapshot, parseKairosBackup, preflightKairosRestore, prepareKairosRestore, replaceKairosDatabaseFromPreparedRestore, restoreAndVerifyKairosDatabase, serializeKairosBackup } from '../src/data/backup';
import { DatabaseIntegrityError, KAIROS_DB_SCHEMA_VERSION, KAIROS_V5_STORES, assertKairosDatabaseIntegrity, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p23-2-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candle = { openTime: '2026-09-10T02:13:00.000Z', closeTime: '2026-09-10T02:13:59.999Z', open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString };
const snapshot = defineSavedTimeAssistedSnapshot({
  id: 'saved-snapshot-p23-2',
  market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' },
  side: 'long',
  openedAt: '2026-09-10T04:13:27',
  openedAtUtc: '2026-09-10T02:13:27.000Z',
  closedAt: '2026-09-10T06:30:05',
  closedAtUtc: '2026-09-10T04:30:05.000Z',
  inputTimeZone: 'Europe/Berlin',
  opening: { kind: 'candle-range', isEstimate: true, source: 'market-reference', method: 'containing-candle', resolution: '1m', instrument, requestedAt: '2026-09-10T04:13:27', requestedAtUtc: '2026-09-10T02:13:27.000Z', candle, gapMs: 27_000, acquiredAt: '2026-09-17T12:00:00.000Z' },
  closing: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T06:30:05', reason: 'no-candle' },
  durationMs: 8_198_000,
  savedAt: '2026-09-18T03:30:00.000Z',
  isEstimate: true,
  source: 'market-reference',
});

describe('P23.2 saved time-assisted snapshot persistence foundation', () => {
  it('appends schema v5 with the stable-id snapshot store and keeps v4 history intact', async () => {
    expect(KAIROS_DB_SCHEMA_VERSION).toBe(6); // P36.1 pin advanced at Gate531: schema v6 appends the trade discipline store; the v5 store below is unchanged.
    expect(KAIROS_V5_STORES).toEqual({ savedTimeAssistedSnapshots: '&id' });
    const db = createKairosDatabase(dbName('schema'));
    await expect(openKairosDatabase(db)).resolves.toEqual({ state: 'ready', schemaVersion: 6 });
    expect(db.savedTimeAssistedSnapshots.schema.primKey.keyPath).toBe('id');
    expect(db.savedAnalyses.schema.primKey.keyPath).toBe('id');
    db.close();
  });

  it('persists the P23.1 contract verbatim through its repository with clone-safe reads', async () => {
    const db = createKairosDatabase(dbName('repo'));
    await openKairosDatabase(db);
    const repo = createKairosRepositories(db).savedTimeAssistedSnapshots;
    await repo.put(snapshot);
    const loaded = await repo.get(snapshot.id);
    expect(loaded).toEqual(snapshot);
    expect(loaded).not.toBe(snapshot);
    expect(JSON.stringify(loaded)).not.toMatch(/"price"|"pnl"|"result"|executionId|tradeId/);
    await expect(repo.listAll()).resolves.toEqual([snapshot]);
    await expect(assertKairosDatabaseIntegrity(db)).resolves.toMatchObject({ ok: true, schemaVersion: 6, savedTimeAssistedSnapshotRecordCount: 1 });
    await repo.delete(snapshot.id);
    await expect(repo.get(snapshot.id)).resolves.toBeUndefined();
    db.close();
  });

  it('fails integrity closed on a malformed stored snapshot', async () => {
    const db = createKairosDatabase(dbName('integrity'));
    await openKairosDatabase(db);
    await db.savedTimeAssistedSnapshots.put({ ...snapshot, isEstimate: false as unknown as true });
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'saved-time-assisted-snapshot-record-shape')).toMatchObject({ ok: false });
    await expect(assertKairosDatabaseIntegrity(db)).rejects.toThrow(DatabaseIntegrityError);
    db.close();
  });

  it('round-trips a saved snapshot through current backup V5 and counts it in the envelope', async () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], savedTimeAssistedSnapshots: [snapshot] });
    const parsed = parseKairosBackup(serializeKairosBackup(envelope));
    expect(parsed).toMatchObject({ formatVersion: 5, databaseSchemaVersion: 6, recordCounts: { savedAnalyses: 0, savedTimeAssistedSnapshots: 1, total: 1 } });
    expect(parsed.payload.savedTimeAssistedSnapshots).toEqual([snapshot]);
    const db = createKairosDatabase(dbName('snapshot'));
    await openKairosDatabase(db);
    await createKairosRepositories(db).savedTimeAssistedSnapshots.put(snapshot);
    const exported = await createKairosDatabaseSnapshot(db);
    expect(exported.recordCounts).toMatchObject({ savedTimeAssistedSnapshots: 1, total: 1 });
    expect(exported.payload.savedTimeAssistedSnapshots).toEqual([snapshot]);
    db.close();
  });

  it('migrates a released V3 backup to the current format with an empty snapshot store', () => {
    const legacyV3 = { formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 3, appVersion: 'old-v3', buildId: 'old-v3', exportedAt: '2026-09-17T08:30:00.000Z', databaseSchemaVersion: 4, recordCounts: { metadata: 0, trades: 0, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, total: 0 }, payload: { metadata: [], trades: [], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [] } };
    const migrated = parseKairosBackup(JSON.stringify(legacyV3));
    expect(migrated).toMatchObject({ formatVersion: 5, databaseSchemaVersion: 6, recordCounts: { savedTimeAssistedSnapshots: 0, total: 0 } });
    expect(migrated.payload.savedTimeAssistedSnapshots).toEqual([]);
  });

  it('rejects malformed snapshot payloads and duplicate snapshot ids before any replacement', () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], savedTimeAssistedSnapshots: [snapshot] });
    expect(() => parseKairosBackup(JSON.stringify({ ...envelope, payload: { ...envelope.payload, savedTimeAssistedSnapshots: [{ ...snapshot, source: 'manual' }] } }))).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    const duplicated = { ...envelope, recordCounts: { ...envelope.recordCounts, savedTimeAssistedSnapshots: 2, total: 2 }, payload: { ...envelope.payload, savedTimeAssistedSnapshots: [snapshot, snapshot] } };
    expect(() => preflightKairosRestore(JSON.stringify(duplicated))).toThrowError(expect.objectContaining({ code: 'DUPLICATE_SAVED_TIME_ASSISTED_SNAPSHOT_ID' }));
    expect(() => preflightKairosRestore(JSON.stringify(duplicated))).toThrow(KairosRestorePreflightError);
  });

  it('replaces saved snapshots atomically from a prepared restore and verifies the reload', async () => {
    const db = createKairosDatabase(dbName('restore'));
    await openKairosDatabase(db);
    const current = defineSavedTimeAssistedSnapshot({ ...snapshot, id: 'current-snapshot' });
    await createKairosRepositories(db).savedTimeAssistedSnapshots.put(current);
    const incoming: SavedTimeAssistedSnapshot = defineSavedTimeAssistedSnapshot({ ...snapshot, id: 'incoming-snapshot' });
    const prepared = await prepareKairosRestore(db, serializeKairosBackup(createKairosBackupEnvelope({ metadata: [], savedTimeAssistedSnapshots: [incoming] })));
    expect(prepared.preview.savedTimeAssistedSnapshotRecords).toBe(1);
    expect(prepared.recovery.envelope.payload.savedTimeAssistedSnapshots).toEqual([current]);
    const result = await replaceKairosDatabaseFromPreparedRestore(db, prepared);
    expect(result.restoredSavedTimeAssistedSnapshotRecords).toBe(1);
    expect(await db.savedTimeAssistedSnapshots.toArray()).toEqual([incoming]);
    const verified = await restoreAndVerifyKairosDatabase(db, await prepareKairosRestore(db, serializeKairosBackup(createKairosBackupEnvelope({ metadata: [], savedTimeAssistedSnapshots: [incoming, current] }))));
    expect(verified).toMatchObject({ verifiedAfterReload: true, restoredSavedTimeAssistedSnapshotRecords: 2, reloadedTotalRecords: 2 });
    expect(verified.integrity).toMatchObject({ ok: true, savedTimeAssistedSnapshotRecordCount: 2 });
    db.close();
  });
});
