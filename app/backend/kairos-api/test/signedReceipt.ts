/** Test support: an activation key pair and receipt tokens signed the way the activation Worker signs (worker.js:108-141). */
export const ACTIVATION_ID = '7f0c7c55-8a53-4c61-9d0b-5a8d6d0e2b11';

export const GOOD_PAYLOAD = { proofVersion: 1, purpose: 'kairos-activation', receiptVersion: 1, activationId: ACTIVATION_ID, issuedAt: '2026-09-20T10:00:00.000Z' };

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface ActivationKeys { readonly privateKey: CryptoKey; readonly spki: string }

export async function activationKeys(): Promise<ActivationKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array((await crypto.subtle.exportKey('spki', pair.publicKey)) as ArrayBuffer);
  return { privateKey: pair.privateKey, spki: btoa(String.fromCharCode(...spki)) };
}

export async function signBytes(privateKey: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes));
}

export async function deviceToken(privateKey: CryptoKey, payload: unknown = GOOD_PAYLOAD): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return `v1.${base64Url(bytes)}.${base64Url(await signBytes(privateKey, bytes))}`;
}
