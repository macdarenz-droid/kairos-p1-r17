import type {
  ActivationReceiptVerifier,
  ActivationReceiptVerificationResult,
} from './ActivationReceiptVerifier';
import type { ActivationReceipt } from './activationTypes';

export const KAIROS_ACTIVATION_PROOF_VERSION = 1 as const;
export const KAIROS_ACTIVATION_PROOF_PURPOSE = 'kairos-activation' as const;

export interface EcdsaActivationReceiptVerifierOptions {
  readonly publicKeySpkiBase64: string;
  readonly subtle?: SubtleCrypto;
}

interface ActivationProofPayloadV1 {
  readonly proofVersion: typeof KAIROS_ACTIVATION_PROOF_VERSION;
  readonly purpose: typeof KAIROS_ACTIVATION_PROOF_PURPOSE;
  readonly receiptVersion: 1;
  readonly activationId: string;
  readonly issuedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function parseProofPayload(value: string): ActivationProofPayloadV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isRecord(parsed)
    || parsed.proofVersion !== KAIROS_ACTIVATION_PROOF_VERSION
    || parsed.purpose !== KAIROS_ACTIVATION_PROOF_PURPOSE
    || parsed.receiptVersion !== 1
    || typeof parsed.activationId !== 'string'
    || parsed.activationId.length === 0
    || !isIsoTimestamp(parsed.issuedAt)) {
    return null;
  }

  return {
    proofVersion: KAIROS_ACTIVATION_PROOF_VERSION,
    purpose: KAIROS_ACTIVATION_PROOF_PURPOSE,
    receiptVersion: 1,
    activationId: parsed.activationId,
    issuedAt: parsed.issuedAt,
  };
}

function decodeStandardBase64(value: string): Uint8Array | null {
  const compact = value.trim();
  if (compact.length === 0 || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return null;
  }

  try {
    const binary = globalThis.atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (standard.length % 4)) % 4;
  return decodeStandardBase64(`${standard}${'='.repeat(paddingLength)}`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function proofMatchesReceipt(payload: ActivationProofPayloadV1, receipt: ActivationReceipt): boolean {
  return payload.receiptVersion === receipt.receiptVersion
    && payload.activationId === receipt.activationId
    && payload.issuedAt === receipt.issuedAt;
}

/**
 * Verifies a server-issued activation proof with a deployment-supplied public key.
 * The signed payload is domain-separated and must bind the receipt identity fields.
 */
export class EcdsaActivationReceiptVerifier implements ActivationReceiptVerifier {
  private readonly publicKeyBytes: Uint8Array | null;
  private readonly subtle: SubtleCrypto | undefined;
  private importedKey: Promise<CryptoKey> | null = null;

  constructor(options: EcdsaActivationReceiptVerifierOptions) {
    this.publicKeyBytes = decodeStandardBase64(options.publicKeySpkiBase64);
    this.subtle = options.subtle ?? globalThis.crypto?.subtle;
  }

  private getPublicKey(): Promise<CryptoKey> {
    if (!this.subtle || !this.publicKeyBytes) {
      return Promise.reject(new Error('Activation proof verification is unavailable.'));
    }
    this.importedKey ??= this.subtle.importKey(
      'spki',
      toArrayBuffer(this.publicKeyBytes),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return this.importedKey;
  }

  async verifyReceipt(receipt: ActivationReceipt): Promise<ActivationReceiptVerificationResult> {
    if ((receipt as { receiptVersion?: unknown }).receiptVersion !== 1) {
      return { ok: false, reason: 'unsupported-receipt-version' };
    }

    const payload = parseProofPayload(receipt.verifierPayload);
    const signature = decodeBase64Url(receipt.verifierSignature);
    if (!payload || !proofMatchesReceipt(payload, receipt) || !signature || signature.byteLength !== 64) {
      return { ok: false, reason: 'invalid-receipt' };
    }

    if (!this.subtle || !this.publicKeyBytes) {
      return { ok: false, reason: 'verification-unavailable' };
    }

    try {
      const key = await this.getPublicKey();
      const valid = await this.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        toArrayBuffer(signature),
        toArrayBuffer(new TextEncoder().encode(receipt.verifierPayload)),
      );
      return valid
        ? { ok: true, receipt: { ...receipt } }
        : { ok: false, reason: 'invalid-receipt' };
    } catch {
      return { ok: false, reason: 'verification-unavailable' };
    }
  }
}
