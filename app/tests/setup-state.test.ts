import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { EMPTY_SETUP_STATE, finishSetup, hideGettingStarted, loadSetupState, setupStateMetadataKey, shouldOpenSetup, skipSetup } from '../src/application/setup/setupState';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-setup-state-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const at = (minute: number) => () => `2026-10-23T10:${String(minute).padStart(2, '0')}:00.000Z`;

describe('T-053d the setup state', () => {
  it('starts empty, and keeps the first time it was finished, skipped or the card hidden', async () => {
    const db = await database('times');
    expect(await loadSetupState(db)).toEqual(EMPTY_SETUP_STATE);
    expect(await skipSetup(db, { now: at(1) })).toEqual({ ok: true, state: { finishedAt: null, skippedAt: '2026-10-23T10:01:00.000Z', cardHiddenAt: null } });
    await skipSetup(db, { now: at(2) });
    await finishSetup(db, { now: at(3) });
    await finishSetup(db, { now: at(4) });
    await hideGettingStarted(db, { now: at(5) });
    expect(await loadSetupState(db)).toEqual({ finishedAt: '2026-10-23T10:03:00.000Z', skippedAt: '2026-10-23T10:01:00.000Z', cardHiddenAt: '2026-10-23T10:05:00.000Z' });
    expect(JSON.parse((await db.metadata.get(setupStateMetadataKey))!.value)).toEqual({ version: 1, finishedAt: '2026-10-23T10:03:00.000Z', skippedAt: '2026-10-23T10:01:00.000Z', cardHiddenAt: '2026-10-23T10:05:00.000Z' });
  });

  it('reads a damaged record as empty', async () => {
    const db = await database('damaged');
    for (const value of ['not json', '[]', '{"version":2,"finishedAt":null,"skippedAt":null,"cardHiddenAt":null}', '{"version":1,"finishedAt":"yesterday","skippedAt":null,"cardHiddenAt":null}', '{"version":1,"finishedAt":null}', '{"version":1,"finishedAt":null,"skippedAt":null,"cardHiddenAt":null,"extra":1}']) {
      await db.metadata.put({ key: setupStateMetadataKey, value, updatedAt: at(0)() });
      expect(await loadSetupState(db), value).toEqual(EMPTY_SETUP_STATE);
    }
  });

  it('opens the setup only on a fresh journal that has neither finished nor skipped it', async () => {
    const fresh = await database('fresh');
    expect(await shouldOpenSetup(fresh)).toBe(true);
    const skipped = await database('skipped');
    await skipSetup(skipped, { now: at(1) });
    expect(await shouldOpenSetup(skipped)).toBe(false);
    const finished = await database('finished');
    await finishSetup(finished, { now: at(1) });
    expect(await shouldOpenSetup(finished)).toBe(false);
    const trading = await database('trading');
    await saveManualTrade(trading, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' });
    expect(await shouldOpenSetup(trading)).toBe(false);
  });

  it('writes in one atomic write and reports a storage failure', async () => {
    const db = await database('failure');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await skipSetup(db, { now: at(1) })).toEqual({ ok: false, reason: 'setup-save-failed' });
  });

  it('travels in a full restore, and a merge import leaves it alone', async () => {
    const source = await database('source');
    await finishSetup(source, { now: at(3) });
    const exported = await exportKairosBackup(source, new Date(at(9)()));
    if (!exported.ok) throw new Error('export failed');
    const target = await database('target');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect((await loadSetupState(target)).finishedAt).toBe('2026-10-23T10:03:00.000Z');

    const other = await database('other');
    await skipSetup(other, { now: at(7) });
    await saveManualTrade(other, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-20T08:00:00.000Z' });
    const otherBackup = await exportKairosBackup(other, new Date(at(9)()));
    if (!otherBackup.ok) throw new Error('export failed');
    const importing = await prepareTradeImport(source, otherBackup.file.contents);
    if (!importing.ok) throw new Error('import prepare failed');
    expect((await commitTradeImport(source, importing.import)).ok).toBe(true);
    expect(await loadSetupState(source)).toEqual({ finishedAt: '2026-10-23T10:03:00.000Z', skippedAt: null, cardHiddenAt: null });
  });
});
