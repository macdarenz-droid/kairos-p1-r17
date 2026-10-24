import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ActivationReceiptRepository,
  KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
  loadVerifiedPersistedActivation,
  type ActivationReceipt,
  type ActivationReceiptVerifier,
} from '../src/services/activation';
import {
  createKairosBackupEnvelope,
  createKairosDatabaseSnapshot,
  prepareKairosRestore,
  restoreAndVerifyKairosDatabase,
  serializeKairosBackup,
} from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const databaseNames: string[] = [];

function testDatabaseName(label: string): string {
  const name = `kairos-p7-2-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

const receipt: ActivationReceipt = {
  receiptVersion: 1,
  activationId: 'activation-p7-2',
  issuedAt: '2026-08-31T09:30:00.000Z',
  verifierPayload: 'signed-opaque-payload',
  verifierSignature: 'signed-opaque-signature',
};

function repositoryFor(db: ReturnType<typeof createKairosDatabase>) {
  return new ActivationReceiptRepository(createKairosRepositories(db).metadata);
}

describe('P7.2 activation receipt persistence', () => {
  it('persists a server-issued receipt and reloads the raw receipt after a database reopen', async () => {
    const name = testDatabaseName('reload');
    const db = createKairosDatabase(name);
    await openKairosDatabase(db);
    const repository = repositoryFor(db);

    await repository.saveServerIssuedReceipt(receipt, new Date('2026-08-31T09:31:00.000Z'));
    db.close();

    const reopened = createKairosDatabase(name);
    await openKairosDatabase(reopened);
    await expect(repositoryFor(reopened).load()).resolves.toEqual({
      status: 'stored',
      receipt,
      storedAt: '2026-08-31T09:31:00.000Z',
    });
    reopened.close();
  });

  it('never turns stored bytes into verified activation without the verifier boundary', async () => {
    const db = createKairosDatabase(testDatabaseName('verification'));
    await openKairosDatabase(db);
    const repository = repositoryFor(db);
    await repository.saveServerIssuedReceipt(receipt);

    const rejectingVerifier: ActivationReceiptVerifier = {
      async verifyReceipt() {
        return { ok: false, reason: 'invalid-receipt' };
      },
    };
    await expect(loadVerifiedPersistedActivation(repository, rejectingVerifier)).resolves.toEqual({
      status: 'rejected',
      reason: 'invalid-receipt',
    });

    const approvingVerifier: ActivationReceiptVerifier = {
      async verifyReceipt(candidate) {
        return { ok: true, receipt: candidate };
      },
    };
    await expect(loadVerifiedPersistedActivation(repository, approvingVerifier)).resolves.toEqual({
      status: 'verified',
      receipt,
    });
    db.close();
  });

  it('fails closed on malformed local receipt data rather than treating it as active', async () => {
    const db = createKairosDatabase(testDatabaseName('corrupt'));
    await openKairosDatabase(db);
    await db.metadata.put({
      key: KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
      value: '{broken-json',
      updatedAt: '2026-08-31T09:31:00.000Z',
    });

    const verifier: ActivationReceiptVerifier = {
      async verifyReceipt(candidate) {
        return { ok: true, receipt: candidate };
      },
    };
    const result = await loadVerifiedPersistedActivation(repositoryFor(db), verifier);
    expect(result.status).toBe('corrupt');
    db.close();
  });

  it('keeps installation activation evidence out of user backup snapshots', async () => {
    const db = createKairosDatabase(testDatabaseName('backup-exclusion'));
    await openKairosDatabase(db);
    await db.metadata.put({ key: 'journal.setting', value: 'keep', updatedAt: '2026-08-31T09:31:00.000Z' });
    await repositoryFor(db).saveServerIssuedReceipt(receipt, new Date('2026-08-31T09:32:00.000Z'));

    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot.payload.metadata.map((record) => record.key)).toEqual(['journal.setting']);
    expect(snapshot.recordCounts).toEqual({
      metadata: 1,
      savedAnalyses: 0,
      savedTimeAssistedSnapshots: 0,
      tradeDiscipline: 0,
      trades: 0,
      tradePlans: 0,
      tradeExecutions: 0,
      tradeFees: 0,
      exchangeRates: 0,
      economicEvents: 0,
      total: 1,
    });
    expect(await db.metadata.count()).toBe(2);
    db.close();
  });

  it('preserves device-scoped activation evidence through the full verified restore cycle', async () => {
    const db = createKairosDatabase(testDatabaseName('restore-preserve'));
    await openKairosDatabase(db);
    const repositories = createKairosRepositories(db);
    const activation = new ActivationReceiptRepository(repositories.metadata);
    await activation.saveServerIssuedReceipt(receipt, new Date('2026-08-31T09:32:00.000Z'));
    await repositories.metadata.put({ key: 'old-user-data', value: 'old', updatedAt: '2026-08-31T09:30:00.000Z' });

    const incoming = serializeKairosBackup(createKairosBackupEnvelope({
      metadata: [
        { key: 'new-user-data', value: 'new', updatedAt: '2026-08-31T09:33:00.000Z' },
      ],
      exportedAt: new Date('2026-08-31T09:34:00.000Z'),
    }));
    const prepared = await prepareKairosRestore(db, incoming);
    const result = await restoreAndVerifyKairosDatabase(db, prepared);

    expect(result.verifiedAfterReload).toBe(true);
    expect(result.reloadedMetadataRecords).toBe(1);
    expect((await db.metadata.toArray()).map((record) => record.key).sort()).toEqual([
      KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
      'new-user-data',
    ].sort());
    await expect(activation.load()).resolves.toMatchObject({ status: 'stored', receipt });
    db.close();
  });
});
