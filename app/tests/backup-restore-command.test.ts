import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { commitBackupRestore, exportKairosBackup, KAIROS_BACKUP_RESTORE_MAX_BYTES, prepareBackupRestore } from '../src/application/backup';
import { createKairosBackupEnvelope, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { MetadataRepository } from '../src/data/repositories/MetadataRepository';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p28-2-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const incoming = (exportedAt = new Date('2026-09-17T08:00:00.000Z')) => serializeKairosBackup(createKairosBackupEnvelope({
  metadata: [{ key: 'preferences.goals.v1', value: '{"version":1,"tradesPerMonth":20}', updatedAt: '2026-09-17T07:59:00.000Z' }],
  savedAnalyses: [defineSavedAnalysis({ id: 'a-incoming', market: eth, drawings: [], riskRewards: [], label: 'Restored plan' })],
  exportedAt,
}));

async function device(label: string) {
  const db = createKairosDatabase(dbName(label));
  await db.open();
  await db.metadata.bulkPut([
    { key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: '2026-09-01T00:00:00.000Z' },
    { key: 'device.activation.receipt', value: 'opaque', updatedAt: '2026-09-01T00:00:00.000Z' },
  ]);
  await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-current', market: eth, drawings: [], riskRewards: [], label: 'Current plan' }));
  return db;
}

describe('P28.2 backup restore command', () => {
  it('prepares a restore: preview of the incoming backup, a downloadable pre-restore copy, nothing written', async () => {
    const db = await device('prepare');
    const result = await prepareBackupRestore(db, incoming());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.restore.preview).toMatchObject({ formatVersion: 7, databaseSchemaVersion: 8, exportedAt: '2026-09-17T08:00:00.000Z', metadataRecords: 1, savedAnalysisRecords: 1, totalRecords: 2 });
    expect(result.restore.recoveryFile.fileName).toMatch(/^kairos-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/);
    expect(result.restore.recoveryFile.mediaType).toBe('application/json');
    expect(result.restore.recoveryFile.recordCounts).toMatchObject({ metadata: 1, savedAnalyses: 1, total: 2 });
    expect(result.restore.recoveryFile.contents).toBe(result.restore.prepared.recovery.serialized);
    expect(result.restore.recoveryFile.byteLength).toBe(new TextEncoder().encode(result.restore.recoveryFile.contents).byteLength);
    expect(Object.isFrozen(result.restore)).toBe(true);
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
    expect((await db.metadata.toArray()).map(record => record.key).sort()).toEqual(['device.activation.receipt', 'preferences.goals.v1']);
    db.close();
  });

  it('commits a prepared restore through the released atomic replacement and reopen verification', async () => {
    const db = await device('commit');
    const prepared = await prepareBackupRestore(db, incoming());
    if (!prepared.ok) throw new Error('unreachable');
    const result = await commitBackupRestore(db, prepared.restore);
    expect(result).toEqual({ ok: true, restored: { restoredMetadataRecords: 1, restoredTradeRecords: 0, restoredSavedAnalysisRecords: 1, restoredSavedTimeAssistedSnapshotRecords: 0, restoredTradeDisciplineRecords: 0, reloadedTotalRecords: 2, verifiedAfterReload: true } });
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-incoming']);
    expect((await db.metadata.toArray()).map(record => record.key).sort()).toEqual(['device.activation.receipt', 'preferences.goals.v1']);
    const exported = await exportKairosBackup(db, new Date('2026-09-18T16:00:00.000Z'));
    expect(exported.ok && exported.file.recordCounts.total).toBe(2);
    db.close();
  });

  it('refuses an over-size file before reading it as a backup', async () => {
    const db = await device('size');
    const transaction = vi.spyOn(db, 'transaction');
    const result = await prepareBackupRestore(db, 'x'.repeat(KAIROS_BACKUP_RESTORE_MAX_BYTES + 1));
    expect(result).toEqual({ ok: false, type: 'invalid-input', reason: 'backup-file-too-large', byteLength: KAIROS_BACKUP_RESTORE_MAX_BYTES + 1 });
    expect(transaction).not.toHaveBeenCalled();
    db.close();
  });

  it('reports an unreadable backup by its validation code and an incompatible one by its preflight code, writing nothing', async () => {
    const db = await device('refused');
    expect(await prepareBackupRestore(db, 'not json')).toEqual({ ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: 'INVALID_JSON' });
    expect(await prepareBackupRestore(db, JSON.stringify({ formatName: 'other', formatVersion: 4 }))).toEqual({ ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: 'FORMAT_NAME_MISMATCH' });
    const duplicate = JSON.parse(incoming()) as { payload: { metadata: unknown[] }; recordCounts: { metadata: number; total: number } };
    duplicate.payload.metadata.push(duplicate.payload.metadata[0]);
    duplicate.recordCounts.metadata = 2; duplicate.recordCounts.total = 3;
    expect(await prepareBackupRestore(db, JSON.stringify(duplicate))).toEqual({ ok: false, type: 'incompatible-backup', reason: 'restore-preflight-refused', code: 'DUPLICATE_METADATA_KEY' });
    expect((await db.savedAnalyses.toArray()).map(record => record.id)).toEqual(['a-current']);
    db.close();
  });

  it('reports a failed pre-restore integrity check and a storage failure while preparing', async () => {
    const db = await device('integrity');
    await db.metadata.put({ key: 'broken' } as never);
    // T-030: damaged current data no longer blocks a restore; the recovery file becomes a raw copy.
    expect(await prepareBackupRestore(db, incoming())).toMatchObject({ ok: true, restore: { recoveryKind: 'raw' } });
    await db.metadata.delete('broken');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await prepareBackupRestore(db, incoming())).toEqual({ ok: false, type: 'storage-error', reason: 'restore-prepare-failed' });
    db.close();
  });

  it('carries the pre-restore copy on a verification failure after commit', async () => {
    const db = await device('verify');
    const prepared = await prepareBackupRestore(db, incoming());
    if (!prepared.ok) throw new Error('unreachable');
    vi.spyOn(MetadataRepository.prototype, 'listAll').mockImplementation(async function (this: MetadataRepository) {
      return [{ key: 'preferences.goals.v1', value: 'tampered', updatedAt: '2026-09-17T07:59:00.000Z' }];
    });
    const result = await commitBackupRestore(db, prepared.restore);
    expect(result).toEqual({ ok: false, type: 'verification-error', reason: 'restore-verification-failed', code: 'REQUERY_MISMATCH', recoveryFile: prepared.restore.recoveryFile });
    db.close();
  });

  it('carries the pre-restore copy on a storage failure during replacement', async () => {
    const db = await device('storage');
    const prepared = await prepareBackupRestore(db, incoming());
    if (!prepared.ok) throw new Error('unreachable');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    const result = await commitBackupRestore(db, prepared.restore);
    expect(result).toEqual({ ok: false, type: 'storage-error', reason: 'restore-replacement-failed', recoveryFile: prepared.restore.recoveryFile });
    expect(prepared.restore.recoveryFile.contents).toContain('a-current');
    db.close();
  });
});
