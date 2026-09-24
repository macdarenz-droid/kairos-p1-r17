import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createKairosDatabase,
  openKairosDatabase,
  runKairosAtomicWrite,
} from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const openedNames = new Set<string>();

function makeDatabaseName(label: string) {
  const name = `kairos-test-p5-5-${label}-${crypto.randomUUID()}`;
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

describe('P5.5 atomic transaction foundation', () => {
  it('commits all repository writes as one atomic unit and resolves after commit', async () => {
    const db = createKairosDatabase(makeDatabaseName('commit'));
    await openKairosDatabase(db);
    const repositories = createKairosRepositories(db);

    const result = await runKairosAtomicWrite(db, ['metadata'], async ({ transaction, repositories: txRepositories }) => {
      expect(Dexie.currentTransaction).toBe(transaction);

      await txRepositories.metadata.put({
        key: 'atomic.first',
        value: 'one',
        updatedAt: '2026-08-31T07:30:00.000Z',
      });
      await txRepositories.metadata.put({
        key: 'atomic.second',
        value: 'two',
        updatedAt: '2026-08-31T07:30:01.000Z',
      });

      return 'committed';
    });

    expect(result).toBe('committed');
    await expect(repositories.metadata.get('atomic.first')).resolves.toMatchObject({ value: 'one' });
    await expect(repositories.metadata.get('atomic.second')).resolves.toMatchObject({ value: 'two' });
    db.close();
  });

  it('rolls back every write when the command transaction fails', async () => {
    const db = createKairosDatabase(makeDatabaseName('rollback'));
    await openKairosDatabase(db);
    const repositories = createKairosRepositories(db);
    const failure = new Error('simulated command failure');

    await expect(
      runKairosAtomicWrite(db, ['metadata'], async ({ repositories: txRepositories }) => {
        await txRepositories.metadata.put({
          key: 'rollback.first',
          value: 'should-disappear',
          updatedAt: '2026-08-31T07:31:00.000Z',
        });
        await txRepositories.metadata.put({
          key: 'rollback.second',
          value: 'should-also-disappear',
          updatedAt: '2026-08-31T07:31:01.000Z',
        });
        throw failure;
      }),
    ).rejects.toBe(failure);

    await expect(repositories.metadata.get('rollback.first')).resolves.toBeUndefined();
    await expect(repositories.metadata.get('rollback.second')).resolves.toBeUndefined();
    db.close();
  });

  it('rejects an empty transaction scope before opening a write transaction', async () => {
    const db = createKairosDatabase(makeDatabaseName('empty-scope'));
    await openKairosDatabase(db);

    await expect(runKairosAtomicWrite(db, [], async () => undefined)).rejects.toThrow(
      'requires at least one declared store',
    );
    db.close();
  });

  it('preserves the V2 production schema while retaining immutable V1 history', async () => {
    const db = createKairosDatabase(makeDatabaseName('schema'));
    await openKairosDatabase(db);

    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['metadata', 'savedAnalyses', 'savedTimeAssistedSnapshots', 'tradeDiscipline', 'tradeExecutions', 'tradeFees', 'tradePlans', 'trades'].sort());
    db.close();
  });
});
