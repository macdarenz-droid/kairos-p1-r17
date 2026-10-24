import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActivationCoordinator,
  ActivationReceiptRepository,
  type ActivationAdapter,
  type ActivationReceipt,
  type ActivationReceiptVerifier,
} from '../src/services/activation';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const databaseNames: string[] = [];

function testDatabaseName(label: string): string {
  const name = `kairos-p7-5-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await Dexie.delete(name);
});

const receipt: ActivationReceipt = {
  receiptVersion: 1,
  activationId: 'activation-p7-5',
  issuedAt: '2026-08-31T10:35:00.000Z',
  verifierPayload: '{"proofVersion":1}',
  verifierSignature: 'proof',
};

function approvingVerifier(): ActivationReceiptVerifier {
  return {
    async verifyReceipt(candidate) {
      return { ok: true, receipt: { ...candidate } };
    },
  };
}

function repositoryFor(db: ReturnType<typeof createKairosDatabase>) {
  return new ActivationReceiptRepository(createKairosRepositories(db).metadata);
}

function request() {
  return { inviteCode: 'invite-from-user', appVersion: '0.1.0', buildId: 'test-build' };
}

describe('P7.5 activation coordinator', () => {
  it('starts locked when no verified installation receipt exists', async () => {
    const db = createKairosDatabase(testDatabaseName('missing'));
    await openKairosDatabase(db);
    const coordinator = new ActivationCoordinator({
      repository: repositoryFor(db),
      verifier: approvingVerifier(),
      adapter: { async validateInvite() { return { ok: false, reason: 'service-error' }; } },
    });

    await expect(coordinator.bootstrap()).resolves.toEqual({
      status: 'activation-required',
      receipt: null,
      message: null,
    });
    db.close();
  });

  it('restores a persisted receipt only after verifier approval and unlocks offline-capable state', async () => {
    const db = createKairosDatabase(testDatabaseName('restore'));
    await openKairosDatabase(db);
    await repositoryFor(db).saveServerIssuedReceipt(receipt);

    const coordinator = new ActivationCoordinator({
      repository: repositoryFor(db),
      verifier: approvingVerifier(),
      adapter: { async validateInvite() { return { ok: false, reason: 'service-error' }; } },
    });

    await expect(coordinator.bootstrap()).resolves.toEqual({
      status: 'active-offline',
      receipt,
      message: null,
    });
    db.close();
  });

  it('fails closed when persisted proof is rejected', async () => {
    const db = createKairosDatabase(testDatabaseName('reject-restore'));
    await openKairosDatabase(db);
    await repositoryFor(db).saveServerIssuedReceipt(receipt);

    const coordinator = new ActivationCoordinator({
      repository: repositoryFor(db),
      verifier: { async verifyReceipt() { return { ok: false, reason: 'invalid-receipt' }; } },
      adapter: { async validateInvite() { return { ok: false, reason: 'service-error' }; } },
    });

    const snapshot = await coordinator.bootstrap();
    expect(snapshot.status).toBe('activation-required');
    expect(snapshot.receipt).toBeNull();
    db.close();
  });

  it('verifies and persists server approval before reporting activation success', async () => {
    const db = createKairosDatabase(testDatabaseName('activate'));
    await openKairosDatabase(db);
    const repository = repositoryFor(db);
    const verifyReceipt = vi.fn(async (candidate: ActivationReceipt) => ({ ok: true as const, receipt: candidate }));
    const adapter: ActivationAdapter = {
      async validateInvite() { return { ok: true, receipt }; },
    };
    const coordinator = new ActivationCoordinator({
      repository,
      verifier: { verifyReceipt },
      adapter,
    });

    await expect(coordinator.activate(request())).resolves.toEqual({
      status: 'active-online',
      receipt,
      message: null,
    });
    expect(verifyReceipt).toHaveBeenCalledWith(receipt);
    await expect(repository.load()).resolves.toMatchObject({ status: 'stored', receipt });
    db.close();
  });

  it('does not persist or unlock when the server receipt proof is invalid', async () => {
    const db = createKairosDatabase(testDatabaseName('invalid-proof'));
    await openKairosDatabase(db);
    const repository = repositoryFor(db);
    const coordinator = new ActivationCoordinator({
      repository,
      verifier: { async verifyReceipt() { return { ok: false, reason: 'invalid-receipt' }; } },
      adapter: { async validateInvite() { return { ok: true, receipt }; } },
    });

    const snapshot = await coordinator.activate(request());
    expect(snapshot.status).toBe('error');
    expect(snapshot.receipt).toBeNull();
    await expect(repository.load()).resolves.toEqual({ status: 'missing' });
    db.close();
  });

  it('does not report success when receipt persistence fails', async () => {
    const db = createKairosDatabase(testDatabaseName('save-failure'));
    await openKairosDatabase(db);
    const repository = repositoryFor(db);
    vi.spyOn(repository, 'saveServerIssuedReceipt').mockRejectedValue(new Error('write failed'));
    const coordinator = new ActivationCoordinator({
      repository,
      verifier: approvingVerifier(),
      adapter: { async validateInvite() { return { ok: true, receipt }; } },
    });

    const snapshot = await coordinator.activate(request());
    expect(snapshot).toEqual({
      status: 'error',
      receipt: null,
      message: 'Activation could not be saved on this device.',
    });
    db.close();
  });

  it('maps server rejection through the existing activation state model without persisting a receipt', async () => {
    const db = createKairosDatabase(testDatabaseName('server-reject'));
    await openKairosDatabase(db);
    const repository = repositoryFor(db);
    const coordinator = new ActivationCoordinator({
      repository,
      verifier: approvingVerifier(),
      adapter: { async validateInvite() { return { ok: false, reason: 'expired-code' }; } },
    });

    const snapshot = await coordinator.activate(request());
    expect(snapshot.status).toBe('rejected');
    await expect(repository.load()).resolves.toEqual({ status: 'missing' });
    db.close();
  });

  it('keeps validation single-flight so duplicate submits do not create duplicate remote requests', async () => {
    const db = createKairosDatabase(testDatabaseName('single-flight'));
    await openKairosDatabase(db);
    let resolveRemote!: (value: Awaited<ReturnType<ActivationAdapter['validateInvite']>>) => void;
    const pending = new Promise<Awaited<ReturnType<ActivationAdapter['validateInvite']>>>((resolve) => {
      resolveRemote = resolve;
    });
    const validateInvite = vi.fn(() => pending);
    const coordinator = new ActivationCoordinator({
      repository: repositoryFor(db),
      verifier: approvingVerifier(),
      adapter: { validateInvite },
    });

    const first = coordinator.activate(request());
    const second = await coordinator.activate(request());
    expect(second.status).toBe('validating');
    expect(validateInvite).toHaveBeenCalledTimes(1);

    resolveRemote({ ok: true, receipt });
    await expect(first).resolves.toMatchObject({ status: 'active-online' });
    db.close();
  });
});
