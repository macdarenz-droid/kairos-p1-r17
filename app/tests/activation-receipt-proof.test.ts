import { describe, expect, it } from 'vitest';
import {
  EcdsaActivationReceiptVerifier,
  KAIROS_ACTIVATION_PROOF_PURPOSE,
  KAIROS_ACTIVATION_PROOF_VERSION,
  type ActivationReceipt,
} from '../src/services/activation';

function toStandardBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(bytes: ArrayBuffer): string {
  return toStandardBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signedReceipt(overrides: Partial<ActivationReceipt> = {}): Promise<{
  receipt: ActivationReceipt;
  publicKeySpkiBase64: string;
}> {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const activationId = overrides.activationId ?? 'activation-proof-1';
  const issuedAt = overrides.issuedAt ?? '2026-08-31T10:20:00.000Z';
  const payload = overrides.verifierPayload ?? JSON.stringify({
    proofVersion: KAIROS_ACTIVATION_PROOF_VERSION,
    purpose: KAIROS_ACTIVATION_PROOF_PURPOSE,
    receiptVersion: 1,
    activationId,
    issuedAt,
  });
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    new TextEncoder().encode(payload),
  );
  const spki = await crypto.subtle.exportKey('spki', keys.publicKey);

  return {
    receipt: {
      receiptVersion: 1,
      activationId,
      issuedAt,
      verifierPayload: payload,
      verifierSignature: overrides.verifierSignature ?? toBase64Url(signature),
    },
    publicKeySpkiBase64: toStandardBase64(spki),
  };
}

describe('P7.4 activation receipt proof verification', () => {
  it('accepts a correctly bound server proof using only the public verification key', async () => {
    const { receipt, publicKeySpkiBase64 } = await signedReceipt();
    const verifier = new EcdsaActivationReceiptVerifier({ publicKeySpkiBase64 });

    await expect(verifier.verifyReceipt(receipt)).resolves.toEqual({ ok: true, receipt });
  });

  it('rejects top-level receipt tampering even when the signed payload remains unchanged', async () => {
    const { receipt, publicKeySpkiBase64 } = await signedReceipt();
    const verifier = new EcdsaActivationReceiptVerifier({ publicKeySpkiBase64 });

    await expect(verifier.verifyReceipt({ ...receipt, activationId: 'tampered' }))
      .resolves.toEqual({ ok: false, reason: 'invalid-receipt' });
  });

  it('rejects a tampered proof signature', async () => {
    const { receipt, publicKeySpkiBase64 } = await signedReceipt();
    const verifier = new EcdsaActivationReceiptVerifier({ publicKeySpkiBase64 });
    const signature = receipt.verifierSignature;
    const standard = signature.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${standard}${'='.repeat((4 - (standard.length % 4)) % 4)}`;
    const binary = atob(padded);
    const tamperedBytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      tamperedBytes[index] = binary.charCodeAt(index);
    }
    tamperedBytes[0] ^= 0x01;
    const changed = toBase64Url(tamperedBytes.buffer);

    await expect(verifier.verifyReceipt({ ...receipt, verifierSignature: changed }))
      .resolves.toEqual({ ok: false, reason: 'invalid-receipt' });
  });

  it('rejects a valid signature if the signed payload is not for the Kairos activation purpose', async () => {
    const activationId = 'activation-proof-purpose';
    const issuedAt = '2026-08-31T10:21:00.000Z';
    const { receipt, publicKeySpkiBase64 } = await signedReceipt({
      activationId,
      issuedAt,
      verifierPayload: JSON.stringify({
        proofVersion: 1,
        purpose: 'different-purpose',
        receiptVersion: 1,
        activationId,
        issuedAt,
      }),
    });
    const verifier = new EcdsaActivationReceiptVerifier({ publicKeySpkiBase64 });

    await expect(verifier.verifyReceipt(receipt))
      .resolves.toEqual({ ok: false, reason: 'invalid-receipt' });
  });

  it('fails closed when the public verification key cannot be imported', async () => {
    const { receipt } = await signedReceipt();
    const verifier = new EcdsaActivationReceiptVerifier({ publicKeySpkiBase64: 'bm90LWFuLXNwa2kta2V5' });

    await expect(verifier.verifyReceipt(receipt))
      .resolves.toEqual({ ok: false, reason: 'verification-unavailable' });
  });
});
