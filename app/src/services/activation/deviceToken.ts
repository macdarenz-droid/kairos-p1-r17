/**
 * How a device proves which receipt it holds (D277): `v1.<base64url of the receipt's signed payload>.<its signature>`.
 * kairos-api reads it from the `x-kairos-device` header to choose whose rate limit applies (D136), and the activation
 * Worker's device routes (/devices, /devices/remove, /devices/check) read it from the body. Both check the signature;
 * the token is only ever as good as the receipt it came from.
 */
import type { ActivationReceipt } from './activationTypes';

/** Both servers refuse a longer token (kairos-api device.ts, the activation Worker's receipt.ts). */
const MAX_DEVICE_TOKEN_LENGTH = 1024;

/** The token for a stored receipt, or null when the receipt can't make one (a signature that isn't base64url, no payload, too long). */
export function kairosDeviceToken(receipt: ActivationReceipt): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(receipt.verifierSignature) || receipt.verifierPayload === '') return null;
  let binary = '';
  for (const byte of new TextEncoder().encode(receipt.verifierPayload)) binary += String.fromCharCode(byte);
  const token = `v1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${receipt.verifierSignature}`;
  return token.length <= MAX_DEVICE_TOKEN_LENGTH ? token : null;
}
