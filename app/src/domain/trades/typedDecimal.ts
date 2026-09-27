import type { DecimalString } from './tradeTypes';
import { parseDecimalString } from './tradeValidation';

export type TypedDecimalReading =
  | Readonly<{ ok: true; value: DecimalString; changed: boolean }>
  | Readonly<{ ok: false; reason: 'empty' }>
  | Readonly<{ ok: false; reason: 'not-a-number' }>
  | Readonly<{ ok: false; reason: 'unclear-separator'; readings: readonly [DecimalString, DecimalString] }>;

const MINUS_SIGNS = new Set(['-', '−']);
/** Marks that only ever group digits: spaces (plain, no-break, thin, narrow no-break) and apostrophes. */
const GROUP_ONLY_MARKS = new Set([' ', ' ', ' ', ' ', "'", '’']);
const DIGITS = /^\d+$/;
const NOT_A_NUMBER = Object.freeze({ ok: false, reason: 'not-a-number' } as const);

/** Whole-part groups: 1–3 digits then groups of 3 ("1,234,567"), or Indian grouping ("12,34,567"). */
function groupsAreValid(groups: readonly string[]): boolean {
  if (groups.length < 2 || !groups.every(group => DIGITS.test(group))) return false;
  const [first, ...rest] = groups;
  if (first!.length <= 3 && rest.every(group => group.length === 3)) return true;
  const last = rest[rest.length - 1]!;
  return first!.length <= 2 && last.length === 3 && rest.slice(0, -1).every(group => group.length === 2);
}

function withoutLeadingZeros(whole: string): string {
  const trimmed = whole.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

function finish(negative: boolean, whole: string, fraction: string | null): DecimalString | null {
  const text = `${negative ? '-' : ''}${withoutLeadingZeros(whole)}${fraction === null ? '' : `.${fraction}`}`;
  const parsed = parseDecimalString(text);
  return parsed.ok ? parsed.value : null;
}

/**
 * The one reader of typed or pasted number text (D176): returns the exact decimal text, or says why it cannot.
 * It never guesses: a single comma before exactly three digits ("1,234") could be 1234 or 1.234, so it asks.
 */
export function readTypedDecimal(text: string): TypedDecimalReading {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  const negative = MINUS_SIGNS.has(trimmed[0]!);
  const body = negative ? trimmed.slice(1) : trimmed;
  if (body === '') return NOT_A_NUMBER;
  for (const character of body) {
    if (!(/\d/.test(character) || character === '.' || character === ',' || GROUP_ONLY_MARKS.has(character))) return NOT_A_NUMBER;
  }

  const dots = body.split('.').length - 1;
  const commas = body.split(',').length - 1;
  let decimalMark: '.' | ',' | null = null;
  let pointGroupMark: '.' | ',' | null = null;
  let unclear = false;
  if (dots > 0 && commas > 0) {
    decimalMark = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
    pointGroupMark = decimalMark === '.' ? ',' : '.';
    if ((decimalMark === '.' ? dots : commas) !== 1) return NOT_A_NUMBER;
  } else if (dots > 1) {
    pointGroupMark = '.';
  } else if (commas > 1) {
    pointGroupMark = ',';
  } else if (dots === 1) {
    decimalMark = '.';
  } else if (commas === 1) {
    decimalMark = ',';
    const [before, after] = body.split(',') as [string, string];
    const beforeDigits = [...before].filter(character => /\d/.test(character)).join('');
    unclear = /^\d{3}$/.test(after) && /[1-9]/.test(beforeDigits);
  }

  const groupMarks = new Set([...body].filter(character => GROUP_ONLY_MARKS.has(character)));
  if (pointGroupMark !== null) groupMarks.add(pointGroupMark);
  if (groupMarks.size > 1) return NOT_A_NUMBER;
  const groupMark = groupMarks.size === 1 ? [...groupMarks][0]! : null;

  const decimalAt = decimalMark === null ? -1 : body.indexOf(decimalMark);
  const wholeText = decimalAt === -1 ? body : body.slice(0, decimalAt);
  const fraction = decimalAt === -1 ? null : body.slice(decimalAt + 1);
  if (fraction !== null && !DIGITS.test(fraction)) return NOT_A_NUMBER;

  let whole: string;
  if (groupMark !== null && wholeText.includes(groupMark)) {
    const groups = wholeText.split(groupMark);
    if (!groupsAreValid(groups)) return NOT_A_NUMBER;
    whole = groups.join('');
  } else {
    if (wholeText !== '' && !DIGITS.test(wholeText)) return NOT_A_NUMBER;
    if (groupMark !== null) return NOT_A_NUMBER;
    whole = wholeText;
  }

  if (unclear) {
    const joined = finish(negative, `${whole}${fraction}`, null);
    const pointed = finish(negative, whole, fraction);
    return joined !== null && pointed !== null ? { ok: false, reason: 'unclear-separator', readings: [joined, pointed] } : NOT_A_NUMBER;
  }
  const value = finish(negative, whole, fraction);
  return value === null ? NOT_A_NUMBER : { ok: true, value, changed: value !== trimmed };
}
