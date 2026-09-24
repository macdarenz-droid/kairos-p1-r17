import type { SavedTimeAssistedSnapshot, SavedTimeAssistedSnapshotId } from '../../app/savedTimeAssistedSnapshotContract';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { createKairosRepositories } from '../../data/repositories';

export type LoadSavedTimeAssistedSnapshotResult =
  | { readonly ok: true; readonly savedTimeAssistedSnapshot: SavedTimeAssistedSnapshot }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'saved-time-assisted-snapshot-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'saved-time-assisted-snapshot-load-failed' };

export type ListSavedTimeAssistedSnapshotsResult =
  | { readonly ok: true; readonly savedTimeAssistedSnapshots: readonly SavedTimeAssistedSnapshot[] }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'saved-time-assisted-snapshot-list-failed' };

/**
 * P23.4 saved time-assisted snapshot application read orchestration.
 *
 * Owns only the single-record read by the canonical stable id and the
 * whole-store listing (newest save first, ties broken by id) with clone-safe
 * results. Logical truth remains P23.1, raw persistence P23.2, save P23.3.
 */
export async function loadSavedTimeAssistedSnapshot(db: KairosDatabase, savedTimeAssistedSnapshotId: SavedTimeAssistedSnapshotId): Promise<LoadSavedTimeAssistedSnapshotResult> {
  try {
    const record = await createKairosRepositories(db).savedTimeAssistedSnapshots.get(savedTimeAssistedSnapshotId);
    if (!record) return { ok: false, type: 'not-found', reason: 'saved-time-assisted-snapshot-not-found' };
    return { ok: true, savedTimeAssistedSnapshot: structuredClone(record) };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-load-failed' };
  }
}

const newestFirst = (a: SavedTimeAssistedSnapshot, b: SavedTimeAssistedSnapshot): number => (a.savedAt === b.savedAt ? a.id.localeCompare(b.id) : b.savedAt.localeCompare(a.savedAt));

export async function listSavedTimeAssistedSnapshots(db: KairosDatabase): Promise<ListSavedTimeAssistedSnapshotsResult> {
  try {
    const records = await createKairosRepositories(db).savedTimeAssistedSnapshots.listAll();
    return { ok: true, savedTimeAssistedSnapshots: Object.freeze(records.map((record) => structuredClone(record)).sort(newestFirst)) };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'saved-time-assisted-snapshot-list-failed' };
  }
}
