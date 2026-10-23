import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBackupFolder, commitBackupRestore, exportKairosBackup, loadBackupFolder, prepareBackupRestore, saveBackupFolder } from '../src/application/backup';
import { parseKairosBackup } from '../src/data/backup';
import { KAIROS_DATABASE_MIGRATIONS, KAIROS_V12_STORES, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase } from '../src/data/database';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-handles-v12-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}
const trade: TradeRecord = { id: 'trade-u8' as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-10-20T08:00:00.000Z', closedAt: null, createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z' };
const now = () => '2026-10-23T10:00:00.000Z';
/** A stored folder (the real one is the browser's handle; a plain object clones the same way). */
const folder = { name: 'Kairos backups', handle: { name: 'Kairos backups', kind: 'directory' } };

describe('T-054b schema v12: a device-only store for the backup folder', () => {
  it('upgrades a v11 database, keeping its data, with an empty device store', async () => {
    const name = newName('upgrade');
    const old = new Dexie(name);
    registerKairosMigrations(old, KAIROS_DATABASE_MIGRATIONS.slice(0, 11), 11);
    await old.open();
    await old.table('trades').put(trade);
    await old.table('metadata').put({ key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: '2026-10-20T08:00:00.000Z' });
    old.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 12 });
    expect(await db.trades.toArray()).toEqual([trade]);
    expect(await db.metadata.count()).toBe(1);
    expect(await db.deviceHandles.count()).toBe(0);
    expect(KAIROS_DATABASE_MIGRATIONS[11]).toEqual({ version: 12, stores: KAIROS_V12_STORES });
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('keeps, reads and forgets the backup folder', async () => {
    const db = await current('folder');
    expect(await loadBackupFolder(db)).toBeNull();
    expect(await saveBackupFolder(db, folder, { now })).toEqual({ ok: true });
    expect(await loadBackupFolder(db)).toEqual(folder);
    expect(await clearBackupFolder(db)).toEqual({ ok: true });
    expect(await loadBackupFolder(db)).toBeNull();
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await saveBackupFolder(db, folder, { now })).toEqual({ ok: false, type: 'storage-error', reason: 'backup-folder-save-failed' });
  });

  it('never puts the folder in a backup (format 10, schema 12), and a restore keeps it', async () => {
    const db = await current('backup');
    await db.trades.put(trade);
    await saveBackupFolder(db, folder, { now });
    const exported = await exportKairosBackup(db, new Date(now()));
    if (!exported.ok) throw new Error('export failed');
    const parsed = parseKairosBackup(exported.file.contents);
    expect(parsed).toMatchObject({ formatVersion: 10, databaseSchemaVersion: 12 });
    expect(Object.keys(parsed.payload)).not.toContain('deviceHandles');
    expect(exported.file.contents).not.toContain('Kairos backups');
    // Another journal's backup replaces everything here, but not this device's folder.
    const other = await current('other');
    const backup = await exportKairosBackup(other, new Date(now()));
    if (!backup.ok) throw new Error('export failed');
    const prepared = await prepareBackupRestore(db, backup.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.trades.count()).toBe(0);
    expect(await loadBackupFolder(db)).toEqual(folder);
  });

  it('still restores a format 10 backup made on schema 11', async () => {
    const db = await current('old-format');
    const exported = await exportKairosBackup(db, new Date(now()));
    if (!exported.ok) throw new Error('export failed');
    const schema11 = JSON.stringify({ ...JSON.parse(exported.file.contents), databaseSchemaVersion: 11 });
    const prepared = await prepareBackupRestore(db, schema11);
    expect(prepared.ok).toBe(true);
  });
});
