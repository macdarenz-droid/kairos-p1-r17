import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, lastBackupMetadataKey, prepareBackupRestore, prepareTradeImport, readLastBackup, recordLastBackup } from '../src/application/backup';
import { createKairosBackupEnvelope, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories, isKairosDeviceScopedMetadataKey } from '../src/data/repositories';

const names: string[] = [];
async function database(label: string) { const name = `kairos-p34-1-${label}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const moment = new Date('2026-09-18T17:40:00.000Z');

describe('P34.1 last-backup record', () => {
  it('reads never until a backup file is recorded, then reads the file facts back', async () => {
    const db = await database('record');
    const { metadata } = createKairosRepositories(db);
    expect(await readLastBackup(metadata)).toBeNull();
    const exported = await exportKairosBackup(db, moment);
    if (!exported.ok) throw new Error('fixture');
    expect(await recordLastBackup(metadata, exported.file)).toEqual({ ok: true, record: { exportedAt: '2026-09-18T17:40:00.000Z', fileName: 'kairos-backup-2026-09-18T17-40-00Z.json', totalRecords: 0 } });
    expect(await readLastBackup(metadata)).toEqual({ exportedAt: '2026-09-18T17:40:00.000Z', fileName: 'kairos-backup-2026-09-18T17-40-00Z.json', totalRecords: 0 });
    expect(isKairosDeviceScopedMetadataKey(lastBackupMetadataKey)).toBe(true);
    expect((await metadata.get(lastBackupMetadataKey))?.updatedAt).toBe('2026-09-18T17:40:00.000Z');
  });

  it('stays out of backups and survives a restore and an import untouched', async () => {
    const db = await database('scope');
    const { metadata } = createKairosRepositories(db);
    const exported = await exportKairosBackup(db, moment);
    if (!exported.ok) throw new Error('fixture');
    await recordLastBackup(metadata, exported.file);
    const again = await exportKairosBackup(db, new Date('2026-09-18T17:45:00.000Z'));
    if (!again.ok) throw new Error('fixture');
    expect(again.file.recordCounts.metadata).toBe(0);
    expect(again.file.contents.includes(lastBackupMetadataKey)).toBe(false);
    const incoming = serializeKairosBackup(createKairosBackupEnvelope({ metadata: [{ key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: '2026-09-17T00:00:00.000Z' }], exportedAt: new Date('2026-09-17T08:00:00.000Z') }));
    const prepared = await prepareBackupRestore(db, incoming);
    if (!prepared.ok) throw new Error('fixture');
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await readLastBackup(metadata)).toMatchObject({ fileName: 'kairos-backup-2026-09-18T17-40-00Z.json' });
    const importPrepared = await prepareTradeImport(db, incoming);
    if (!importPrepared.ok) throw new Error('fixture');
    expect((await commitTradeImport(db, importPrepared.import)).ok).toBe(true);
    expect(await readLastBackup(metadata)).toMatchObject({ fileName: 'kairos-backup-2026-09-18T17-40-00Z.json' });
  });

  it('reads a malformed record as never and reports a storage failure explicitly', async () => {
    const db = await database('malformed');
    const { metadata } = createKairosRepositories(db);
    await metadata.put({ key: lastBackupMetadataKey, value: 'not json', updatedAt: '2026-09-18T17:40:00.000Z' });
    expect(await readLastBackup(metadata)).toBeNull();
    await metadata.put({ key: lastBackupMetadataKey, value: '{"version":1,"exportedAt":"yesterday","fileName":"x.json","totalRecords":1}', updatedAt: '2026-09-18T17:40:00.000Z' });
    expect(await readLastBackup(metadata)).toBeNull();
    const exported = await exportKairosBackup(db, moment);
    if (!exported.ok) throw new Error('fixture');
    vi.spyOn(db.metadata, 'put').mockRejectedValue(new Error('quota'));
    expect(await recordLastBackup(metadata, exported.file)).toEqual({ ok: false, type: 'storage-error', reason: 'last-backup-record-failed' });
  });
});
