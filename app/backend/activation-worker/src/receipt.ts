/**
 * Signed activation receipts. The app checks a receipt on the device with the public key (EcdsaActivationReceiptVerifier.ts)
 * and kairos-api checks the same signature (device.ts), so the signed text, its key order included, and the receipt's
 * fields are a contract every installed build relies on: receipt version 1, ECDSA P-256 with SHA-256, the raw 64-byte
 * signature in base64url.
 * A device proves which receipt it holds with the token kairos-api already gets (D277); this Worker checks that token
 * with the public half of its own signing key, so it needs no second secret.
 */
const encoder = new TextEncoder();
const P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const;
const MAX_TOKEN_LENGTH = 1024;

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
async function signingKey(privateKeyBase64: string | undefined, extractable = false): Promise<CryptoKey> {
  if (typeof privateKeyBase64 !== 'string' || privateKeyBase64.trim().length === 0) {
    throw new Error('Signing key is not configured.');
  }
  return crypto.subtle.importKey('pkcs8', base64ToBytes(privateKeyBase64), P256, extractable, ['sign']);
}

/**
 * The public half of the signing key, for checking tokens: the private key's JWK without `d`. Throws as signingKey does.
 * The Workers runtime exports an imported PKCS#8 P-256 key as JWK (checked in this package's tests).
 */
async function verifyingKey(privateKeyBase64: string | undefined): Promise<CryptoKey> {
  const jwk = (await crypto.subtle.exportKey('jwk', await signingKey(privateKeyBase64, true))) as JsonWebKey;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('Signing key is not an ECDSA P-256 key.');
  }
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, P256, false, ['verify']);
}

/** For GET /health: 'ready' when the secret is a P-256 private key the Worker can sign and check with. Never its value. */
export async function signingKeyReadiness(privateKeyBase64: string | undefined): Promise<'ready' | 'missing'> {
  try {
    await verifyingKey(privateKeyBase64);
    return 'ready';
  } catch {
    return 'missing';
  }
}

/** Which receipt a device holds: the two fields D1 finds its row by. */
export interface DeviceProof {
  readonly activationId: string;
  readonly issuedAt: string;
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Uint8Array.from(atob(standard + '='.repeat((4 - (standard.length % 4)) % 4)), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

/** The app's rules for a signed payload (EcdsaActivationReceiptVerifier.ts:33-58), with this Worker's activationId shape. */
function proofOf(payloadText: string): DeviceProof | null {
  let parsed: unknown;
  try { parsed = JSON.parse(payloadText); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const payload = parsed as Record<string, unknown>;
  if (payload.proofVersion !== 1 || payload.purpose !== 'kairos-activation' || payload.receiptVersion !== 1) return null;
  if (typeof payload.activationId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(payload.activationId)) return null;
  if (!isIsoTimestamp(payload.issuedAt)) return null;
  return { activationId: payload.activationId, issuedAt: payload.issuedAt };
}

/**
 * Reads a device token, `v1.<base64url of the receipt's verifierPayload>.<its verifierSignature>` (the app's
 * kairosDeviceToken). Null when it is malformed or not signed by this Worker's key. Throws when the key is missing or
 * broken, so the caller answers 500 rather than telling a device it is not recognised.
 */
export async function readDeviceToken(token: unknown, privateKeyBase64: string | undefined): Promise<DeviceProof | null> {
  const key = await verifyingKey(privateKeyBase64);
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const payload = base64UrlToBytes(parts[1]);
  const signature = base64UrlToBytes(parts[2]);
  if (payload === null || signature === null || signature.byteLength !== 64) return null;
  if (!(await crypto.subtle.verify(SIGNATURE, key, signature, payload))) return null;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(payload); } catch { return null; }
  return proofOf(text);
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
  const signature = new Uint8Array(await crypto.subtle.sign(SIGNATURE, key, encoder.encode(verifierPayload)));
  if (signature.byteLength !== 64) throw new Error('Unexpected ECDSA signature length.');
  return {
    receiptVersion: 1,
    activationId,
    issuedAt,
    verifierPayload,
    verifierSignature: base64Url(signature),
  };
}
