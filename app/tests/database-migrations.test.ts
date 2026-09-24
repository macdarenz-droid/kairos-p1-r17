import 'fake-indexeddb/auto';
import Dexie, { type Transaction } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  KAIROS_DATABASE_MIGRATIONS,
  KAIROS_DB_SCHEMA_VERSION,
  KAIROS_V1_STORES,
  KAIROS_V3_STORES,
  KAIROS_V4_STORES,
  KAIROS_V5_STORES,
  KAIROS_V6_STORES,
  KAIROS_V7_STORES,
  KAIROS_V8_STORES,
  createKairosDatabase,
  openKairosDatabase,
  registerKairosMigrations,
  validateKairosMigrationSequence,
  type KairosMigrationDefinition,
} from '../src/data/database';

const openedNames = new Set<string>();

function makeDatabaseName(label: string) {
  const name = `kairos-test-p5-3-${label}-${crypto.randomUUID()}`;
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

describe('P5.3 migration harness', () => {
  it('keeps immutable history and appends the current v7 schema', () => {
    expect(KAIROS_DB_SCHEMA_VERSION).toBe(8);
    expect(KAIROS_DATABASE_MIGRATIONS).toHaveLength(8);
    expect(KAIROS_DATABASE_MIGRATIONS[0]).toEqual({ version: 1, stores: KAIROS_V1_STORES });
    expect(KAIROS_DATABASE_MIGRATIONS[1]?.version).toBe(2);
    expect(KAIROS_DATABASE_MIGRATIONS[2]).toEqual({ version: 3, stores: KAIROS_V3_STORES });
    expect(KAIROS_DATABASE_MIGRATIONS[3]).toEqual({ version: 4, stores: KAIROS_V4_STORES });
    expect(KAIROS_DATABASE_MIGRATIONS[4]).toEqual({ version: 5, stores: KAIROS_V5_STORES });
    expect(KAIROS_DATABASE_MIGRATIONS[5]).toEqual({ version: 6, stores: KAIROS_V6_STORES });
    expect(KAIROS_DATABASE_MIGRATIONS[6]).toEqual({ version: 7, stores: KAIROS_V7_STORES });
    expect(KAIROS_DATABASE_MIGRATIONS[7]).toMatchObject({ version: 8, stores: KAIROS_V8_STORES });
    expect(Object.isFrozen(KAIROS_DATABASE_MIGRATIONS)).toBe(true);
    expect(Object.isFrozen(KAIROS_DATABASE_MIGRATIONS[0])).toBe(true);
    expect(() => validateKairosMigrationSequence(KAIROS_DATABASE_MIGRATIONS)).not.toThrow();
  });

  it('rejects skipped, reordered, or mismatched migration history before database open', () => {
    const skipped = [
      { version: 1, stores: KAIROS_V1_STORES },
      { version: 3, stores: KAIROS_V1_STORES },
    ] satisfies readonly KairosMigrationDefinition[];

    expect(() => validateKairosMigrationSequence(skipped, 3)).toThrow(/contiguous and append-only/);
    const mismatched = [
      KAIROS_DATABASE_MIGRATIONS[0]!,
      KAIROS_DATABASE_MIGRATIONS[2]!,
      KAIROS_DATABASE_MIGRATIONS[1]!,
    ] satisfies readonly KairosMigrationDefinition[];

    expect(() => validateKairosMigrationSequence(mismatched, 3)).toThrow(/contiguous and append-only/);
  });

  it('opens the live production schema at v7 with indexed journal status ordering', async () => {
    const db = createKairosDatabase(makeDatabaseName('production-schema'));
    const status = await openKairosDatabase(db);

    expect(status).toEqual({ state: 'ready', schemaVersion: 8 });
    expect(db.verno).toBe(8);
    expect(db.tables.map((table) => table.name)).toEqual(['metadata', 'trades', 'tradePlans', 'tradeExecutions', 'tradeFees', 'savedAnalyses', 'savedTimeAssistedSnapshots', 'tradeDiscipline']);
    expect(db.trades.schema.indexes.map((index) => index.name)).toContain('[status+updatedAt]');
    expect(db.trades.schema.indexes.map((index) => index.name)).toContain('[status+closedAt]');
    db.close();
  });

  it('proves old fixture -> versioned upgrade -> integrity read -> reload using the harness', async () => {
    const name = makeDatabaseName('upgrade-fixture');

    const oldDb = new Dexie(name);
    oldDb.version(1).stores({ metadata: '&key' });
    await oldDb.open();
    await oldDb.table('metadata').put({ key: 'fixture', value: 'legacy' });
    oldDb.close();

    const syntheticMigrations: readonly KairosMigrationDefinition[] = [
      Object.freeze({ version: 1, stores: Object.freeze({ metadata: '&key' }) }),
      Object.freeze({
        version: 2,
        stores: Object.freeze({ metadata: '&key,updatedAt' }),
        upgrade: (transaction: Transaction) => transaction.table('metadata').toCollection().modify((record: Record<string, unknown>) => {
          if (typeof record.updatedAt !== 'string') {
            record.updatedAt = '2026-08-31T07:00:00.000Z';
          }
        }),
      }),
    ];

    const upgradedDb = new Dexie(name);
    registerKairosMigrations(upgradedDb, syntheticMigrations, 2);
    await upgradedDb.open();

    await expect(upgradedDb.table('metadata').get('fixture')).resolves.toEqual({
      key: 'fixture',
      value: 'legacy',
      updatedAt: '2026-08-31T07:00:00.000Z',
    });
    expect(upgradedDb.verno).toBe(2);
    expect(upgradedDb.table('metadata').schema.indexes.map((index) => index.name)).toContain('updatedAt');

    upgradedDb.close();
    const reloadedDb = new Dexie(name);
    registerKairosMigrations(reloadedDb, syntheticMigrations, 2);
    await reloadedDb.open();
    await expect(reloadedDb.table('metadata').get('fixture')).resolves.toMatchObject({
      key: 'fixture',
      value: 'legacy',
      updatedAt: '2026-08-31T07:00:00.000Z',
    });
    reloadedDb.close();
  });
});
