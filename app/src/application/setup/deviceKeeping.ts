/**
 * T-054c (D228): keeping the journal on this device. The install card's "Not now" and "Keep my data asked" are this
 * device's own (`device.*`: never in a backup, kept by a restore). A missing or damaged row reads as not set.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import { inspectStorageDurability, requestPersistentStorage, type StorageDurabilityStatus } from '../../pwa/storageDurability';

export const installCardMetadataKey = 'device.install-card.v1';
export const persistAskedMetadataKey = 'device.storage.persist-asked.v1';

const wallClock = (): string => new Date().toISOString();
const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

/** When the row's one instant field was set, or null when missing or damaged. */
async function readInstant(metadata: MetadataRepository, key: string, field: string): Promise<string | null> {
  const stored = await metadata.get(key);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return record.version === 1 && isInstant(record[field]) ? record[field] : null;
  } catch {
    return null;
  }
}

async function writeInstant(db: KairosDatabase, key: string, field: string, now: () => string): Promise<boolean> {
  try {
    const at = now();
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      await repositories.metadata.put({ key, value: JSON.stringify({ version: 1, [field]: at }), updatedAt: at });
    });
    return true;
  } catch {
    return false;
  }
}

/** Whether the trader chose "Not now" on the install card on this device. */
export async function loadInstallCardHidden(db: KairosDatabase): Promise<boolean> {
  return (await readInstant(createKairosRepositories(db).metadata, installCardMetadataKey, 'hiddenAt')) !== null;
}

export type InstallCardWriteResult = { readonly ok: true } | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'install-card-save-failed' };

/** "Not now": the install card stays hidden on this device. */
export async function hideInstallCard(db: KairosDatabase, dependencies: { readonly now?: () => string } = {}): Promise<InstallCardWriteResult> {
  return await writeInstant(db, installCardMetadataKey, 'hiddenAt', dependencies.now ?? wallClock)
    ? { ok: true }
    : { ok: false, type: 'storage-error', reason: 'install-card-save-failed' };
}

/** The browser's storage durability, as `pwa/storageDurability.ts` reads and asks it; tests pass fakes. */
export interface KeepMyDataPorts {
  readonly inspect: () => Promise<StorageDurabilityStatus>;
  readonly request: () => Promise<StorageDurabilityStatus>;
}
const browserDurability: KeepMyDataPorts = Object.freeze({ inspect: inspectStorageDurability, request: requestPersistentStorage });

/** Not asked (already asked, nothing to ask, or the flag could not be saved), or asked and kept or not kept. */
export type KeepMyDataResult = 'not-asked' | 'kept' | 'not-kept';

/**
 * "Keep my data", asked once on this device, after a trade is saved in the Journal: only while the browser may clear
 * the data (`best-effort`). The flag is saved first, so a refused or failed ask is never repeated; when it cannot be
 * saved, nothing is asked (the next save tries again).
 */
export async function askToKeepDataOnce(db: KairosDatabase, ports: KeepMyDataPorts = browserDurability, dependencies: { readonly now?: () => string } = {}): Promise<KeepMyDataResult> {
  try {
    if ((await readInstant(createKairosRepositories(db).metadata, persistAskedMetadataKey, 'askedAt')) !== null) return 'not-asked';
  } catch {
    return 'not-asked';
  }
  if ((await ports.inspect()).state !== 'best-effort') return 'not-asked';
  if (!(await writeInstant(db, persistAskedMetadataKey, 'askedAt', dependencies.now ?? wallClock))) return 'not-asked';
  return (await ports.request()).state === 'persistent' ? 'kept' : 'not-kept';
}
