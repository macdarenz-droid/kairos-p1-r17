// @ts-check
/**
 * The invite code rules (D280), in one place for the Worker and the owner's code tool. Plain JavaScript with JSDoc, so
 * Node runs it unbuilt and the Worker bundles it as it is. It uses only Web Crypto and TextEncoder.
 *
 * - A new code is 16 characters from Crockford's 32 (digits and letters without I, L, O and U), shown in four groups of
 *   four: `7Q4M-X2PB-9HRT-K3VD` (80 bits). D1 stores only the SHA-256 of its 16 characters (the compact form).
 * - Typing is forgiving: case, spaces and dashes don't matter, O reads as 0, and I and L read as 1. A pasted code may
 *   carry invisible characters or full-width letters and digits; they read as the plain ones.
 * - A code made by hand before these rules is stored as the SHA-256 of its text trimmed and in upper case (the exact
 *   form), and still matches that way. The Worker looks a typed code up by both.
 */

/** Crockford's base 32: 32 characters, so each one is 5 bits. */
export const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Characters in a new code, without its dashes. */
export const INVITE_CODE_LENGTH = 16;

const GROUP_LENGTH = 4;
const COMPACT_CODE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
/**
 * Spaces; the dashes a phone keyboard may type (hyphen, the Unicode dashes U+2010 to U+2015, minus); and invisible format
 * characters (Unicode Cf: zero-width space, soft hyphen, word joiner, byte-order mark), which pasting can carry along.
 */
const IGNORED = /[\s\-\u2010-\u2015\u2212\p{Cf}]/gu;
const encoder = new TextEncoder();

/**
 * A new code from 16 random bytes (`crypto.getRandomValues`). Each byte's lowest 5 bits pick one character; 32 divides
 * 256, so every character is equally likely.
 * @param {Uint8Array} bytes
 * @returns {string} the code as shown, `XXXX-XXXX-XXXX-XXXX`
 */
export function inviteCodeFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== INVITE_CODE_LENGTH) {
    throw new TypeError(`An invite code needs exactly ${INVITE_CODE_LENGTH} random bytes.`);
  }
  let compact = '';
  for (const byte of bytes) compact += INVITE_CODE_ALPHABET[byte & 31];
  return formatInviteCode(compact);
}

/**
 * The code as shown: four groups of four, joined by dashes.
 * @param {string} compact 16 characters from the alphabet
 * @returns {string}
 */
export function formatInviteCode(compact) {
  if (typeof compact !== 'string' || !COMPACT_CODE.test(compact)) throw new TypeError('Not a compact invite code.');
  const groups = [];
  for (let start = 0; start < compact.length; start += GROUP_LENGTH) groups.push(compact.slice(start, start + GROUP_LENGTH));
  return groups.join('-');
}

/**
 * The compact form of what a person typed, or null when it is not a new-style code.
 * @param {string} typed
 * @returns {string | null}
 */
export function compactInviteCode(typed) {
  if (typeof typed !== 'string') return null;
  // NFKC first: full-width and other compatibility forms of letters and digits become the plain ones.
  const compact = typed.normalize('NFKC').toUpperCase().replace(IGNORED, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return COMPACT_CODE.test(compact) ? compact : null;
}

/**
 * The exact form of a code made by hand before D280: its text trimmed and in upper case.
 * @param {string} typed
 * @returns {string}
 */
export function exactInviteCodeText(typed) {
  return typed.trim().toUpperCase();
}

/**
 * SHA-256 of the text's UTF-8 bytes, in lower-case hex.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * The two hashes a typed code is looked up by: its compact form (null when it is not a new-style code) and its exact form.
 * @param {string} typed
 * @returns {Promise<{ compact: string | null, exact: string }>}
 */
export async function inviteCodeHashes(typed) {
  const compact = compactInviteCode(typed);
  return { compact: compact === null ? null : await sha256Hex(compact), exact: await sha256Hex(exactInviteCodeText(typed)) };
}
