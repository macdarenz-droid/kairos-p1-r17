/**
 * P23 learning sources: files a trader reads (PDFs), with their provenance.
 * A source is not a lesson. Lessons (P25) and glossary entries (P24) will point at a source by its id and revision; that link is designed in P24/P25.
 * ACADEMY names: SourceResource = `LearningSource`, SourceRevision = `LearningSourceRevision`.
 * Catalog content is data, never code.
 */

export type LearningSourceId = string;

export interface LearningSourceRevision {
  /** Starts at 1 and goes up whenever the file's bytes change. */
  readonly number: number;
  readonly fileName: string;
  readonly bytes: number;
  readonly sha256: string;
  /** null when not recorded. */
  readonly pages: number | null;
  /** YYYY-MM-DD. */
  readonly addedOn: string;
}

export interface LearningSource {
  readonly id: LearningSourceId;
  readonly title: string;
  /** What it covers, one plain sentence. */
  readonly covers: string;
  /** null when not recorded (missing is not invented). */
  readonly author: string | null;
  /** Where the file came from. */
  readonly origin: string;
  /** null when not recorded (missing is not invented). */
  readonly rights: string | null;
  readonly language: string;
  readonly revision: LearningSourceRevision;
}

export const KAIROS_LEARNING_SOURCE_CATALOG_VERSION = 1;
/** 25 MiB, the Cloudflare Pages per-file limit. */
export const KAIROS_LEARNING_SOURCE_MAX_BYTES = 26_214_400;
export const KAIROS_LEARNING_SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** No slash, so a file name can never leave the folder; every allowed name is URL-safe without encoding. */
export const KAIROS_LEARNING_SOURCE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/;
export const KAIROS_LEARNING_SOURCE_TEXT_LIMITS = Object.freeze({ title: 120, covers: 400, author: 120, origin: 160, rights: 160 });

export type LearningSourceCatalogProblemReason = 'catalog-missing' | 'unsupported-version' | 'unknown-field' | 'invalid-field' | 'duplicate-id' | 'duplicate-file-name';

export interface LearningSourceCatalogProblem {
  readonly index: number | null;
  readonly id: LearningSourceId | null;
  readonly field: string | null;
  readonly reason: LearningSourceCatalogProblemReason;
}

export interface LearningSourceCatalog {
  readonly sources: readonly LearningSource[];
  readonly problems: readonly LearningSourceCatalogProblem[];
}

const SOURCE_KEYS: readonly string[] = ['id', 'title', 'covers', 'author', 'origin', 'rights', 'language', 'revision'];
const REVISION_KEYS: readonly string[] = ['number', 'fileName', 'bytes', 'sha256', 'pages', 'addedOn'];
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInteger = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
/** Text: no control characters, trimmed length 1 to the limit. Returns the trimmed value, or null when refused. */
function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= limit ? trimmed : null;
}
function isRealDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type EntryResult = { readonly ok: true; readonly source: LearningSource } | { readonly ok: false; readonly field: string | null; readonly reason: LearningSourceCatalogProblemReason };
const refuse = (field: string | null, reason: LearningSourceCatalogProblemReason = 'invalid-field'): EntryResult => ({ ok: false, field, reason });

function parseEntry(entry: unknown): EntryResult {
  if (!isPlainObject(entry)) return refuse(null);
  const unknownKey = Object.keys(entry).find((key) => !SOURCE_KEYS.includes(key));
  if (unknownKey !== undefined) return refuse(unknownKey, 'unknown-field');
  if (typeof entry.id !== 'string' || !KAIROS_LEARNING_SOURCE_ID_PATTERN.test(entry.id)) return refuse('id');
  const limits = KAIROS_LEARNING_SOURCE_TEXT_LIMITS;
  const title = text(entry.title, limits.title);
  if (title === null) return refuse('title');
  const covers = text(entry.covers, limits.covers);
  if (covers === null) return refuse('covers');
  const origin = text(entry.origin, limits.origin);
  if (origin === null) return refuse('origin');
  const author = entry.author === null ? null : text(entry.author, limits.author);
  if (author === null && entry.author !== null) return refuse('author');
  const rights = entry.rights === null ? null : text(entry.rights, limits.rights);
  if (rights === null && entry.rights !== null) return refuse('rights');
  if (typeof entry.language !== 'string' || !LANGUAGE_PATTERN.test(entry.language)) return refuse('language');
  const revision = entry.revision;
  if (!isPlainObject(revision)) return refuse('revision');
  const unknownRevisionKey = Object.keys(revision).find((key) => !REVISION_KEYS.includes(key));
  if (unknownRevisionKey !== undefined) return refuse(`revision.${unknownRevisionKey}`, 'unknown-field');
  if (!isInteger(revision.number, 1)) return refuse('revision.number');
  if (typeof revision.fileName !== 'string' || !KAIROS_LEARNING_SOURCE_FILE_NAME_PATTERN.test(revision.fileName)) return refuse('revision.fileName');
  if (!isInteger(revision.bytes, 1, KAIROS_LEARNING_SOURCE_MAX_BYTES)) return refuse('revision.bytes');
  if (typeof revision.sha256 !== 'string' || !SHA256_PATTERN.test(revision.sha256)) return refuse('revision.sha256');
  if (revision.pages !== null && !isInteger(revision.pages, 1)) return refuse('revision.pages');
  if (!isRealDay(revision.addedOn)) return refuse('revision.addedOn');
  return {
    ok: true,
    source: Object.freeze({
      id: entry.id, title, covers, author, origin, rights, language: entry.language,
      revision: Object.freeze({ number: revision.number, fileName: revision.fileName, bytes: revision.bytes, sha256: revision.sha256, pages: revision.pages as number | null, addedOn: revision.addedOn }),
    }),
  };
}

const catalogProblem = (field: string | null, reason: LearningSourceCatalogProblemReason): LearningSourceCatalog =>
  Object.freeze({ sources: Object.freeze([]), problems: Object.freeze([Object.freeze({ index: null, id: null, field, reason })]) });

/**
 * Reads the learning-source catalog. It never throws: a catalog-level fault
 * gives no sources and that one problem; an entry fault skips only that entry
 * and records one problem with its index. Kept sources stay in catalog order.
 */
export function parseLearningSourceCatalog(value: unknown): LearningSourceCatalog {
  if (!isPlainObject(value)) return catalogProblem(null, 'catalog-missing');
  if (value.version !== KAIROS_LEARNING_SOURCE_CATALOG_VERSION) return catalogProblem('version', 'unsupported-version');
  if (!Array.isArray(value.sources)) return catalogProblem('sources', 'catalog-missing');
  const extra = Object.keys(value).find((key) => key !== 'version' && key !== 'sources');
  if (extra !== undefined) return catalogProblem(extra, 'unknown-field');

  const sources: LearningSource[] = [];
  const problems: LearningSourceCatalogProblem[] = [];
  const ids = new Set<string>();
  const fileNames = new Set<string>();
  value.sources.forEach((entry: unknown, index: number) => {
    const id = isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : null;
    const parsed = parseEntry(entry);
    let problem: { field: string | null; reason: LearningSourceCatalogProblemReason } | null = parsed.ok ? null : parsed;
    if (parsed.ok && ids.has(parsed.source.id)) problem = { field: 'id', reason: 'duplicate-id' };
    else if (parsed.ok && fileNames.has(parsed.source.revision.fileName)) problem = { field: 'revision.fileName', reason: 'duplicate-file-name' };
    if (problem !== null || !parsed.ok) {
      problems.push(Object.freeze({ index, id, field: problem!.field, reason: problem!.reason }));
      return;
    }
    ids.add(parsed.source.id);
    fileNames.add(parsed.source.revision.fileName);
    sources.push(parsed.source);
  });
  return Object.freeze({ sources: Object.freeze(sources), problems: Object.freeze(problems) });
}

export type LearningSourceFileProblem = 'size-mismatch' | 'not-a-pdf' | 'hash-mismatch';

const PDF_START = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** The one file check: exact size, a `%PDF-` start, then the SHA-256 against the catalog. null when the file matches. */
export function checkLearningSourceFile(source: LearningSource, bytes: Uint8Array, sha256Hex: string): LearningSourceFileProblem | null {
  if (bytes.byteLength !== source.revision.bytes) return 'size-mismatch';
  if (PDF_START.some((byte, index) => bytes[index] !== byte)) return 'not-a-pdf';
  if (sha256Hex.toLowerCase() !== source.revision.sha256) return 'hash-mismatch';
  return null;
}

/** The size in decimal units, as phone file managers show it: "694 KB", "1.3 MB". */
export function formatLearningSourceSize(bytes: number): string {
  const kb = Math.round(bytes / 1000);
  if (kb < 1000) return `${Math.max(1, kb)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
