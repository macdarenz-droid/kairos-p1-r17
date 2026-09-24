import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKairosBackupEnvelope,
  prepareKairosRestore,
  replaceKairosDatabaseFromPreparedRestore,
  serializeKairosBackup,
} from '../src/data/backup';
import { createKairosDatabase } from '../src/data/database';
import { MetadataRepository } from '../src/data/repositories/MetadataRepository';

const databaseNames: string[] = [];
function testDatabaseName(label: string): string {
  const name = `kairos-p6-4-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

function incomingBackup(records: Array<{ key: string; value: string; updatedAt: string }>): string {
  return serializeKairosBackup(createKairosBackupEnvelope({
    metadata: records,
    exportedAt: new Date('2026-08-31T08:40:00.000Z'),
  }));
}

describe('P6.4 transactional validated replacement', () => {
  it('replaces current metadata only after preflight/recovery preparation and passes post-import integrity', async () => {
    const db = createKairosDatabase(testDatabaseName('replace'));
    await db.open();
    await db.metadata.put({ key: 'old', value: 'remove', updatedAt: '2026-08-31T08:00:00.000Z' });
    const prepared = await prepareKairosRestore(db, incomingBackup([
      { key: 'new-a', value: 'A', updatedAt: '2026-08-31T08:30:00.000Z' },
      { key: 'new-b', value: 'B', updatedAt: '2026-08-31T08:31:00.000Z' },
    ]));

    const result = await replaceKairosDatabaseFromPreparedRestore(db, prepared);

    expect(result.restoredMetadataRecords).toBe(2);
    expect(result.integrity.ok).toBe(true);
    expect((await db.metadata.toArray()).map((record) => record.key).sort()).toEqual(['new-a', 'new-b']);
    expect(prepared.recovery.envelope.payload.metadata[0]?.key).toBe('old');
    db.close();
  });

  it('rolls back the clear when replacement fails inside the same transaction', async () => {
    const db = createKairosDatabase(testDatabaseName('rollback'));
    await db.open();
    const original = { key: 'current', value: 'must-survive', updatedAt: '2026-08-31T08:00:00.000Z' };
    await db.metadata.put(original);
    const prepared = await prepareKairosRestore(db, incomingBackup([
      { key: 'incoming', value: 'new', updatedAt: '2026-08-31T08:30:00.000Z' },
    ]));

    vi.spyOn(MetadataRepository.prototype, 'replaceAll').mockImplementation(async function (this: MetadataRepository) {
      await (this as unknown as { db: typeof db }).db.metadata.clear();
      throw new Error('synthetic replacement failure');
    });

    await expect(replaceKairosDatabaseFromPreparedRestore(db, prepared)).rejects.toThrow('synthetic replacement failure');
    expect(await db.metadata.toArray()).toEqual([original]);
    db.close();
  });

  it('supports an intentional empty replacement atomically', async () => {
    const db = createKairosDatabase(testDatabaseName('empty'));
    await db.open();
    await db.metadata.put({ key: 'old', value: 'remove', updatedAt: '2026-08-31T08:00:00.000Z' });
    const prepared = await prepareKairosRestore(db, incomingBackup([]));
    const result = await replaceKairosDatabaseFromPreparedRestore(db, prepared);
    expect(result.integrity.ok).toBe(true);
    expect(await db.metadata.count()).toBe(0);
    db.close();
  });

  it('preserves the current database schema during replacement', async () => {
    const db = createKairosDatabase(testDatabaseName('schema'));
    await db.open();
    const prepared = await prepareKairosRestore(db, incomingBackup([]));
    await replaceKairosDatabaseFromPreparedRestore(db, prepared);
    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['metadata', 'savedAnalyses', 'savedTimeAssistedSnapshots', 'tradeDiscipline', 'tradeExecutions', 'tradeFees', 'tradePlans', 'trades'].sort());
    db.close();
  });
});
