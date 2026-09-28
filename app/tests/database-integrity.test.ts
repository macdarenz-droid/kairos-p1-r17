import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DatabaseIntegrityError,
  assertKairosDatabaseIntegrity,
  createKairosDatabase,
  inspectKairosDatabaseIntegrity,
  openKairosDatabase,
} from '../src/data/database';

const openedNames = new Set<string>();

function makeDatabaseName(label: string) {
  const name = `kairos-test-p5-4-${label}-${crypto.randomUUID()}`;
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

describe('P5.4 database integrity service', () => {
  it('passes a healthy V1 database and remains valid after reload', async () => {
    const name = makeDatabaseName('healthy-reload');
    const db = createKairosDatabase(name);
    await openKairosDatabase(db);
    await db.metadata.put({
      key: 'schema.identity',
      value: 'v1',
      updatedAt: '2026-08-31T07:30:00.000Z',
    });

    const first = await assertKairosDatabaseIntegrity(db);
    expect(first.ok).toBe(true);
    expect(first.metadataRecordCount).toBe(1);
    expect(first.checks.every((entry) => entry.ok)).toBe(true);

    db.close();
    await db.open();
    const reloaded = await assertKairosDatabaseIntegrity(db);
    expect(reloaded.ok).toBe(true);
    expect(reloaded.metadataRecordCount).toBe(1);
    db.close();
  });

  it('reports malformed metadata without mutating or deleting it', async () => {
    const name = makeDatabaseName('malformed-record');
    const db = createKairosDatabase(name);
    await openKairosDatabase(db);

    await db.table('metadata').put({
      key: 'broken',
      value: 42,
      updatedAt: 'not-an-iso-timestamp',
    });

    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.checks.find((entry) => entry.id === 'metadata-record-shape')?.ok).toBe(false);
    await expect(db.table('metadata').get('broken')).resolves.toEqual({
      key: 'broken',
      value: 42,
      updatedAt: 'not-an-iso-timestamp',
    });
    db.close();
  });

  it('throws a typed integrity error instead of masquerading corruption as empty data', async () => {
    const name = makeDatabaseName('typed-failure');
    const db = createKairosDatabase(name);
    await openKairosDatabase(db);
    await db.table('metadata').put({ key: 'broken', value: 'x', updatedAt: 'invalid' });

    await expect(assertKairosDatabaseIntegrity(db)).rejects.toBeInstanceOf(DatabaseIntegrityError);
    await expect(db.table('metadata').count()).resolves.toBe(1);
    db.close();
  });

  it('detects schema/store drift in a synthetic database without attempting repair', async () => {
    const name = makeDatabaseName('schema-drift');
    const drifted = new Dexie(name);
    drifted.version(1).stores({ metadata: '&key', unexpected: '&id' });
    await drifted.open();

    const report = await inspectKairosDatabaseIntegrity(drifted as never);
    expect(report.ok).toBe(false);
    expect(report.checks.find((entry) => entry.id === 'store-set')?.ok).toBe(false);
    expect(drifted.tables.map((table) => table.name).sort()).toEqual(['metadata', 'unexpected']);
    drifted.close();
  });
});
