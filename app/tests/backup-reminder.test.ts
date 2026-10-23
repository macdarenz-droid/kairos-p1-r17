import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupReminderLaterMetadataKey,
  commitBackupRestore,
  exportKairosBackup,
  loadBackupReminder,
  prepareBackupRestore,
  readBackupReminderSetting,
  recordLastBackup,
  remindBackupLater,
  saveBackupReminderSetting,
} from '../src/application/backup';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-backup-reminder-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const at = (iso: string) => () => iso;
const trade = { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-01T08:00:00.000Z' } as const;
const addTrades = async (db: KairosDatabase, count: number, createdAt: string) => { for (let i = 0; i < count; i += 1) await saveManualTrade(db, trade, { now: at(createdAt) }); };
/** A backup taken at `when`, recorded as the app records one. */
async function backedUpAt(db: KairosDatabase, when: string): Promise<void> {
  const exported = await exportKairosBackup(db, new Date(when));
  if (!exported.ok) throw new Error('export failed');
  expect((await recordLastBackup(createKairosRepositories(db).metadata, exported.file)).ok).toBe(true);
}

describe('T-054a when a backup is due', () => {
  it('is never due for a journal with no trades, and due as "never" once there is one', async () => {
    const db = await database();
    expect(await loadBackupReminder(db, { now: at('2026-10-23T10:00:00.000Z') })).toMatchObject({ due: false, reason: null, lastBackupAt: null, tradesSince: 0, every: 7 });
    await addTrades(db, 1, '2026-10-20T10:00:00.000Z');
    expect(await loadBackupReminder(db, { now: at('2026-10-23T10:00:00.000Z') })).toMatchObject({ due: true, reason: 'never', daysSince: null, tradesSince: 1 });
  });

  it('is due 7 whole days after the last backup, not 6', async () => {
    const db = await database();
    await addTrades(db, 1, '2026-10-01T10:00:00.000Z');
    await backedUpAt(db, '2026-10-10T12:00:00.000Z');
    expect(await loadBackupReminder(db, { now: at('2026-10-17T11:59:59.000Z') })).toMatchObject({ due: false, daysSince: 6, lastBackupAt: '2026-10-10T12:00:00.000Z' });
    expect(await loadBackupReminder(db, { now: at('2026-10-17T12:00:00.000Z') })).toMatchObject({ due: true, reason: 'old', daysSince: 7 });
    // "Every month" waits 30 days.
    await saveBackupReminderSetting(db, 30, { now: at('2026-10-17T12:00:00.000Z') });
    expect(await loadBackupReminder(db, { now: at('2026-10-17T12:00:00.000Z') })).toMatchObject({ due: false, every: 30 });
  });

  it('is due after 20 trades created since the last backup, not 19, and practice trades count', async () => {
    const db = await database();
    await addTrades(db, 2, '2026-10-01T10:00:00.000Z');
    await backedUpAt(db, '2026-10-20T09:00:00.000Z');
    await addTrades(db, 18, '2026-10-20T10:00:00.000Z');
    expect((await savePracticeTrade(db, trade, { now: at('2026-10-20T11:00:00.000Z') })).ok).toBe(true);
    const now = at('2026-10-21T09:00:00.000Z');
    expect(await loadBackupReminder(db, { now })).toMatchObject({ due: false, tradesSince: 19, daysSince: 1 });
    await addTrades(db, 1, '2026-10-20T12:00:00.000Z');
    expect(await loadBackupReminder(db, { now })).toMatchObject({ due: true, reason: 'many-trades', tradesSince: 20 });
  });

  it('"Never" turns it off, and "Later" holds it for 24 hours', async () => {
    const db = await database();
    await addTrades(db, 1, '2026-10-20T10:00:00.000Z');
    await remindBackupLater(db, { now: at('2026-10-22T10:00:00.000Z') });
    expect(await loadBackupReminder(db, { now: at('2026-10-23T09:59:59.000Z') })).toMatchObject({ due: false });
    expect(await loadBackupReminder(db, { now: at('2026-10-23T10:00:00.000Z') })).toMatchObject({ due: true, reason: 'never' });
    await saveBackupReminderSetting(db, null, { now: at('2026-10-23T10:00:00.000Z') });
    expect(await loadBackupReminder(db, { now: at('2026-10-23T10:00:00.000Z') })).toMatchObject({ due: false, every: null });
  });

  it('reads a damaged setting as every week, and a damaged "Later" as none', async () => {
    const db = await database();
    await addTrades(db, 1, '2026-10-20T10:00:00.000Z');
    const metadata = createKairosRepositories(db).metadata;
    await metadata.put({ key: 'preferences.backup-reminder.v1', value: '{"version":1,"every":3}', updatedAt: '2026-10-20T10:00:00.000Z' });
    await metadata.put({ key: backupReminderLaterMetadataKey, value: 'not json', updatedAt: '2026-10-20T10:00:00.000Z' });
    expect(await readBackupReminderSetting(metadata)).toBe(7);
    expect(await loadBackupReminder(db, { now: at('2026-10-23T10:00:00.000Z') })).toMatchObject({ due: true, every: 7 });
  });

  it('the setting travels in a full restore; "Later" stays on this device', async () => {
    const source = await database();
    await saveBackupReminderSetting(source, 14, { now: at('2026-10-20T10:00:00.000Z') });
    await remindBackupLater(source, { now: at('2026-10-20T10:00:00.000Z') });
    const exported = await exportKairosBackup(source, new Date('2026-10-20T11:00:00.000Z'));
    if (!exported.ok) throw new Error('export failed');
    const target = await database();
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await readBackupReminderSetting(createKairosRepositories(target).metadata)).toBe(14);
    expect(await target.metadata.get(backupReminderLaterMetadataKey)).toBeUndefined();
  });

  it('a storage failure says so and changes nothing', async () => {
    const db = await database();
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await saveBackupReminderSetting(db, 30)).toEqual({ ok: false, type: 'storage-error', reason: 'backup-reminder-save-failed' });
    expect(await remindBackupLater(db)).toEqual({ ok: false, type: 'storage-error', reason: 'backup-reminder-save-failed' });
    vi.restoreAllMocks();
    expect(await readBackupReminderSetting(createKairosRepositories(db).metadata)).toBe(7);
  });
});
