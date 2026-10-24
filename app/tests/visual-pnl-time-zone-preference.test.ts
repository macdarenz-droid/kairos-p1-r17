import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import {
  clearVisualPnlTimeZonePreference,
  readVisualPnlTimeZonePreference,
  visualPnlTimeZonePreferenceMetadataKey,
  writeVisualPnlTimeZonePreference,
} from '../src/application/visual-pnl';

const openedNames = new Set<string>();

function makeDatabaseName(label: string): string {
  const name = `kairos-test-p13-10r1-${label}-${crypto.randomUUID()}`;
  openedNames.add(name);
  return name;
}

afterEach(async () => {
  for (const name of openedNames) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`Delete blocked for ${name}`));
    });
  }
  openedNames.clear();
});

async function openRepositories(label: string) {
  const db = createKairosDatabase(makeDatabaseName(label));
  await openKairosDatabase(db);
  return { db, repositories: createKairosRepositories(db) };
}

describe('P13.10R1 explicit Visual P&L timezone preference through metadata ownership', () => {
  it('defaults to explicitly unconfigured instead of inferring a device timezone', async () => {
    const { db, repositories } = await openRepositories('empty');
    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).resolves.toBeNull();
    db.close();
  });

  it('persists and reloads an explicitly selected valid timezone through MetadataRepository', async () => {
    const { db, repositories } = await openRepositories('persist');
    await expect(writeVisualPnlTimeZonePreference(
      repositories.metadata,
      'Australia/Sydney',
      '2026-09-02T10:00:00.000Z',
    )).resolves.toEqual({ ok: true, timeZone: 'Australia/Sydney' });

    await expect(repositories.metadata.get(visualPnlTimeZonePreferenceMetadataKey)).resolves.toEqual({
      key: visualPnlTimeZonePreferenceMetadataKey,
      value: 'Australia/Sydney',
      updatedAt: '2026-09-02T10:00:00.000Z',
    });

    db.close();
    await db.open();
    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).resolves.toBe('Australia/Sydney');
    db.close();
  });

  it('rejects invalid timezone evidence without overwriting an existing valid preference', async () => {
    const { db, repositories } = await openRepositories('invalid');
    await writeVisualPnlTimeZonePreference(repositories.metadata, 'UTC', '2026-09-02T10:00:00.000Z');

    await expect(writeVisualPnlTimeZonePreference(
      repositories.metadata,
      'Mars/Olympus_Mons',
      '2026-09-02T10:01:00.000Z',
    )).resolves.toEqual({ ok: false, reason: 'invalid-time-zone' });

    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).resolves.toBe('UTC');
    db.close();
  });

  it('treats invalid persisted evidence as unconfigured rather than falling back silently', async () => {
    const { db, repositories } = await openRepositories('invalid-stored');
    await repositories.metadata.put({
      key: visualPnlTimeZonePreferenceMetadataKey,
      value: 'Not/A_TimeZone',
      updatedAt: '2026-09-02T10:00:00.000Z',
    });
    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).resolves.toBeNull();
    db.close();
  });

  it('does not trim or normalize timezone evidence invisibly', async () => {
    const { db, repositories } = await openRepositories('trim');
    await expect(writeVisualPnlTimeZonePreference(
      repositories.metadata,
      ' Australia/Sydney ',
      '2026-09-02T10:00:00.000Z',
    )).resolves.toEqual({ ok: false, reason: 'invalid-time-zone' });
    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).resolves.toBeNull();
    db.close();
  });

  it('propagates metadata persistence failures instead of disguising them as empty state', async () => {
    const { db, repositories } = await openRepositories('failure');
    db.close();
    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).rejects.toBeTruthy();
  });

  it('can explicitly clear the configured timezone through the same metadata owner', async () => {
    const { db, repositories } = await openRepositories('clear');
    await writeVisualPnlTimeZonePreference(repositories.metadata, 'America/New_York', '2026-09-02T10:00:00.000Z');
    await clearVisualPnlTimeZonePreference(repositories.metadata);
    await expect(readVisualPnlTimeZonePreference(repositories.metadata)).resolves.toBeNull();
    db.close();
  });
});
