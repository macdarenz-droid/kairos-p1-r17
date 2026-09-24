import type { KairosDatabase } from '../database/KairosDatabase';
import type { DatabaseMetadataRecord } from '../database/schema';
import { isKairosDeviceScopedMetadataKey } from './metadataScope';

export class MetadataRepository {
  constructor(private readonly db: KairosDatabase) {}

  async get(key: string): Promise<DatabaseMetadataRecord | undefined> {
    return this.db.metadata.get(key);
  }

  async listAll(): Promise<DatabaseMetadataRecord[]> {
    return this.db.metadata.toArray();
  }

  async put(record: DatabaseMetadataRecord): Promise<void> {
    await this.db.metadata.put(record);
  }

  /**
   * Replaces backup-scoped metadata while retaining device-scoped control state.
   * This keeps restore atomic without allowing a user backup to clone or erase
   * installation-local activation evidence.
   */
  async replaceAll(records: readonly DatabaseMetadataRecord[]): Promise<void> {
    const deviceScoped = (await this.db.metadata.toArray())
      .filter((record) => isKairosDeviceScopedMetadataKey(record.key));

    await this.db.metadata.clear();
    const replacement = [
      ...records.filter((record) => !isKairosDeviceScopedMetadataKey(record.key)),
      ...deviceScoped,
    ];
    if (replacement.length > 0) {
      await this.db.metadata.bulkPut(replacement.map((record) => ({ ...record })));
    }
  }

  async delete(key: string): Promise<void> {
    await this.db.metadata.delete(key);
  }
}
