import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activationCheckMetadataKey, createActivationCheckStore } from '../src/application/activation/activationCheck';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore } from '../src/application/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import {
  ActivationCoordinator,
  ActivationReceiptRepository,
  KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
  type ActivationCheckStore,
  type ActivationDeviceCheckResult,
  type ActivationReceipt,
  type ActivationValidationResult,
} from '../src/services/activation';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

async function database(): Promise<KairosDatabase> {
  const name = `kairos-device-check-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  return db;
}

const PAYLOAD = '{"proofVersion":1,"purpose":"kairos-activation","receiptVersion":1,"activationId":"a-7","issuedAt":"2026-10-03T08:00:00.000Z"}';
const receipt: ActivationReceipt = { receiptVersion: 1, activationId: 'a-7', issuedAt: '2026-10-03T08:00:00.000Z', verifierPayload: PAYLOAD, verifierSignature: 'c2lnbmF0dXJl' };
const T0 = new Date('2026-10-20T09:00:00.000Z');
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);
const seen = (now: Date) => ({ now, online: true, visible: true });

const receipts = (db: KairosDatabase) => new ActivationReceiptRepository(createKairosRepositories(db).metadata);
const storedCheck = async (db: KairosDatabase) => {
  const row = await db.metadata.get(activationCheckMetadataKey);
  return row === undefined ? undefined : JSON.parse(row.value) as unknown;
};

/** A coordinator as ActivationBootstrap builds it, on a test database, with the Worker's /devices/check faked. */
function coordinatorFor(db: KairosDatabase, answers: () => Promise<ActivationDeviceCheckResult>, options: { readonly checks?: ActivationCheckStore; readonly activation?: ActivationValidationResult } = {}) {
  const checkDevice = vi.fn((_token: string) => answers());
  const validateInvite = vi.fn(async (): Promise<ActivationValidationResult> => options.activation ?? { ok: false, reason: 'service-error' });
  const coordinator = new ActivationCoordinator({
    adapter: { validateInvite },
    repository: receipts(db),
    verifier: { async verifyReceipt(candidate) { return { ok: true, receipt: { ...candidate } }; } },
    devices: { checkDevice },
    checks: options.checks ?? createActivationCheckStore(db),
    newRequestId: () => 'request-0001',
  });
  return { coordinator, checkDevice, validateInvite };
}

async function activeDevice(answers: () => Promise<ActivationDeviceCheckResult>, checks?: (db: KairosDatabase) => ActivationCheckStore) {
  const db = await database();
  await receipts(db).saveServerIssuedReceipt(receipt, new Date('2026-10-03T08:00:01.000Z'));
  const built = coordinatorFor(db, answers, checks === undefined ? {} : { checks: checks(db) });
  expect((await built.coordinator.bootstrap()).status).toBe('active-offline');
  return { db, ...built };
}

describe('T-062f the daily check (D278, D285)', () => {
  it('asks at most once a day, and never while offline or hidden', async () => {
    let load!: ReturnType<typeof vi.fn<ActivationCheckStore['load']>>;
    const { db, coordinator, checkDevice } = await activeDevice(async () => ({ ok: true, status: 'active' }), (db) => {
      const store = createActivationCheckStore(db);
      load = vi.fn<ActivationCheckStore['load']>(store.load);
      return { ...store, load };
    });

    expect(await coordinator.checkThisDevice({ now: T0, online: false, visible: true })).toBe('skipped');
    expect(await coordinator.checkThisDevice({ now: T0, online: true, visible: false })).toBe('skipped');
    expect(checkDevice).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();

    expect(await coordinator.checkThisDevice(seen(T0))).toBe('active');
    expect(checkDevice).toHaveBeenCalledTimes(1);
    expect(checkDevice.mock.calls[0]![0]).toMatch(/^v1\.[A-Za-z0-9_-]+\.c2lnbmF0dXJl$/);
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: T0.toISOString(), ended: null });

    expect(await coordinator.checkThisDevice(seen(at(23 * HOUR + 59 * 60_000)))).toBe('not-due');
    expect(checkDevice).toHaveBeenCalledTimes(1);
    expect(await coordinator.checkThisDevice(seen(at(24 * HOUR)))).toBe('active');
    expect(checkDevice).toHaveBeenCalledTimes(2);
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: at(24 * HOUR).toISOString(), ended: null });
  });

  it('asks once when called twice at the same moment', async () => {
    let answer!: (value: ActivationDeviceCheckResult) => void;
    const { coordinator, checkDevice } = await activeDevice(() => new Promise((resolve) => { answer = resolve; }));
    const first = coordinator.checkThisDevice(seen(T0));
    expect(await coordinator.checkThisDevice(seen(T0))).toBe('skipped');
    await vi.waitFor(() => expect(checkDevice).toHaveBeenCalledTimes(1));
    answer({ ok: true, status: 'active' });
    expect(await first).toBe('active');
  });

  it.each([
    ['removed', 'device-removed'],
    ['revoked', 'code-revoked'],
  ] as const)('%s: the receipt is gone and the reason is saved in one write; the session carries on, the next start asks for a code', async (status, reason) => {
    const { db, coordinator, checkDevice } = await activeDevice(async () => ({ ok: true, status }));
    const transaction = vi.spyOn(db, 'transaction');

    expect(await coordinator.checkThisDevice(seen(T0))).toBe(status);
    expect(transaction.mock.calls.filter(([mode]) => mode === 'rw')).toHaveLength(1);
    expect(await db.metadata.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY)).toBeUndefined();
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: T0.toISOString(), ended: status });
    // This session carries on, and asks nothing more.
    expect(coordinator.getSnapshot().status).toBe('active-offline');
    expect(await coordinator.checkThisDevice(seen(at(25 * HOUR)))).toBe('skipped');
    expect(checkDevice).toHaveBeenCalledTimes(1);

    const nextStart = coordinatorFor(db, async () => ({ ok: true, status: 'active' }));
    expect(await nextStart.coordinator.bootstrap()).toEqual({ status: 'activation-required', receipt: null, message: null, reason });
  });

  it('keeps the receipt when the reason can\'t be saved: one write, all or nothing', async () => {
    const { db, coordinator } = await activeDevice(async () => ({ ok: true, status: 'removed' }));
    vi.spyOn(db.metadata, 'put').mockRejectedValueOnce(new Error('The phone is full.'));

    expect(await coordinator.checkThisDevice(seen(T0))).toBe('unchanged');
    expect(await db.metadata.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY)).toBeDefined();
    expect(await storedCheck(db)).toBeUndefined();
    expect((await coordinatorFor(db, async () => ({ ok: true, status: 'active' })).coordinator.bootstrap()).status).toBe('active-offline');
  });

  it.each([
    ['a device the server doesn\'t know', async (): Promise<ActivationDeviceCheckResult> => ({ ok: false, reason: 'device-not-recognised' })],
    ['an answer Kairos can\'t read', async (): Promise<ActivationDeviceCheckResult> => ({ ok: false, reason: 'service-error' })],
    ['no connection', async (): Promise<ActivationDeviceCheckResult> => ({ ok: false, reason: 'network-unavailable' })],
    ['too many calls', async (): Promise<ActivationDeviceCheckResult> => ({ ok: false, reason: 'rate-limited' })],
    ['a check that throws', async (): Promise<ActivationDeviceCheckResult> => { throw new Error('bug'); }],
  ])('%s changes nothing and saves nothing', async (_case, answers) => {
    const { db, coordinator, checkDevice } = await activeDevice(answers);

    expect(await coordinator.checkThisDevice(seen(T0))).toBe('unchanged');
    expect(await db.metadata.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY)).toBeDefined();
    expect(await storedCheck(db)).toBeUndefined();
    expect(coordinator.getSnapshot().status).toBe('active-offline');
    // Nothing saved: the next moment asks again.
    expect(await coordinator.checkThisDevice(seen(at(HOUR)))).toBe('unchanged');
    expect(checkDevice).toHaveBeenCalledTimes(2);
  });

  it('a new activation clears ended, and keeps when the last answer came', async () => {
    const { db, coordinator } = await activeDevice(async () => ({ ok: true, status: 'removed' }));
    expect(await coordinator.checkThisDevice(seen(T0))).toBe('removed');

    const again = coordinatorFor(db, async () => ({ ok: true, status: 'active' }), { activation: { ok: true, receipt } });
    expect((await again.coordinator.bootstrap()).reason).toBe('device-removed');
    expect((await again.coordinator.activate({ inviteCode: '7Q4M-X2PB-9HRT-K3VD', appVersion: '0.2.0', buildId: 'test' })).status).toBe('active-online');
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: T0.toISOString(), ended: null });
    expect(await db.metadata.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY)).toBeDefined();
    expect(await coordinatorFor(db, async () => ({ ok: true, status: 'active' })).coordinator.bootstrap()).toMatchObject({ status: 'active-offline', receipt });
  });

  it('reads a damaged record as never checked', async () => {
    const { db, coordinator, checkDevice } = await activeDevice(async () => ({ ok: true, status: 'active' }));
    await db.metadata.put({ key: activationCheckMetadataKey, value: '{"version":1,"checkedAt":"yesterday","ended":"gone"}', updatedAt: T0.toISOString() });

    expect(await coordinator.checkThisDevice(seen(T0))).toBe('active');
    expect(checkDevice).toHaveBeenCalledTimes(1);
  });

  it('the key stays out of a backup and is kept by a restore', async () => {
    const { db, coordinator } = await activeDevice(async () => ({ ok: true, status: 'active' }));
    expect(await coordinator.checkThisDevice(seen(T0))).toBe('active');
    const kept = await db.metadata.get(activationCheckMetadataKey);
    expect(kept).toBeDefined();

    const exported = await exportKairosBackup(db, at(HOUR));
    if (!exported.ok) throw new Error('the backup failed');
    expect(exported.file.contents).not.toContain(activationCheckMetadataKey);

    await db.metadata.put({ key: activationCheckMetadataKey, value: JSON.stringify({ version: 1, checkedAt: at(2 * HOUR).toISOString(), ended: 'removed' }), updatedAt: at(2 * HOUR).toISOString() });
    const changed = await db.metadata.get(activationCheckMetadataKey);
    const prepared = await prepareBackupRestore(db, exported.file.contents);
    if (!prepared.ok) throw new Error('the restore was refused');
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    // The restore keeps this device's own record as it was just before, never the one from the backup's time.
    expect(await db.metadata.get(activationCheckMetadataKey)).toEqual(changed);
    expect(changed).not.toEqual(kept);
  });
});
