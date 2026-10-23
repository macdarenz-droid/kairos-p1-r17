import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeBackupFailure, readLastBackup, runBackup, type BackupDeliveryOutcome, type KairosBackupFile } from '../src/application/backup';
import { parseKairosBackup } from '../src/data/backup';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-run-backup-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';
const port = (outcome: BackupDeliveryOutcome) => {
  const files: KairosBackupFile[] = [];
  return { files, deliver: async (file: KairosBackupFile) => { files.push(file); return outcome; } };
};

describe('T-054a one backup run', () => {
  it('exports, hands the file over, and records the last backup when it was saved', async () => {
    const db = await database();
    await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' }, { now });
    const { files, deliver } = port('saved');
    const result = await runBackup(db, deliver, { now });
    expect(result).toMatchObject({ ok: true, skippedCount: 0, record: { exportedAt: now(), fileName: 'kairos-backup-2026-10-23T10-00-00Z.json' } });
    expect(files).toHaveLength(1);
    expect(parseKairosBackup(files[0]!.contents).payload.trades).toHaveLength(1);
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toMatchObject({ exportedAt: now() });
  });

  it('records nothing when the share is cancelled or the browser refuses the file, and says why', async () => {
    const db = await database();
    const cancelled = await runBackup(db, port('cancelled').deliver, { now });
    expect(cancelled).toEqual({ ok: false, reason: 'cancelled' });
    if (cancelled.ok) throw new Error('unreachable');
    expect(describeBackupFailure(cancelled)).toBeNull();
    const failed = await runBackup(db, port('failed').deliver, { now });
    expect(failed).toEqual({ ok: false, reason: 'delivery-failed' });
    const thrown = await runBackup(db, async () => { throw new Error('no download'); }, { now });
    expect(thrown).toEqual({ ok: false, reason: 'delivery-failed' });
    if (thrown.ok) throw new Error('unreachable');
    expect(describeBackupFailure(thrown)).toBe('Your browser did not take the backup file. Nothing was changed.');
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toBeNull();
  });

  it('never calls the port when the export fails', async () => {
    const db = await database();
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('closed'));
    const { files, deliver } = port('saved');
    const result = await runBackup(db, deliver, { now });
    expect(result).toMatchObject({ ok: false, reason: 'export-failed' });
    if (result.ok) throw new Error('unreachable');
    expect(describeBackupFailure(result)).toBe('Kairos could not read your data. Nothing was saved.');
    expect(files).toHaveLength(0);
  });

  it('T-054a fix r1: records the last backup inside one atomic write', async () => {
    const db = await database();
    const transaction = db.transaction.bind(db) as (...args: unknown[]) => unknown;
    // Reads still work; every write transaction is refused.
    vi.spyOn(db, 'transaction').mockImplementation(((mode: string, ...rest: unknown[]) => (mode === 'rw' ? Promise.reject(new Error('refused')) : transaction(mode, ...rest))) as typeof db.transaction);
    const { files, deliver } = port('saved');
    expect(await runBackup(db, deliver, { now })).toEqual({ ok: false, reason: 'record-failed' });
    expect(files).toHaveLength(1);
    vi.restoreAllMocks();
    expect(await readLastBackup(createKairosRepositories(db).metadata)).toBeNull();
  });
});

