/**
 * T-062f (D278, D285): the daily check's record on this device, metadata key `device.activation.check.v1`, as
 * `{ version: 1, checkedAt, ended }`. It is device-only like D226's and D228's keys: never in a backup
 * (`backupSnapshot.ts`), and kept by a restore (`MetadataRepository.replaceAll`). Nothing stored changes shape (D285).
 *
 * Every write is one atomic metadata write. Ending this device's invite deletes its receipt in that same write, so the
 * next start never finds a receipt without its reason, or a reason beside a receipt. The coordinator
 * (`services/activation/ActivationCoordinator.ts`) decides when to ask and what an answer means; this file only keeps it.
 */
import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import type { ActivationCheckStore } from '../../services/activation/ActivationCoordinator';
import { KAIROS_ACTIVATION_RECEIPT_METADATA_KEY } from '../../services/activation/ActivationReceiptRepository';
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

/** The check's record on this database, for the coordinator (main.tsx builds it). */
export function createActivationCheckStore(db: KairosDatabase): ActivationCheckStore {
  return Object.freeze({
    load: () => readRecord(createKairosRepositories(db).metadata),
    saveActive: async (checkedAt: string) => {
      await runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => putRecord(repositories.metadata, { version: 1, checkedAt, ended: null }), QUIET);
    },
    endThisDevice: async (ended: ActivationEnded, checkedAt: string) => {
      await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
        await repositories.metadata.delete(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
        await putRecord(repositories.metadata, { version: 1, checkedAt, ended });
      }, QUIET);
    },
    clearEnded: async () => {
      await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
        const record = await readRecord(repositories.metadata);
        if (record === null || record.ended === null) return;
        await putRecord(repositories.metadata, { ...record, ended: null });
      }, QUIET);
    },
  });
}
