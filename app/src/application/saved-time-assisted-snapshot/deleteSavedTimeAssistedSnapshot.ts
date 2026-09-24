import type { SavedTimeAssistedSnapshotId } from '../../app/savedTimeAssistedSnapshotContract';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';

export type DeleteSavedTimeAssistedSnapshotResult =
  | { readonly ok: true; readonly savedTimeAssistedSnapshotId: SavedTimeAssistedSnapshotId }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'saved-time-assisted-snapshot-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'saved-time-assisted-snapshot-delete-failed' };

/**
 * P24.1 saved time-assisted snapshot application delete orchestration.
 *
 * Owns only the removal of one saved snapshot by its canonical stable id inside
 * one atomic write (read and delete in the same transaction; a missing record is
 * an explicit not-found result). No journal, Saved Analysis or backup is touched.
 */
export async function deleteSavedTimeAssistedSnapshot(db: KairosDatabase, savedTimeAssistedSnapshotId: SavedTimeAssistedSnapshotId): Promise<DeleteSavedTimeAssistedSnapshotResult> {
  try {
    const existed = await runKairosAtomicWrite(db, ['savedTimeAssistedSnapshots'], async ({ repositories }) => {
      const record = await repositories.savedTimeAssistedSnapshots.get(savedTimeAssistedSnapshotId);
      if (!record) return false;
      await repositories.savedTimeAssistedSnapshots.delete(savedTimeAssistedSnapshotId);
      return true;
    });
    if (!existed) return { ok: false, type: 'not-found', reason: 'saved-time-assisted-snapshot-not-found' };
    return { ok: true, savedTimeAssistedSnapshotId };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-delete-failed' };
  }
}
