/**
 * U1: which device is asking. The app sends its activation receipt as `x-kairos-device: v1.<payload>.<signature>`
 * (base64url of the receipt's verifierPayload, then its verifierSignature). The server checks the ECDSA P-256 signature
 * with the activation public key (the same public value as the app's VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI), so a device
 * is known by its activationId. This is a rate-limit identity, not a login: a receipt proves one invite code was used.
 */
export const KAIROS_DEVICE_HEADER = 'x-kairos-device';
const MAX_TOKEN_LENGTH = 1024;

export type DeviceCheck =
  | Readonly<{ kind: 'recognised'; activationId: string }>
  | Readonly<{ kind: 'not-sent' }>
  | Readonly<{ kind: 'not-recognised' }>
  | Readonly<{ kind: 'not-checked' }>;

function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array | null {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 16 || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  try { return Uint8Array.from(atob(compact), (char) => char.charCodeAt(0)); } catch { return null; }
}

/** The app's parseProofPayload rules (EcdsaActivationReceiptVerifier.ts:33-58), plus a tighter activationId (the Worker issues crypto.randomUUID(), worker.js:259). */
function activationIdOf(payloadText: string): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(payloadText); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.proofVersion !== 1 || record.purpose !== 'kairos-activation' || record.receiptVersion !== 1) return null;
  if (typeof record.activationId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(record.activationId)) return null;
  if (typeof record.issuedAt !== 'string' || Number.isNaN(Date.parse(record.issuedAt)) || new Date(Date.parse(record.issuedAt)).toISOString() !== record.issuedAt) return null;
  return record.activationId;
}

let keyCache: { readonly spki: string; readonly key: Promise<CryptoKey> } | null = null;

function publicKey(spki: string): Promise<CryptoKey> | null {
  if (keyCache?.spki === spki) return keyCache.key;
  const bytes = decodeBase64(spki);
  if (bytes === null) return null;
  const key = crypto.subtle.importKey('spki', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  keyCache = { spki, key };
  return key;
}

/** Never throws. 'not-checked' when the server has no usable public key. */
export async function checkDevice(token: string | null, publicKeySpki: string | undefined): Promise<DeviceCheck> {
  if (token === null || token === '') return { kind: 'not-sent' };
  if (typeof publicKeySpki !== 'string' || publicKeySpki.trim() === '') return { kind: 'not-checked' };
  const parts = token.length <= MAX_TOKEN_LENGTH ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== 'v1') return { kind: 'not-recognised' };
  const payload = decodeBase64Url(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (payload === null || signature === null || signature.byteLength !== 64) return { kind: 'not-recognised' };
  const key = publicKey(publicKeySpki.trim());
  if (key === null) return { kind: 'not-checked' };
  try {
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await key, signature, payload))) return { kind: 'not-recognised' };
  } catch {
    keyCache = null;
    return { kind: 'not-checked' };
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(payload); } catch { return { kind: 'not-recognised' }; }
  const activationId = activationIdOf(text);
  return activationId === null ? { kind: 'not-recognised' } : { kind: 'recognised', activationId };
}
