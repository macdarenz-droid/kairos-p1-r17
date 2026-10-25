/**
 * Which invite code a person typed, read the way the activation Worker reads it (D280), so that retries of
 * one code keep one request id (D275) and a retry after a lost answer never takes a second place.
 *
 * The Worker's `backend/activation-worker/src/inviteCode.mjs` owns these rules. It looks a typed code up by its compact
 * form (a new 16-character code, typed forgivingly) and by its exact form (a code made by hand: trimmed, upper case).
 * The app keeps this copy because `src/` never imports a backend package (ARCHITECTURE §4); `tests/invite-code.test.ts`
 * proves both forms equal the Worker's on a table and on random text.
 */

const COMPACT_CODE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
/** Spaces, the dashes a phone keyboard may type (U+2010 to U+2015, minus), and invisible format characters (Unicode Cf). */
const IGNORED = /[\s\-\u2010-\u2015\u2212\p{Cf}]/gu;

/** The compact form of what a person typed: 16 of Crockford's characters, O read as 0, I and L as 1; null when it is not one. */
export function compactInviteCode(typed: string): string | null {
  // NFKC first: full-width and other compatibility forms of letters and digits become the plain ones.
  const compact = typed.normalize('NFKC').toUpperCase().replace(IGNORED, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return COMPACT_CODE.test(compact) ? compact : null;
}

/** The exact form, for a code made by hand before D280: the text trimmed and in upper case. */
export function exactInviteCodeText(typed: string): string {
  return typed.trim().toUpperCase();
}

/**
 * The code a try is for: its compact form when it is a new-style code, else its exact form. Typings with one key are one
 * code to the Worker ("7Q4M-X2PB-9HRT-K3V0" and "7q4mx2pb9hrtk3vo"); "QA-INVITE-001" and "QAINVITE001" are two. Should a
 * hand-made code ever share a new code's characters, a shared request id is still harmless: the Worker looks it up
 * within one code only.
 */
export function inviteCodeKey(typed: string): string {
  return compactInviteCode(typed) ?? exactInviteCodeText(typed);
}
