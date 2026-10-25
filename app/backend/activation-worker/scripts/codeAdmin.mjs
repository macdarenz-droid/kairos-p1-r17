// @ts-check
/**
 * The owner's code tool (D279): its checks, its SQL and its words, with no input or output of its own. Plain JavaScript
 * with JSDoc, so Node runs it unbuilt (scripts/codes.mjs) and the Workers test runtime runs it as it is
 * (test/code-tool.test.ts). The code rules themselves live in src/inviteCode.mjs (D280).
 *
 * wrangler 4.141.0's `d1 execute` takes no SQL parameters, so every value is checked before it is placed in the SQL text:
 * an id is a whole number above 0, a label matches LABEL, a device limit is 1 to 10, days are 1 to 365, a fingerprint is
 * 64 lower-case hex digits, and a time is an ISO time made by Date. Anything else throws CodeToolError, and no SQL is made.
 * Each change is one statement, so D1 makes it whole or not at all.
 *
 * Codes are made here and shown once. D1 gets only the SHA-256 of a code's compact form, the fingerprint /activate looks
 * it up by. Nothing here shows a fingerprint, and a device appears only by its row number, never by its activationId.
 */
import { compactInviteCode, formatInviteCode, INVITE_CODE_LENGTH, inviteCodeFromBytes, inviteCodeHashes } from '../src/inviteCode.mjs';

/** The most codes one `make` makes. */
export const MAX_CODES = 100;
/** A label: letters A to Z, digits, spaces, dots, underscores and dashes, 1 to 40 of them. Never a quote. */
export const LABEL = /^[A-Za-z0-9 ._-]{1,40}$/;
/** Each code's own device limit (D274): 3 unless the owner says otherwise. */
export const DEFAULT_DEVICES = 3;
const MAX_DEVICES = 10;
const MAX_DAYS = 365;
const DAY_MS = 86_400_000;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** A whole number as typed on the command line: digits only, so `3e1`, `0x10`, `2.5` and `-1` are refused. */
const TYPED_NUMBER = /^[0-9]{1,15}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A value the tool refuses, or an answer it can't read. The message is plain words for the owner. */
export class CodeToolError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CodeToolError';
  }
}

/**
 * @param {unknown} value
 * @param {number} low
 * @param {number} high
 * @returns {value is number}
 */
function isWholeNumberIn(value, low, high) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
}

/** @param {unknown} value @returns {number} */
function checkedId(value) {
  if (!isWholeNumberIn(value, 1, Number.MAX_SAFE_INTEGER - 1)) throw new CodeToolError('An id is a whole number above 0, as list shows it.');
  return value;
}

/** @param {unknown} value @returns {number} */
function checkedCount(value) {
  if (!isWholeNumberIn(value, 1, MAX_CODES)) throw new CodeToolError(`The number of codes is a whole number from 1 to ${MAX_CODES}.`);
  return value;
}

/** @param {unknown} value @returns {number} */
function checkedDevices(value) {
  if (!isWholeNumberIn(value, 1, MAX_DEVICES)) throw new CodeToolError(`--devices is a whole number from 1 to ${MAX_DEVICES}: how many devices each code works on.`);
  return value;
}

/** @param {unknown} value @returns {number} */
function checkedDays(value) {
  if (!isWholeNumberIn(value, 1, MAX_DAYS)) throw new CodeToolError(`--days is a whole number from 1 to ${MAX_DAYS}: how long a code can wait for its first use.`);
  return value;
}

/** @param {unknown} value @returns {string} the label in single quotes, for SQL */
function sqlLabel(value) {
  if (typeof value !== 'string' || !LABEL.test(value)) {
    throw new CodeToolError('A label is 1 to 40 letters (A to Z), digits, spaces, dots, dashes or underscores, e.g. "Ana" or "Friends 2026".');
  }
  return `'${value}'`;
}

/** @param {unknown} value @returns {string} the fingerprint in single quotes, for SQL */
function sqlFingerprint(value) {
  if (typeof value !== 'string' || !FINGERPRINT.test(value)) throw new CodeToolError('A fingerprint is 64 hex digits.');
  return `'${value}'`;
}

/** @param {unknown} value @returns {string} an ISO time made by Date */
function isoTime(value) {
  const time = value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : '';
  if (!ISO_TIME.test(time)) throw new CodeToolError("The computer's clock gave a time the tool can't use.");
  return time;
}

/**
 * The last moment a new code can be used for the first time: `days` after `now`, or null for no end date. After its
 * first use, a code's other places keep working whatever this says (D275).
 * @param {Date} now
 * @param {number | null} days
 * @returns {string | null}
 */
export function firstUseBy(now, days) {
  if (days === null) return null;
  return isoTime(new Date(new Date(isoTime(now)).getTime() + checkedDays(days) * DAY_MS));
}

/**
 * New codes from `crypto.getRandomValues`, each 16 characters from inviteCode.mjs, all different. A code that repeats
 * one already in the batch is drawn again.
 * @param {number} count 1 to MAX_CODES
 * @param {(length: number) => Uint8Array} [randomBytes] for tests; the default is crypto.getRandomValues
 * @returns {string[]} the codes as shown, `XXXX-XXXX-XXXX-XXXX`
 */
export function makeCodes(count, randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length))) {
  checkedCount(count);
  /** @type {Set<string>} */
  const codes = new Set();
  // Far more draws than any working random source needs (a repeat has odds of 1 in 2^80); a broken one stops here.
  for (let draws = 0; codes.size < count; draws += 1) {
    if (draws >= count + 100) throw new CodeToolError('The random source keeps repeating itself, so no codes were made.');
    codes.add(inviteCodeFromBytes(randomBytes(INVITE_CODE_LENGTH)));
  }
  return [...codes];
}

/**
 * @typedef {object} MakeOptions
 * @property {string} label who the codes are for
 * @property {number} devices each code's device limit, 1 to 10
 * @property {number | null} days days left for a code's first use, 1 to 365, or null for no end date
 * @property {Date} now
 */

/**
 * One INSERT that stores the codes' fingerprints with their label, device limit and first-use date, and answers each new
 * row's id and fingerprint. A fingerprint already in D1 makes the whole statement fail, so nothing is half made.
 * @param {readonly string[]} codes from makeCodes
 * @param {MakeOptions} options
 * @returns {Promise<string[]>} the statements, for one `wrangler d1 execute --command`
 */
export async function sqlMake(codes, { label, devices, days, now }) {
  if (!Array.isArray(codes)) throw new CodeToolError('No codes to store.');
  checkedCount(codes.length);
  const quotedLabel = sqlLabel(label);
  const limit = checkedDevices(devices);
  const createdAt = isoTime(now);
  const expiresAt = firstUseBy(now, days);
  /** @type {string[]} */
  const fingerprints = [];
  for (const code of codes) {
    const compact = compactInviteCode(code);
    if (compact === null || code !== formatInviteCode(compact)) throw new CodeToolError('Only codes made by the tool can be stored.');
    fingerprints.push(sqlFingerprint((await inviteCodeHashes(code)).compact));
  }
  if (new Set(fingerprints).size !== fingerprints.length) throw new CodeToolError('The same code is in the batch twice.');
  return [[
    'INSERT INTO activation_codes (code_hash, status, created_at, expires_at, device_limit, label)',
    `SELECT column1, 'unused', '${createdAt}', ${expiresAt === null ? 'NULL' : `'${expiresAt}'`}, ${limit}, ${quotedLabel}`,
    `FROM (VALUES ${fingerprints.map((fingerprint) => `(${fingerprint})`).join(', ')})`,
    'RETURNING id, code_hash',
  ].join(' ')];
}

/**
 * One SELECT: each code with its devices, the removed ones included, one row per device (or one row for a code with
 * none). Never a fingerprint or an activationId. `in_use` is D1's count of the code's devices not removed, as the
 * Worker's /devices counts them (src/devices.ts).
 * @param {{ label?: string | null, id?: number | null }} [filter] a label (any case) or a code id
 * @returns {string[]}
 */
export function sqlList({ label = null, id = null } = {}) {
  /** @type {string[]} */
  const where = [];
  if (label !== null) where.push(`c.label = ${sqlLabel(label)} COLLATE NOCASE`);
  if (id !== null) where.push(`c.id = ${checkedId(id)}`);
  return [[
    'SELECT c.id AS code_id, c.label, c.created_at, c.expires_at, c.status, c.used_at, c.revoked_at, c.device_limit,',
    '(SELECT COUNT(*) FROM activation_devices u WHERE u.code_id = c.id AND u.removed_at IS NULL) AS in_use,',
    'd.id AS device_id, d.device_label, d.activated_at, d.last_seen_on, d.removed_at, d.removed_by',
    'FROM activation_codes c LEFT JOIN activation_devices d ON d.code_id = c.id',
    ...(where.length > 0 ? [`WHERE ${where.join(' AND ')}`] : []),
    'ORDER BY c.id, d.id',
  ].join(' ')];
}

/**
 * Revokes one code: no new device can use it, and its devices hear "revoked" at their next check (D278). It sets
 * `revoked_at`; a code never used also gets the status 'revoked' (0001 allows that status only for a code never used).
 * Answers the code's id when it changed, nothing when it was revoked already or doesn't exist.
 * @param {number} id
 * @param {Date} now
 * @returns {string[]}
 */
export function sqlRevoke(id, now) {
  const codeId = checkedId(id);
  const revokedAt = isoTime(now);
  return [[
    `UPDATE activation_codes SET revoked_at = '${revokedAt}', status = CASE WHEN status = 'unused' THEN 'revoked' ELSE status END`,
    `WHERE id = ${codeId} AND status <> 'revoked' AND revoked_at IS NULL`,
    'RETURNING id',
  ].join(' ')];
}

/**
 * Frees one place: removes a device of this code (`removed_by = 'owner'`), as a trader's Remove does. That device hears
 * "removed" at its next check (D278). Answers the device's id when it changed, nothing when it was removed already or
 * is not a device of this code.
 * @param {number} codeId
 * @param {number} deviceId
 * @param {Date} now
 * @returns {string[]}
 */
export function sqlFree(codeId, deviceId, now) {
  const code = checkedId(codeId);
  const device = checkedId(deviceId);
  const removedAt = isoTime(now);
  return [[
    `UPDATE activation_devices SET removed_at = '${removedAt}', removed_by = 'owner'`,
    `WHERE id = ${device} AND code_id = ${code} AND removed_at IS NULL`,
    'RETURNING id',
  ].join(' ')];
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Text from wrangler or D1, safe to print: no fingerprint, no terminal control characters, not too long.
 * @param {string} text
 * @returns {string}
 */
function shownText(text) {
  return text
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[0-9a-f]{64}/gi, '<fingerprint>')
    .replace(/[\p{Cc}\p{Cf}]/gu, (character) => (character === '\n' ? '\n' : ''))
    .trim()
    .slice(0, 600);
}

/** @param {unknown} error @returns {string} */
function wranglerErrorText(error) {
  if (!isRecord(error)) return 'no reason given';
  const parts = [];
  if (typeof error.text === 'string') parts.push(error.text);
  if (Array.isArray(error.notes)) {
    for (const note of error.notes) if (isRecord(note) && typeof note.text === 'string') parts.push(note.text);
  }
  return parts.length > 0 ? parts.join('\n') : 'no reason given';
}

/**
 * Reads what `wrangler d1 execute --json` printed (wrangler 4.141.0, read in its code and run with --local): an array with
 * one `{ results: [rows], success: true, meta }` per statement, local and remote alike with --command; or, when it
 * failed, `{ error: { text, notes? } }`.
 * @param {string} text wrangler's standard output
 * @returns {Array<Array<Record<string, unknown>>>} each statement's rows
 */
export function readWranglerJson(text) {
  /** @type {unknown} */
  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    // Anything printed before the JSON (a notice) is skipped; the JSON starts on its own line.
    const start = text.search(/^[[{]/m);
    try {
      answer = start === -1 ? undefined : JSON.parse(text.slice(start));
    } catch {
      answer = undefined;
    }
  }
  if (isRecord(answer) && 'error' in answer) throw new CodeToolError(`wrangler said: ${shownText(wranglerErrorText(answer.error))}`);
  if (!Array.isArray(answer) || answer.length === 0) throw new CodeToolError("wrangler's answer can't be read.");
  return answer.map((result) => {
    if (!isRecord(result) || result.success !== true || !Array.isArray(result.results) || !result.results.every(isRecord)) {
      throw new CodeToolError('wrangler did not say that every statement worked.');
    }
    return /** @type {Array<Record<string, unknown>>} */ (result.results);
  });
}

/**
 * @typedef {object} MadeCode
 * @property {string} code as shown
 * @property {number | null} id its row in D1, or null when wrangler's answer didn't name it
 */

/**
 * The made codes with their new ids, from sqlMake's answer. The rows come back in any order, so they are matched by
 * fingerprint, in memory only.
 * @param {readonly string[]} codes
 * @param {Array<Array<Record<string, unknown>>>} results readWranglerJson's answer to sqlMake
 * @returns {Promise<MadeCode[]>}
 */
export async function readMade(codes, results) {
  /** @type {Map<unknown, unknown>} */
  const ids = new Map();
  for (const row of results[0] ?? []) ids.set(row.code_hash, row.id);
  /** @type {MadeCode[]} */
  const made = [];
  for (const code of codes) {
    const id = ids.get((await inviteCodeHashes(code)).compact);
    made.push({ code, id: isWholeNumberIn(id, 1, Number.MAX_SAFE_INTEGER) ? id : null });
  }
  return made;
}

/**
 * What `make` prints, once: the codes and what to do with them.
 * @param {readonly MadeCode[]} made
 * @param {{ label: string, devices: number, firstUseBy: string | null }} details
 * @returns {string}
 */
export function formatMade(made, details) {
  const many = made.length === 1 ? 'code' : 'codes';
  const width = Math.max(...made.map(({ id }) => (id === null ? 0 : String(id).length)));
  return [
    `Made ${made.length} invite ${many} with the label "${details.label}".`,
    `Each works on up to ${details.devices} ${details.devices === 1 ? 'device' : 'devices'}. ${details.firstUseBy === null ? 'First use: any time' : `First use by ${dayText(details.firstUseBy)}`}.`,
    '',
    ...made.map(({ code, id }) => `  ${id === null ? `${'?'.padStart(width)}  (its id shows in list)` : `Code ${String(id).padStart(width)}`}   ${code}`),
    '',
    "Write these down now. Kairos keeps only a fingerprint and can't show them again.",
    'Give each person their own code, privately.',
  ].join('\n');
}

/**
 * @typedef {object} DeviceLine
 * @property {number} id its row number: what `free <id> --device <n>` takes
 * @property {string} label the coarse name the app sent, e.g. "iPhone · Safari"
 * @property {string | null} since when it was activated
 * @property {string | null} lastSeenOn the last day it checked in
 * @property {string | null} removedAt
 * @property {string | null} removedBy 'trader' or 'owner'
 */

/**
 * @typedef {object} CodeLine
 * @property {number} id
 * @property {string | null} label null for a code added by hand, before the tool
 * @property {string | null} createdAt
 * @property {string | null} firstUseBy
 * @property {string} status 'unused', 'used' or 'revoked', as D1 keeps it
 * @property {string | null} usedAt
 * @property {string | null} revokedAt
 * @property {boolean} revoked
 * @property {number} deviceLimit
 * @property {number} inUse devices not removed, counted by D1
 * @property {DeviceLine[]} devices every device, the removed ones too, oldest first
 */

/** @returns {CodeToolError} */
function unreadable() {
  return new CodeToolError("The list from D1 can't be read. Is migration 0002 on this database? (README, owner step O8)");
}

/** @param {unknown} value @returns {string | null} */
function textOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw unreadable();
  return value;
}

/** @param {unknown} value @returns {number} */
function count(value) {
  if (!isWholeNumberIn(value, 0, Number.MAX_SAFE_INTEGER)) throw unreadable();
  return value;
}

/**
 * sqlList's rows, one entry per code, in id order.
 * @param {readonly Record<string, unknown>[]} rows
 * @returns {CodeLine[]}
 */
export function readCodes(rows) {
  /** @type {Map<number, CodeLine>} */
  const codes = new Map();
  for (const row of rows) {
    const id = row.code_id;
    if (!isWholeNumberIn(id, 1, Number.MAX_SAFE_INTEGER)) throw unreadable();
    let code = codes.get(id);
    if (code === undefined) {
      const status = textOrNull(row.status) ?? '';
      const revokedAt = textOrNull(row.revoked_at);
      code = {
        id, label: textOrNull(row.label), createdAt: textOrNull(row.created_at), firstUseBy: textOrNull(row.expires_at), status,
        usedAt: textOrNull(row.used_at), revokedAt, revoked: status === 'revoked' || revokedAt !== null,
        deviceLimit: count(row.device_limit), inUse: count(row.in_use), devices: [],
      };
      codes.set(id, code);
    }
    if (row.device_id === null || row.device_id === undefined) continue;
    const deviceId = row.device_id;
    if (!isWholeNumberIn(deviceId, 1, Number.MAX_SAFE_INTEGER)) throw unreadable();
    code.devices.push({
      id: deviceId, label: textOrNull(row.device_label) ?? 'Other device', since: textOrNull(row.activated_at),
      lastSeenOn: textOrNull(row.last_seen_on), removedAt: textOrNull(row.removed_at), removedBy: textOrNull(row.removed_by),
    });
  }
  return [...codes.values()];
}

/**
 * "25 Oct 2026" from text that starts with a day (YYYY-MM-DD, as every time in D1 does), or "unknown". A code added by
 * hand may hold any text, so nothing else of it is printed.
 * @param {string | null} value
 * @returns {string}
 */
function dayText(value) {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (match === null) return 'unknown';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return 'unknown';
  return `${day} ${MONTHS[month - 1]} ${match[1]}`;
}

/** @param {CodeLine} code @param {string} now @returns {string} */
function standing(code, now) {
  if (code.revoked) return code.revokedAt === null ? 'revoked' : `revoked ${dayText(code.revokedAt)}`;
  // As /activate decides (src/activate.ts): a date limits only an unused code.
  if (code.status === 'unused') return code.firstUseBy !== null && code.firstUseBy.length > 0 && code.firstUseBy <= now ? 'expired before its first use' : 'not used yet';
  return `first used ${dayText(code.usedAt)}`;
}

/** @param {DeviceLine} device @returns {string} */
function deviceText(device) {
  const parts = [`device ${device.id}`, shownText(device.label), `since ${dayText(device.since)}`, `last seen ${device.lastSeenOn === null ? 'unknown' : dayText(device.lastSeenOn)}`];
  if (device.removedAt !== null) parts.push(`removed ${dayText(device.removedAt)} ${device.removedBy === 'owner' ? 'by you' : 'by the trader'}`);
  return parts.join(' · ');
}

/**
 * What `list` prints for sqlList's rows: per code, its id, label ("added by hand" for codes made before the tool), the
 * day it was made, its first-use date, its status, "used on 2 of 3 devices", and each device (name, since, last seen,
 * removed). Never a fingerprint, a code or an activationId.
 * @param {readonly Record<string, unknown>[]} rows
 * @param {{ now?: Date, summary?: boolean }} [options] summary: end with the count of codes and what to do about hand-made ones
 * @returns {string}
 */
export function formatList(rows, { now = new Date(), summary = true } = {}) {
  const codes = readCodes(rows);
  if (codes.length === 0) return 'No invite codes found.';
  const at = isoTime(now);
  const lines = [];
  for (const code of codes) {
    lines.push(`Code ${code.id} · ${code.label === null ? 'added by hand' : `"${shownText(code.label)}"`}`);
    lines.push(`  made ${dayText(code.createdAt)} · ${code.firstUseBy === null || code.firstUseBy === '' ? 'first use any time' : `first use by ${dayText(code.firstUseBy)}`}`);
    lines.push(`  ${standing(code, at)} · used on ${code.inUse} of ${code.deviceLimit} ${code.deviceLimit === 1 ? 'device' : 'devices'}`);
    for (const device of code.devices) lines.push(`    ${deviceText(device)}`);
    lines.push('');
  }
  if (summary) {
    const byHand = codes.filter((code) => code.label === null && !code.revoked).length;
    lines.push(`${codes.length} ${codes.length === 1 ? 'code' : 'codes'}.`);
    if (byHand > 0) {
      lines.push(`${byHand} still working ${byHand === 1 ? 'code was' : 'codes were'} added by hand. A short one is easy to guess: revoke it with`);
      lines.push('npm run codes -- revoke <id>, and make a new one for that person.');
    }
  }
  return lines.join('\n').trimEnd();
}

/**
 * @typedef {'remote' | 'local'} Where
 * @typedef {{ kind: 'make', where: Where, count: number, label: string, devices: number, days: number | null }} MakeCommand
 * @typedef {{ kind: 'list', where: Where, label: string | null }} ListCommand
 * @typedef {{ kind: 'revoke', where: Where, id: number }} RevokeCommand
 * @typedef {{ kind: 'free', where: Where, id: number, device: number }} FreeCommand
 * @typedef {MakeCommand | ListCommand | RevokeCommand | FreeCommand | { kind: 'help' }} Command
 */

/**
 * The database a command works on, in words. The code shown and each question before a change name it: npm 10.9.4 takes
 * `--local` for itself when the `--` after `npm run codes` is left out, and passes the tool no trace of it, so the command
 * would run on the live database.
 * @param {Where} where
 * @returns {string}
 */
export function placeText(where) {
  return where === 'local'
    ? 'the local copy of kairos-activation-db (.wrangler/state, for trying the tool)'
    : 'the live database kairos-activation-db';
}

/**
 * @param {number} id
 * @param {number} inUse the code's devices not removed
 * @param {Where} where
 * @returns {string}
 */
export function revokeQuestion(id, inUse, where) {
  const devices = inUse === 0 ? '' : ` Its ${inUse === 1 ? 'device goes' : `${inUse} devices go`} back to the invite screen at the next daily check, and keep their journals.`;
  return `Revoke code ${id} in ${placeText(where)}? No new device can use it after this.${devices} This can't be undone.`;
}

/**
 * @param {number} id
 * @param {number} device
 * @param {Where} where
 * @returns {string}
 */
export function freeQuestion(id, device, where) {
  return `Free device ${device} on code ${id} in ${placeText(where)}? Its place becomes free for another device. That device goes back to the invite screen at its next daily check, and keeps its journal.`;
}

/**
 * What to do next after an error, from wrangler 4.141.0's own words, or null when there is nothing more to say.
 * @param {string} message the error the tool printed
 * @param {Where | null} where null when the command line itself was refused
 * @returns {string | null}
 */
export function nextStep(message, where) {
  // Checked first: this refusal also says "non-interactive mode", the words of the not-signed-in case below.
  if (/More than one account/i.test(message)) {
    return 'Your login has more than one Cloudflare account. Run npx wrangler d1 list once in app/backend/activation-worker and pick the account that has kairos-activation-db (wrangler remembers it), or set CLOUDFLARE_ACCOUNT_ID.';
  }
  if (/CLOUDFLARE_API_TOKEN|non-interactive|logged in|Authentication/i.test(message)) {
    return 'Not signed in? Run npx wrangler login in app/backend/activation-worker, then try again.';
  }
  if (/no such table|no such column|has no column/i.test(message)) {
    return where === 'local'
      ? 'Make the local copy first: npx wrangler d1 migrations apply kairos-activation-db --local'
      : "This database doesn't have migration 0002 yet. CI adds it once owner step O8 is done (README).";
  }
  return null;
}

export const USAGE = [
  "Kairos invite codes (the owner's tool). Run in app/backend/activation-worker after `npx wrangler login`:",
  '',
  '  npm run codes -- make <1-100> --label "Ana" [--devices 3] [--days 30]',
  '      Makes new codes and shows them once. --devices: how many devices each code works on (1-10, 3 if not given).',
  '      --days: how long a code can wait for its first use (1-365, no end date if not given).',
  '  npm run codes -- list [--label "Ana"]',
  '      Every code with its devices. Never shows a code: Kairos keeps only a fingerprint.',
  '  npm run codes -- revoke <id>',
  '      Stops a code: no new device can use it, and its devices go back to the invite screen at their next daily check.',
  '  npm run codes -- free <id> --device <n>',
  '      Removes device <n> (the number list shows) from code <id>, so its place is free for another device.',
  '',
  'Each command works on the live database. Add --local to try it on a local copy (.wrangler/state) instead.',
  'Keep the -- after npm run codes: without it npm takes --local for itself, and the command runs on the live database.',
].join('\n');

/** The options each command takes, besides --local and --remote. */
const COMMAND_OPTIONS = /** @type {const} */ ({ make: ['label', 'devices', 'days'], list: ['label'], revoke: [], free: ['device'] });
const VALUE_OPTIONS = new Set(['label', 'devices', 'days', 'device']);

/** @param {string} text @returns {string} */
function echo(text) {
  return shownText(text).slice(0, 40);
}

/**
 * @param {string | undefined} text
 * @param {(value: number) => number} check
 * @param {string} missing
 * @returns {number}
 */
function typedNumber(text, check, missing) {
  if (text === undefined) throw new CodeToolError(missing);
  return check(TYPED_NUMBER.test(text) ? Number(text) : Number.NaN);
}

/**
 * The command line after `npm run codes --`, checked with the same rules as the SQL, before any SQL is made.
 * @param {readonly string[]} args
 * @returns {Command}
 */
export function readCommand(args) {
  /** @type {string[]} */
  const words = [];
  /** @type {Map<string, string>} */
  const values = new Map();
  let local = false;
  let remote = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--local') local = true;
    else if (arg === '--remote') remote = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') return { kind: 'help' };
    else if (arg.startsWith('-')) {
      const equals = arg.indexOf('=');
      const name = arg.slice(2, equals === -1 ? undefined : equals);
      if (!arg.startsWith('--') || !VALUE_OPTIONS.has(name)) throw new CodeToolError(`The tool doesn't know the option "${echo(arg)}". Run npm run codes -- help.`);
      let value = equals === -1 ? args[index + 1] : arg.slice(equals + 1);
      if (equals === -1) index += 1;
      if (value === undefined || value.startsWith('--')) throw new CodeToolError(`--${name} needs a value, e.g. --${name} ${name === 'label' ? '"Ana"' : '3'}.`);
      if (values.has(name)) throw new CodeToolError(`--${name} is given twice.`);
      values.set(name, value);
    } else words.push(arg);
  }
  if (words.length === 0) return { kind: 'help' };
  if (local && remote) throw new CodeToolError('Choose --local or --remote, not both.');
  /** @type {Where} */
  const where = local ? 'local' : 'remote';
  const [kind, ...rest] = words;
  if (kind !== 'make' && kind !== 'list' && kind !== 'revoke' && kind !== 'free') {
    throw new CodeToolError(`The tool doesn't know "${echo(kind)}". It knows make, list, revoke and free. Run npm run codes -- help.`);
  }
  for (const name of values.keys()) {
    if (!(/** @type {readonly string[]} */ (COMMAND_OPTIONS[kind])).includes(name)) throw new CodeToolError(`--${name} doesn't go with ${kind}. Run npm run codes -- help.`);
  }
  const expected = kind === 'list' ? 0 : 1;
  if (rest.length > expected) throw new CodeToolError(`Too many words after ${kind}: "${echo(rest.slice(expected).join(' '))}".`);
  const label = values.get('label')?.trim();
  if (label !== undefined) sqlLabel(label);

  if (kind === 'make') {
    if (label === undefined) throw new CodeToolError('Give the codes a label, so list can tell whose they are: --label "Ana".');
    return {
      kind, where, label,
      count: typedNumber(rest[0], checkedCount, `Say how many codes to make, from 1 to ${MAX_CODES}: npm run codes -- make 1 --label "Ana".`),
      devices: values.has('devices') ? typedNumber(values.get('devices'), checkedDevices, '') : DEFAULT_DEVICES,
      days: values.has('days') ? typedNumber(values.get('days'), checkedDays, '') : null,
    };
  }
  if (kind === 'list') return { kind, where, label: label ?? null };
  const id = typedNumber(rest[0], checkedId, `Say which code, by the id list shows: npm run codes -- ${kind} <id>.`);
  if (kind === 'revoke') return { kind, where, id };
  return { kind, where, id, device: typedNumber(values.get('device'), checkedId, 'Say which device, by the number list shows: --device <n>.') };
}
