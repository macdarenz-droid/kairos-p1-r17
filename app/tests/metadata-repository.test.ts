import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const openedNames = new Set<string>();

function makeDatabaseName(label: string) {
  const name = `kairos-test-p5-2-${label}-${crypto.randomUUID()}`;
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

describe('P5.2 metadata repository foundation', () => {
  it('persists and reloads metadata through the repository boundary', async () => {
    const db = createKairosDatabase(makeDatabaseName('reload'));
    await openKairosDatabase(db);
    const repositories = createKairosRepositories(db);

    await repositories.metadata.put({
      key: 'app.installation',
      value: 'local-only',
      updatedAt: '2026-08-31T06:00:00.000Z',
    });

    db.close();
    await db.open();

    await expect(repositories.metadata.get('app.installation')).resolves.toEqual({
      key: 'app.installation',
      value: 'local-only',
      updatedAt: '2026-08-31T06:00:00.000Z',
    });

    db.close();
  });

  it('deletes metadata through the same repository owner', async () => {
    const db = createKairosDatabase(makeDatabaseName('delete'));
    await openKairosDatabase(db);
    const repositories = createKairosRepositories(db);

    await repositories.metadata.put({
      key: 'temporary.marker',
      value: 'present',
      updatedAt: '2026-08-31T06:00:00.000Z',
    });
    await repositories.metadata.delete('temporary.marker');

    await expect(repositories.metadata.get('temporary.marker')).resolves.toBeUndefined();
    db.close();
  });

  it('propagates database failures instead of converting them into empty repository results', async () => {
    const db = createKairosDatabase(makeDatabaseName('failure'));
    const repositories = createKairosRepositories(db);
    const failure = new Error('simulated metadata read failure');
    vi.spyOn(db.metadata, 'get').mockRejectedValueOnce(failure);

    await expect(repositories.metadata.get('missing')).rejects.toBe(failure);
    db.close();
  });

  it('retains metadata ownership inside the current V2 schema', async () => {
    const db = createKairosDatabase(makeDatabaseName('schema'));
    await openKairosDatabase(db);

    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['metadata', 'savedAnalyses', 'savedTimeAssistedSnapshots', 'tradeDiscipline', 'tradeExecutions', 'tradeFees', 'tradePlans', 'trades'].sort());
    db.close();
  });
});
