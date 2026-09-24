import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KAIROS_DB_SCHEMA_VERSION,
  KAIROS_V1_STORES,
  closeKairosDatabase,
  createKairosDatabase,
  getDatabaseLifecycleStatus,
  openKairosDatabase,
  subscribeDatabaseLifecycle,
} from '../src/data/database';

const openedNames = new Set<string>();

function makeDatabaseName(label: string) {
  const name = `kairos-test-${label}-${crypto.randomUUID()}`;
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

describe('P5.1 database kernel', () => {
  it('declares current schema v5 with immutable v1 metadata history', () => {
    expect(KAIROS_DB_SCHEMA_VERSION).toBe(6);
    expect(KAIROS_V1_STORES).toEqual({ metadata: '&key' });
    expect(Object.isFrozen(KAIROS_V1_STORES)).toBe(true);
  });

  it('opens current IndexedDB schema while retaining immutable V1 history', async () => {
    const db = createKairosDatabase(makeDatabaseName('open'));
    const status = await openKairosDatabase(db);

    expect(status).toEqual({ state: 'ready', schemaVersion: 6 });
    expect(db.isOpen()).toBe(true);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['metadata', 'savedAnalyses', 'savedTimeAssistedSnapshots', 'tradeDiscipline', 'tradeExecutions', 'tradeFees', 'tradePlans', 'trades'].sort());

    closeKairosDatabase(db);
  });

  it('supports a typed metadata write and reload alongside V2 domain stores', async () => {
    const db = createKairosDatabase(makeDatabaseName('metadata'));
    await openKairosDatabase(db);

    await db.metadata.put({
      key: 'schema.identity',
      value: 'v1',
      updatedAt: '2026-08-31T00:00:00.000Z',
    });

    db.close();
    await db.open();

    await expect(db.metadata.get('schema.identity')).resolves.toEqual({
      key: 'schema.identity',
      value: 'v1',
      updatedAt: '2026-08-31T00:00:00.000Z',
    });

    closeKairosDatabase(db);
  });

  it('publishes lifecycle state rather than treating an open failure as empty data', async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeDatabaseLifecycle((status) => seen.push(status.state));
    const failingDb = createKairosDatabase(makeDatabaseName('failure'));
    vi.spyOn(failingDb, 'open').mockRejectedValueOnce(new Error('simulated open failure')); 

    const status = await openKairosDatabase(failingDb);

    expect(status.state).toBe('error');
    expect(status.errorName).toBe('Error');
    expect(status.errorMessage).toBe('simulated open failure');
    expect(getDatabaseLifecycleStatus().state).toBe('error');
    expect(seen).toContain('opening');
    expect(seen).toContain('error');
    unsubscribe();
  });
});
