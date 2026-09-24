import type { SavedTimeAssistedSnapshot, SavedTimeAssistedSnapshotId } from '../../app/savedTimeAssistedSnapshotContract';
import type { KairosDatabase } from '../database/KairosDatabase';

/** P23.2 raw persistence of the P23.1 contract: stable id store, no application orchestration. */
export class SavedTimeAssistedSnapshotRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: SavedTimeAssistedSnapshotId) { return this.db.savedTimeAssistedSnapshots.get(id); }
  listAll() { return this.db.savedTimeAssistedSnapshots.toArray(); }
  put(record: SavedTimeAssistedSnapshot) { return this.db.savedTimeAssistedSnapshots.put(record).then(() => undefined); }
  delete(id: SavedTimeAssistedSnapshotId) { return this.db.savedTimeAssistedSnapshots.delete(id); }
  async replaceAll(records: readonly SavedTimeAssistedSnapshot[]) {
    await this.db.savedTimeAssistedSnapshots.clear();
    if (records.length) await this.db.savedTimeAssistedSnapshots.bulkPut(records.map((record) => structuredClone(record)));
  }
}
