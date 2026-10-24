import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readVisualPnlTimeZonePreference,
  startVisualPnlTimeZoneFromDevice,
  visualPnlTimeZonePreferenceMetadataKey,
  writeVisualPnlTimeZonePreference,
} from '../src/application/visual-pnl';
import { createKairosDatabaseSnapshot } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const SAVED_AT = '2026-09-19T08:00:00.000Z';
const NOW = '2026-09-20T12:00:00.000Z';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-time-zone-start-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const metadata = (db: KairosDatabase) => createKairosRepositories(db).metadata;

describe('T-051a the time zone starts from this device on first use', () => {
  it('saves the device zone when none is saved, and a second start finds it saved', async () => {
    const db = await database();
    expect(await startVisualPnlTimeZoneFromDevice(db, 'Asia/Manila', NOW)).toEqual({ kind: 'started-from-device', timeZone: 'Asia/Manila' });
    expect(await readVisualPnlTimeZonePreference(metadata(db))).toBe('Asia/Manila');
    expect(await metadata(db).get(visualPnlTimeZonePreferenceMetadataKey)).toMatchObject({ value: 'Asia/Manila', updatedAt: NOW });
    expect(await startVisualPnlTimeZoneFromDevice(db, 'UTC', '2026-09-21T00:00:00.000Z')).toEqual({ kind: 'saved', timeZone: 'Asia/Manila' });
  });

  it('never changes a saved zone', async () => {
    const db = await database();
    expect((await writeVisualPnlTimeZonePreference(metadata(db), 'UTC', SAVED_AT)).ok).toBe(true);
    expect(await startVisualPnlTimeZoneFromDevice(db, 'Asia/Manila', NOW)).toEqual({ kind: 'saved', timeZone: 'UTC' });
    expect(await metadata(db).get(visualPnlTimeZonePreferenceMetadataKey)).toMatchObject({ value: 'UTC', updatedAt: SAVED_AT });
  });

  it('writes nothing when the device gives no valid zone', async () => {
    for (const device of [null, '', 'Not/AZone']) {
      const db = await database();
      expect(await startVisualPnlTimeZoneFromDevice(db, device, NOW)).toEqual({ kind: 'unconfigured' });
      expect(await metadata(db).get(visualPnlTimeZonePreferenceMetadataKey)).toBeUndefined();
    }
  });

  it('replaces an unreadable stored zone with the device zone', async () => {
    const db = await database();
    await metadata(db).put({ key: visualPnlTimeZonePreferenceMetadataKey, value: 'Not/AZone', updatedAt: SAVED_AT });
    expect(await startVisualPnlTimeZoneFromDevice(db, 'UTC', NOW)).toEqual({ kind: 'started-from-device', timeZone: 'UTC' });
    expect(await readVisualPnlTimeZonePreference(metadata(db))).toBe('UTC');
  });

  it('is carried by every backup', async () => {
    const db = await database();
    await startVisualPnlTimeZoneFromDevice(db, 'Asia/Manila', NOW);
    const envelope = await createKairosDatabaseSnapshot(db);
    expect(envelope.payload.metadata).toContainEqual(expect.objectContaining({ key: visualPnlTimeZonePreferenceMetadataKey, value: 'Asia/Manila' }));
  });
});
