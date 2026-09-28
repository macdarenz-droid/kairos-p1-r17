import type { MetadataRepository } from '../../data/repositories/MetadataRepository';
import type { DatabaseMetadataRecord } from '../../data/database/schema';
import type { ActivationReceipt } from './activationTypes';

export const KAIROS_ACTIVATION_RECEIPT_METADATA_KEY = 'device.activation.receipt' as const;
export const KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION = 1 as const;

interface PersistedActivationReceiptV1 {
  readonly storageVersion: typeof KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION;
  readonly storedAt: string;
  readonly receipt: ActivationReceipt;
}

export type StoredActivationReceiptLoadResult =
  | { readonly status: 'missing' }
  | { readonly status: 'corrupt'; readonly error: string }
  | { readonly status: 'stored'; readonly receipt: ActivationReceipt; readonly storedAt: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isActivationReceipt(value: unknown): value is ActivationReceipt {
  if (!isRecord(value)) return false;
  return value.receiptVersion === 1
    && typeof value.activationId === 'string'
    && value.activationId.length > 0
    && isIsoTimestamp(value.issuedAt)
    && typeof value.verifierPayload === 'string'
    && value.verifierPayload.length > 0
    && typeof value.verifierSignature === 'string'
    && value.verifierSignature.length > 0;
}

function parsePersistedActivationReceipt(value: string): StoredActivationReceiptLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { status: 'corrupt', error: 'Stored activation receipt is not valid JSON.' };
  }

  if (!isRecord(parsed)
    || parsed.storageVersion !== KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION
    || !isIsoTimestamp(parsed.storedAt)
    || !isActivationReceipt(parsed.receipt)) {
    return { status: 'corrupt', error: 'Stored activation receipt violates the local receipt contract.' };
  }

  return {
    status: 'stored',
    receipt: { ...parsed.receipt },
    storedAt: parsed.storedAt,
  };
}

export class ActivationReceiptRepository {
  constructor(private readonly repository: MetadataRepository) {}

  async load(): Promise<StoredActivationReceiptLoadResult> {
    const record = await this.repository.get(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
    if (!record) return { status: 'missing' };
    return parsePersistedActivationReceipt(record.value);
  }

  async saveServerIssuedReceipt(
    receipt: ActivationReceipt,
    storedAt: Date = new Date(),
  ): Promise<void> {
    if (!isActivationReceipt(receipt)) {
      throw new Error('Activation receipt violates the receipt contract and cannot be persisted.');
    }

    const persisted: PersistedActivationReceiptV1 = Object.freeze({
      storageVersion: KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION,
      storedAt: storedAt.toISOString(),
      receipt: Object.freeze({ ...receipt }),
    });
    const record: DatabaseMetadataRecord = {
      key: KAIROS_ACTIVATION_RECEIPT_METADATA_KEY,
      value: JSON.stringify(persisted),
      updatedAt: persisted.storedAt,
    };
    await this.repository.put(record);
  }

  async clear(): Promise<void> {
    await this.repository.delete(KAIROS_ACTIVATION_RECEIPT_METADATA_KEY);
  }
}
