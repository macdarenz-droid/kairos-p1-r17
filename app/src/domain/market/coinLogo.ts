/**
 * T-061f (D272): what a coin logo may be on this device. The Kairos server sends each logo as a data address
 * (`data:image/png;base64,…`), so showing one asks no other host; this rule is checked again on every read, from the
 * server and from the device's kept copy, before an `<img>` ever gets it. Only PNG, JPEG and WebP, whose first bytes
 * must say so (never SVG: an image that can hold code), at most 48 KB of text. Remote content is data, never code.
 */
declare const coinLogoAddress: unique symbol;
/** A checked logo: the only kind of address Home's coin icon shows. */
export type CoinLogoAddress = string & { readonly [coinLogoAddress]: true };

/** 48 KB of text: the server's 32 KB of bytes as base64, with room to spare. */
export const COIN_LOGO_MAX_LENGTH = 49_152;
/** A coin as the logo routes name it (BTC): 1 to 20 of A–Z and 0–9. */
export const COIN_SYMBOL = /^[A-Z0-9]{1,20}$/;

const DATA_ADDRESS = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Each kind's signature at the start of its bytes ("RIFF", four size bytes, "WEBP" for WebP). */
function startsAs(kind: string, bytes: string): boolean {
  const at = (offset: number, signature: readonly number[]) => signature.every((code, index) => bytes.charCodeAt(offset + index) === code);
  if (kind === 'png') return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (kind === 'jpeg') return at(0, [0xff, 0xd8, 0xff]);
  return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
}

/** The logo when it is a PNG, JPEG or WebP data address of at most 48 KB whose first bytes are that kind; else null. */
export function parseCoinLogoAddress(value: unknown): CoinLogoAddress | null {
  if (typeof value !== 'string' || value.length > COIN_LOGO_MAX_LENGTH) return null;
  const match = DATA_ADDRESS.exec(value);
  if (match === null) return null;
  const [, kind, data] = match as unknown as [string, string, string];
  // Whole base64 only, and enough of it for the longest signature (12 bytes).
  if (data.length % 4 !== 0 || data.length < 16) return null;
  let head: string;
  try { head = atob(data.slice(0, 16)); } catch { return null; }
  return startsAs(kind, head) ? value as CoinLogoAddress : null;
}
