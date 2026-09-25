/**
 * P24 glossary: the plain words Kairos shows on screen, what traders call them, one plain sentence, an optional teaching picture and related words.
 * Content is data, never code. A glossary word is not a lesson (P25) and not a learning source (P23).
 */

import { parseLearnPictureSpec, type LearnPictureSpec } from './learnPicture';

export type GlossaryTermId = string;

export interface GlossaryTerm {
  readonly id: GlossaryTermId;
  /** The words Kairos shows on screen. */
  readonly plainWords: string;
  /** What traders usually call it. */
  readonly tradingTerm: string;
  /** Other names people search for. */
  readonly alsoCalled: readonly string[];
  /** One plain sentence. */
  readonly explanation: string;
  readonly picture: LearnPictureSpec | null;
  /** Ids of other words, shown as links. */
  readonly related: readonly GlossaryTermId[];
}

export type GlossaryProblemReason = 'glossary-missing' | 'unsupported-version' | 'unknown-field' | 'invalid-field' | 'duplicate-id' | 'duplicate-plain-words' | 'unknown-related';

export interface GlossaryProblem {
  readonly index: number | null;
  readonly id: GlossaryTermId | null;
  readonly field: string | null;
  readonly reason: GlossaryProblemReason;
}

export interface Glossary {
  readonly terms: readonly GlossaryTerm[];
  readonly problems: readonly GlossaryProblem[];
}

export const KAIROS_GLOSSARY_VERSION = 1;
export const KAIROS_GLOSSARY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const KAIROS_GLOSSARY_TEXT_LIMITS = Object.freeze({ plainWords: 60, tradingTerm: 80, alsoCalled: 40, explanation: 280 });
export const KAIROS_GLOSSARY_LIST_LIMITS = Object.freeze({ alsoCalled: 6, related: 6 });

const TERM_KEYS: readonly string[] = ['id', 'plainWords', 'tradingTerm', 'alsoCalled', 'explanation', 'picture', 'related'];
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && KAIROS_GLOSSARY_ID_PATTERN.test(value);
/** Text: no control characters, trimmed length 1 to the limit. Returns the trimmed value, or null when refused. */
function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= limit ? trimmed : null;
}
/** Accents dropped, lower case, every run of other characters one space. */
const normalise = (value: string): string => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type EntryResult = { readonly ok: true; readonly term: GlossaryTerm } | { readonly ok: false; readonly field: string | null; readonly reason: GlossaryProblemReason };
const refuse = (field: string | null, reason: GlossaryProblemReason = 'invalid-field'): EntryResult => ({ ok: false, field, reason });

function parseEntry(entry: unknown): EntryResult {
  if (!isPlainObject(entry)) return refuse(null);
  const unknownKey = Object.keys(entry).find((key) => !TERM_KEYS.includes(key));
  if (unknownKey !== undefined) return refuse(unknownKey, 'unknown-field');
  if (!isId(entry.id)) return refuse('id');
  const limits = KAIROS_GLOSSARY_TEXT_LIMITS;
  const plainWords = text(entry.plainWords, limits.plainWords);
  if (plainWords === null) return refuse('plainWords');
  const tradingTerm = text(entry.tradingTerm, limits.tradingTerm);
  if (tradingTerm === null) return refuse('tradingTerm');
  const explanation = text(entry.explanation, limits.explanation);
  if (explanation === null) return refuse('explanation');
  if (!Array.isArray(entry.alsoCalled) || entry.alsoCalled.length > KAIROS_GLOSSARY_LIST_LIMITS.alsoCalled) return refuse('alsoCalled');
  // Array.from visits holes as undefined, so a sparse list is refused like one holding undefined.
  const alsoCalled = Array.from(entry.alsoCalled as unknown[], (name) => text(name, limits.alsoCalled));
  if (alsoCalled.some((name) => name === null)) return refuse('alsoCalled');
  const picture = entry.picture === null ? null : parseLearnPictureSpec(entry.picture);
  if (picture === null && entry.picture !== null) return refuse('picture');
  if (!Array.isArray(entry.related) || entry.related.length > KAIROS_GLOSSARY_LIST_LIMITS.related) return refuse('related');
  const related: unknown[] = Array.from(entry.related as unknown[]);
  if (!related.every(isId) || new Set(related).size !== related.length || related.includes(entry.id)) return refuse('related');
  return {
    ok: true,
    term: { id: entry.id, plainWords, tradingTerm, alsoCalled: Object.freeze(alsoCalled as string[]), explanation, picture, related: Object.freeze([...related] as string[]) },
  };
}

const glossaryProblem = (field: string | null, reason: GlossaryProblemReason): Glossary =>
  Object.freeze({ terms: Object.freeze([]), problems: Object.freeze([Object.freeze({ index: null, id: null, field, reason })]) });

/**
 * Reads the glossary file. It never throws: a glossary-level fault gives no
 * words and that one problem; an entry fault skips only that entry and records
 * one problem with its index. A link to a word that is not kept is dropped and
 * recorded, and the word stays. Kept words stay in file order.
 */
export function parseGlossary(value: unknown): Glossary {
  if (!isPlainObject(value)) return glossaryProblem(null, 'glossary-missing');
  if (value.version !== KAIROS_GLOSSARY_VERSION) return glossaryProblem('version', 'unsupported-version');
  if (!Array.isArray(value.terms)) return glossaryProblem('terms', 'glossary-missing');
  const extra = Object.keys(value).find((key) => key !== 'version' && key !== 'terms');
  if (extra !== undefined) return glossaryProblem(extra, 'unknown-field');

  const kept: { readonly index: number; readonly term: GlossaryTerm }[] = [];
  const problems: GlossaryProblem[] = [];
  const ids = new Set<string>();
  const plainWords = new Set<string>();
  // A plain index walk: a hole in `terms` is read as undefined and refused, never skipped.
  const entries: readonly unknown[] = value.terms;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const id = isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : null;
    const parsed = parseEntry(entry);
    let problem: { field: string | null; reason: GlossaryProblemReason } | null = parsed.ok ? null : parsed;
    if (parsed.ok && ids.has(parsed.term.id)) problem = { field: 'id', reason: 'duplicate-id' };
    else if (parsed.ok && plainWords.has(normalise(parsed.term.plainWords))) problem = { field: 'plainWords', reason: 'duplicate-plain-words' };
    if (problem !== null || !parsed.ok) {
      problems.push(Object.freeze({ index, id, field: problem!.field, reason: problem!.reason }));
      continue;
    }
    ids.add(parsed.term.id);
    plainWords.add(normalise(parsed.term.plainWords));
    kept.push({ index, term: parsed.term });
  }

  const terms = kept.map(({ index, term }) => {
    const related = term.related.filter((relatedId) => {
      if (ids.has(relatedId)) return true;
      problems.push(Object.freeze({ index, id: term.id, field: 'related', reason: 'unknown-related' as const }));
      return false;
    });
    return Object.freeze({ ...term, related: related.length === term.related.length ? term.related : Object.freeze(related) });
  });
  return Object.freeze({ terms: Object.freeze(terms), problems: Object.freeze(problems) });
}

const byKey = (a: { key: string; order: number }, b: { key: string; order: number }): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : a.order - b.order;

function rankOf(term: GlossaryTerm, q: string): number | null {
  const names = [term.plainWords, term.tradingTerm, ...term.alsoCalled].map(normalise);
  if (names.includes(q)) return 0;
  if (names.some((name) => name.startsWith(q))) return 1;
  if (names.some((name) => ` ${name}`.includes(` ${q}`))) return 2;
  if (` ${normalise(term.explanation)}`.includes(` ${q}`)) return 3;
  return null;
}

/**
 * The glossary search order. An empty query lists every word by its plain
 * words (code-unit order, file order on ties). Otherwise a word ranks by its
 * first match: 0 a name is the query, 1 a name starts with it, 2 a word inside
 * a name starts with it, 3 a word in the explanation starts with it. Words
 * that match nothing are left out.
 */
export function searchGlossary(terms: readonly GlossaryTerm[], query: string): readonly GlossaryTerm[] {
  const q = normalise(query);
  const rows = terms.map((term, order) => ({ term, order, key: normalise(term.plainWords), rank: q === '' ? 0 : rankOf(term, q) }));
  const found = rows.filter((row) => row.rank !== null).sort((a, b) => (a.rank! - b.rank!) || byKey(a, b));
  return Object.freeze(found.map((row) => row.term));
}
