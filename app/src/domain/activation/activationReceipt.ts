/**
 * The activation receipt, and how this device keeps it: metadata key `device.activation.receipt`, storage version 1
 * (`{ storageVersion, storedAt, receipt }`). A `device.` key: never in a backup, kept by a restore (D54).
 *
 * Pure rules, in `domain/` so both layers that read the stored receipt use the same ones (ARCHITECTURE §4): the receipt
 * repository (`services/activation`) and the daily check's one atomic write (`application/activation`), which must know
 * which receipt is stored before it ends one (T-062f).
 */
export const KAIROS_ACTIVATION_RECEIPT_METADATA_KEY = 'device.activation.receipt' as const;
export const KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION = 1 as const;

export interface ActivationReceipt {
  receiptVersion: 1;
  activationId: string;
  issuedAt: string;
  verifierPayload: string;
  verifierSignature: string;
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

export function isActivationReceipt(value: unknown): value is ActivationReceipt {
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

/** The stored row's value read back: a receipt, or why it can't be one. A missing row is the caller's `missing`. */
export function parseStoredActivationReceipt(value: string): StoredActivationReceiptLoadResult {
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

/** The row's value for a receipt saved at `storedAt` (UTC ISO). Throws for anything that isn't a receipt. */
export function storedActivationReceiptValue(receipt: ActivationReceipt, storedAt: string): string {
  if (!isActivationReceipt(receipt)) {
    throw new Error('Activation receipt violates the receipt contract and cannot be persisted.');
  }
  return JSON.stringify({ storageVersion: KAIROS_ACTIVATION_RECEIPT_STORAGE_VERSION, storedAt, receipt: { ...receipt } });
}

/** Which activation a receipt is: the Worker knows a device by these two (D277), and no two activations share both. */
export type ActivationIdentity = Pick<ActivationReceipt, 'activationId' | 'issuedAt'>;

export function isSameActivation(a: ActivationIdentity, b: ActivationIdentity): boolean {
  return a.activationId === b.activationId && a.issuedAt === b.issuedAt;
}
