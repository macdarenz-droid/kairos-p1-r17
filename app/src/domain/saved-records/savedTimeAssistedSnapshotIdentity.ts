import type { SavedTimeAssistedSnapshotId } from './savedTimeAssistedSnapshotContract';

/**
 * P23.1 Saved time-assisted snapshot identity owner: the sole allocator for
 * fresh SavedTimeAssistedSnapshotId values, using the same platform UUID
 * mechanism as the other stable Kairos identities and independent of Saved
 * Analysis, drawing and trade identities.
 */
export function createSavedTimeAssistedSnapshotId(): SavedTimeAssistedSnapshotId {
  return crypto.randomUUID();
}
