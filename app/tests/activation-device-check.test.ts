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
const PAYLOAD_2 = '{"proofVersion":1,"purpose":"kairos-activation","receiptVersion":1,"activationId":"a-8","issuedAt":"2026-10-20T09:30:00.000Z"}';
/** The same device after the trader typed the code again: a newer activation. */
const newer: ActivationReceipt = { receiptVersion: 1, activationId: 'a-8', issuedAt: '2026-10-20T09:30:00.000Z', verifierPayload: PAYLOAD_2, verifierSignature: 'bmV3ZXI' };
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

  // Fix r1 (B1): several tabs can be open; an answer is about the receipt the asking tab holds.
  it('an old tab never ends a newer activation: tab C\'s "removed" for the old receipt leaves tab B\'s new one', async () => {
    // Tabs A and C are open with the same receipt.
    const { db, coordinator: tabA } = await activeDevice(async () => ({ ok: true, status: 'removed' }));
    const tabC = coordinatorFor(db, async () => ({ ok: true, status: 'removed' }));
    expect((await tabC.coordinator.bootstrap()).status).toBe('active-offline');
    // A hears "removed": the receipt is deleted and why is saved.
    expect(await tabA.checkThisDevice(seen(T0))).toBe('removed');
    // The trader opens tab B and types the code again: a newer receipt.
    const tabB = coordinatorFor(db, async () => ({ ok: true, status: 'active' }), { activation: { ok: true, receipt: newer } });
    expect((await tabB.coordinator.bootstrap()).reason).toBe('device-removed');
    expect((await tabB.coordinator.activate({ inviteCode: '7Q4M-X2PB-9HRT-K3VD', appVersion: '0.2.0', buildId: 'test' })).status).toBe('active-online');

    // A day later old tab C comes back on screen and asks with the old receipt's token.
    expect(await tabC.coordinator.checkThisDevice(seen(at(25 * HOUR)))).toBe('unchanged');
    expect(tabC.checkDevice).toHaveBeenCalledTimes(1);
    expect(await receipts(db).load()).toMatchObject({ status: 'stored', receipt: newer });
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: T0.toISOString(), ended: null });
    expect(await coordinatorFor(db, async () => ({ ok: true, status: 'active' })).coordinator.bootstrap()).toMatchObject({ status: 'active-offline', receipt: newer });
  });

  it('an old tab\'s "active" never clears the reason saved for a newer receipt', async () => {
    // Tab C is open with the old receipt.
    const { db, coordinator: tabC } = await activeDevice(async () => ({ ok: true, status: 'active' }));
    // Another tab typed the code again, and later heard "removed" for that newer receipt.
    await receipts(db).saveServerIssuedReceipt(newer);
    const tabB = coordinatorFor(db, async () => ({ ok: true, status: 'removed' }));
    expect((await tabB.coordinator.bootstrap()).receipt).toEqual(newer);
    expect(await tabB.coordinator.checkThisDevice(seen(T0))).toBe('removed');

    // A day later old tab C asks with the old receipt, which the server still knows as in use.
    expect(await tabC.checkThisDevice(seen(at(25 * HOUR)))).toBe('unchanged');
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: T0.toISOString(), ended: 'removed' });
    expect((await coordinatorFor(db, async () => ({ ok: true, status: 'active' })).coordinator.bootstrap()).reason).toBe('device-removed');
  });

  it('a tab whose receipt another tab already ended hears it too, and says so', async () => {
    const { db, coordinator: tabA } = await activeDevice(async () => ({ ok: true, status: 'revoked' }));
    const tabC = coordinatorFor(db, async () => ({ ok: true, status: 'revoked' }));
    await tabC.coordinator.bootstrap();
    expect(await tabA.checkThisDevice(seen(T0))).toBe('revoked');

    expect(await tabC.coordinator.checkThisDevice(seen(at(25 * HOUR)))).toBe('revoked');
    expect(await db.metadata.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY)).toBeUndefined();
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: at(25 * HOUR).toISOString(), ended: 'revoked' });
  });

  it('a last check "in the future" (the clock moved back) is due, and the new time is saved', async () => {
    const { db, coordinator, checkDevice } = await activeDevice(async () => ({ ok: true, status: 'active' }));
    await db.metadata.put({ key: activationCheckMetadataKey, value: JSON.stringify({ version: 1, checkedAt: at(5 * HOUR).toISOString(), ended: null }), updatedAt: at(5 * HOUR).toISOString() });

    expect(await coordinator.checkThisDevice(seen(T0))).toBe('active');
    expect(checkDevice).toHaveBeenCalledTimes(1);
    expect(await storedCheck(db)).toEqual({ version: 1, checkedAt: T0.toISOString(), ended: null });
  });

  it('after a try that changed nothing, this session waits an hour, however often it comes back on screen', async () => {
    const { db, coordinator, checkDevice } = await activeDevice(async () => ({ ok: false, reason: 'service-error' }));

    expect(await coordinator.checkThisDevice(seen(T0))).toBe('unchanged');
    for (const minutes of [0, 1, 10, 30, 59]) {
      expect(await coordinator.checkThisDevice(seen(at(minutes * 60_000))), `${minutes} min`).toBe('not-due');
    }
    expect(checkDevice).toHaveBeenCalledTimes(1);
    expect(await coordinator.checkThisDevice(seen(at(HOUR)))).toBe('unchanged');
    expect(checkDevice).toHaveBeenCalledTimes(2);
    expect(await coordinator.checkThisDevice(seen(at(HOUR + 60_000)))).toBe('not-due');
    expect(checkDevice).toHaveBeenCalledTimes(2);

    // Nothing is stored for the pause: the next start may ask at once.
    expect(await storedCheck(db)).toBeUndefined();
    const nextStart = coordinatorFor(db, async () => ({ ok: true, status: 'active' }));
    await nextStart.coordinator.bootstrap();
    expect(await nextStart.coordinator.checkThisDevice(seen(at(HOUR + 60_000)))).toBe('active');
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
