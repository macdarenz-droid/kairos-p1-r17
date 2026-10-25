/**
 * Signed activation receipts. The app checks a receipt on the device with the public key (EcdsaActivationReceiptVerifier.ts)
 * and kairos-api checks the same signature (device.ts), so the signed text, its key order included, and the receipt's
 * fields are a contract every installed build relies on: receipt version 1, ECDSA P-256 with SHA-256, the raw 64-byte
 * signature in base64url.
 */
const encoder = new TextEncoder();

export interface ActivationReceipt {
  readonly receiptVersion: 1;
  readonly activationId: string;
  readonly issuedAt: string;
  readonly verifierPayload: string;
  readonly verifierSignature: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Throws when the secret is missing, blank or not a P-256 PKCS#8 key. */
async function signingKey(privateKeyBase64: string | undefined): Promise<CryptoKey> {
  if (typeof privateKeyBase64 !== 'string' || privateKeyBase64.trim().length === 0) {
    throw new Error('Signing key is not configured.');
  }
  return crypto.subtle.importKey('pkcs8', base64ToBytes(privateKeyBase64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Throws instead of answering when it can't sign, so the caller uses nothing up. */
export async function createSignedReceipt(privateKeyBase64: string | undefined, activationId: string, issuedAt: string): Promise<ActivationReceipt> {
  const verifierPayload = JSON.stringify({
    proofVersion: 1,
    purpose: 'kairos-activation',
    receiptVersion: 1,
    activationId,
    issuedAt,
  });
  const key = await signingKey(privateKeyBase64);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(verifierPayload)));
  if (signature.byteLength !== 64) throw new Error('Unexpected ECDSA signature length.');
  return {
    receiptVersion: 1,
    activationId,
    issuedAt,
    verifierPayload,
    verifierSignature: base64Url(signature),
  };
}
