import type { MetadataRepository } from '../../data/repositories/MetadataRepository';
import type { DatabaseMetadataRecord } from '../../data/database/schema';
import {
  KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
  parseStoredActivationReceipt,
  storedActivationReceiptValue,
  type ActivationReceipt,
  type StoredActivationReceiptLoadResult,
} from '../../domain/activation/activationReceipt';

// The stored contract is domain/activation/activationReceipt.ts (T-062f); these names stay here for every caller.
export {
  KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
  KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION,
  type StoredActivationReceiptLoadResult,
} from '../../domain/activation/activationReceipt';

export class ActivationReceiptRepository {
  constructor(private readonly repository: MetadataRepository) {}

  async load(): Promise<StoredActivationReceiptLoadResult> {
    const record = await this.repository.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
    if (!record) return { status: 'missing' };
    return parseStoredActivationReceipt(record.value);
  }

  async saveServerIssuedReceipt(
    receipt: ActivationReceipt,
    storedAt: Date = new Date(),
  ): Promise<void> {
    const at = storedAt.toISOString();
    const record: DatabaseMetadataRecord = {
      key: KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
      value: storedActivationReceiptValue(receipt, at),
      updatedAt: at,
    };
    await this.repository.put(record);
  }

  async clear(): Promise<void> {
    await this.repository.delete(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
  }
}
