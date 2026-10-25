/**
 * T-062f (D278, D285): the daily check's record on this device, metadata key `device.activation.check.v1`, as
 * `{ version: 1, checkedAt, ended }`. It is device-only like D226's and D228's keys: never in a backup
 * (`backupSnapshot.ts`), and kept by a restore (`MetadataRepository.replaceAll`). Nothing stored changes shape (D285).
 *
 * Every write is one atomic metadata write. Ending this device's invite deletes its receipt in that same write, so the
 * next start never finds a receipt without its reason, or a reason beside a receipt.
 *
 * An answer is about one receipt: the one the asking tab holds. Several tabs can be open, and another one may already
 * have stored a newer receipt (the trader typed the code again). So each write first reads, in the same transaction,
 * which receipt is stored, and acts only for that same receipt (fix r1). An old tab's answer never deletes a newer
 * receipt, and never clears the reason saved for another one.
 *
 * The coordinator (`services/activation/ActivationCoordinator.ts`) decides when to ask and what an answer means; this
 * file only keeps it. The receipt's stored contract is `domain/activation/activationReceipt.ts`.
 */
import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import {
  isSameActivation,
  KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
  parseStoredActivationReceipt,
  type ActivationIdentity,
} from '../../domain/activation/activationReceipt';
import type { ActivationCheckStore } from '../../services/activation/ActivationCoordinator';
import type { ActivationCheckRecord, ActivationEnded } from '../../services/activation/activationTypes';

export const activationCheckMetadataKey = 'device.activation.check.v1';

/** Not the journal: other tabs aren't told to read their lists again. */
const QUIET = Object.freeze({ announce: false });

const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const isEnded = (value: unknown): value is ActivationEnded | null => value === null || value === 'removed' || value === 'revoked';

/** The stored record, or null when there is none or it is damaged: a damaged record reads as never checked. */
async function readRecord(metadata: MetadataRepository): Promise<ActivationCheckRecord | null> {
  const stored = await metadata.get(activationCheckMetadataKey);
  if (!stored) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored.value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { version, checkedAt, ended } = parsed as Record<string, unknown>;
  if (version !== 1 || !isInstant(checkedAt) || !isEnded(ended)) return null;
  return Object.freeze({ version: 1, checkedAt, ended });
}

async function putRecord(metadata: MetadataRepository, record: ActivationCheckRecord): Promise<void> {
  await metadata.put({ key: activationCheckMetadataKey, value: JSON.stringify(record), updatedAt: record.checkedAt });
}

/** Which receipt is stored now: the same one the answer was about, none, or another (a newer one, or one that can't be read). */
async function storedReceiptIs(metadata: MetadataRepository, checked: ActivationIdentity): Promise<'same' | 'none' | 'other'> {
  const row = await metadata.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
  if (!row) return 'none';
  const stored = parseStoredActivationReceipt(row.value);
  return stored.status === 'stored' && isSameActivation(stored.receipt, checked) ? 'same' : 'other';
}

/** The check's record on this database, for the coordinator (main.tsx builds it). */
export function createActivationCheckStore(db: KairosDatabase): ActivationCheckStore {
  return Object.freeze({
    load: () => readRecord(createKairosRepositories(db).metadata),
    // Only for the receipt still stored: an old tab's "active" must not clear the reason saved for another receipt.
    saveActive: (checkedAt: string, checked: ActivationIdentity) => runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      if (await storedReceiptIs(repositories.metadata, checked) !== 'same') return false;
      await putRecord(repositories.metadata, { version: 1, checkedAt, ended: null });
      return true;
    }, QUIET),
    // The checked receipt is deleted with the reason saved; with no receipt left (another tab ended it), only the
    // reason is saved; another receipt is never touched.
    endThisDevice: (ended: ActivationEnded, checkedAt: string, checked: ActivationIdentity) => runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      const stored = await storedReceiptIs(repositories.metadata, checked);
      if (stored === 'other') return false;
      if (stored === 'same') await repositories.metadata.delete(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
      await putRecord(repositories.metadata, { version: 1, checkedAt, ended });
      return true;
    }, QUIET),
    clearEnded: async () => {
      await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
        const record = await readRecord(repositories.metadata);
        if (record === null || record.ended === null) return;
        await putRecord(repositories.metadata, { ...record, ended: null });
      }, QUIET);
    },
  });
}
