import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKairosBackupEnvelope,
  KairosRestoreVerificationError,
  prepareKairosRestore,
  restoreAndVerifyKairosDatabase,
  serializeKairosBackup,
} from '../src/data/backup';
import { createKairosDatabase } from '../src/data/database';
import { MetadataRepository } from '../src/data/repositories/MetadataRepository';

const databaseNames: string[] = [];
function testDatabaseName(label: string): string {
  const name = `kairos-p6-5-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

function backup(records: Array<{ key: string; value: string; updatedAt: string }>): string {
  return serializeKairosBackup(createKairosBackupEnvelope({
    metadata: records,
    exportedAt: new Date('2026-08-31T09:10:00.000Z'),
  }));
}

describe('P6.5 post-restore reopen/re-query verification', () => {
  it('reopens and verifies the restored authoritative records after commit', async () => {
    const db = createKairosDatabase(testDatabaseName('verified'));
    await db.open();
    await db.metadata.put({ key: 'old', value: 'remove', updatedAt: '2026-08-31T09:00:00.000Z' });
    const prepared = await prepareKairosRestore(db, backup([
      { key: 'b', value: '2', updatedAt: '2026-08-31T09:02:00.000Z' },
      { key: 'a', value: '1', updatedAt: '2026-08-31T09:01:00.000Z' },
    ]));

    const result = await restoreAndVerifyKairosDatabase(db, prepared);

    expect(result.verifiedAfterReload).toBe(true);
    expect(result.restoredMetadataRecords).toBe(2);
    expect(result.reloadedTotalRecords).toBe(2);
    expect(result.integrity.ok).toBe(true);
    expect((await db.metadata.toArray()).map((record) => record.key).sort()).toEqual(['a', 'b']);
    expect(result.recovery.serialized).toBe(prepared.recovery.serialized);
    db.close();
  });

  it('verifies an intentional empty restore after reopen', async () => {
    const db = createKairosDatabase(testDatabaseName('empty'));
    await db.open();
    await db.metadata.put({ key: 'old', value: 'remove', updatedAt: '2026-08-31T09:00:00.000Z' });
    const prepared = await prepareKairosRestore(db, backup([]));

    const result = await restoreAndVerifyKairosDatabase(db, prepared);

    expect(result.verifiedAfterReload).toBe(true);
    expect(result.reloadedTotalRecords).toBe(0);
    expect(await db.metadata.count()).toBe(0);
    db.close();
  });

  it('does not report success when the reopened authoritative query differs', async () => {
    const db = createKairosDatabase(testDatabaseName('mismatch'));
    await db.open();
    await db.metadata.put({ key: 'old', value: 'preserve-in-recovery', updatedAt: '2026-08-31T09:00:00.000Z' });
    const prepared = await prepareKairosRestore(db, backup([
      { key: 'incoming', value: 'expected', updatedAt: '2026-08-31T09:01:00.000Z' },
    ]));

    let listCalls = 0;
    vi.spyOn(MetadataRepository.prototype, 'listAll').mockImplementation(async function (this: MetadataRepository) {
      listCalls += 1;
      if (listCalls === 1) return [{ key: 'unexpected', value: 'wrong', updatedAt: '2026-08-31T09:01:00.000Z' }];
      return [];
    });

    await expect(restoreAndVerifyKairosDatabase(db, prepared)).rejects.toMatchObject({
      name: 'KairosRestoreVerificationError',
      code: 'REQUERY_MISMATCH',
      recovery: prepared.recovery,
    } satisfies Partial<KairosRestoreVerificationError>);
    db.close();
  });

  it('preserves current schema V5 after the verified restore cycle', async () => {
    const db = createKairosDatabase(testDatabaseName('schema'));
    await db.open();
    const prepared = await prepareKairosRestore(db, backup([]));
    await restoreAndVerifyKairosDatabase(db, prepared);
    expect(db.verno).toBe(9);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['metadata', 'savedAnalyses', 'savedTimeAssistedSnapshots', 'tradeDiscipline', 'tradeExecutions', 'tradeFees', 'tradePlans', 'trades'].sort());
    db.close();
  });
});
