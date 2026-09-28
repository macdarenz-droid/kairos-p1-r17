import { describe, expect, it } from 'vitest';
import { checkLearningSourceFile, formatLearningSourceSize, parseLearningSourceCatalog, type LearningSource } from '../src/domain/library/learningSources';

const sha = '46b31007ebb63e86174b9e114b17cae86cf2c23384d1d2b0aecfaf71085ba9b7';
const entry = (overrides: Record<string, unknown> = {}, revision: Record<string, unknown> = {}) => ({
  id: 'guide', title: '  A guide  ', covers: 'What the guide covers.', author: null, origin: 'Written for the test', rights: 'Free to share.', language: 'en',
  revision: { number: 1, fileName: 'guide.pdf', bytes: 1212, sha256: sha, pages: 1, addedOn: '2026-09-24', ...revision },
  ...overrides,
});
const catalog = (...sources: unknown[]) => ({ version: 1, sources });

describe('P23 learning-source contract', () => {
  it('parses a valid entry, trimmed and frozen', () => {
    const parsed = parseLearningSourceCatalog(catalog(entry()));
    expect(parsed.problems).toEqual([]);
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0].title).toBe('A guide');
    expect(parsed.sources[0].author).toBeNull();
    expect(Object.isFrozen(parsed) && Object.isFrozen(parsed.sources) && Object.isFrozen(parsed.sources[0]) && Object.isFrozen(parsed.sources[0].revision)).toBe(true);
  });

  it('refuses the whole catalog on a catalog-level problem', () => {
    const cases: [unknown, { field: string | null; reason: string }][] = [
      [null, { field: null, reason: 'catalog-missing' }],
      [[], { field: null, reason: 'catalog-missing' }],
      [{ version: 2, sources: [] }, { field: 'version', reason: 'unsupported-version' }],
      [{ version: 1 }, { field: 'sources', reason: 'catalog-missing' }],
      [{ version: 1, sources: [], extra: 1 }, { field: 'extra', reason: 'unknown-field' }],
    ];
    for (const [value, problem] of cases) {
      expect(parseLearningSourceCatalog(value)).toEqual({ sources: [], problems: [{ index: null, id: null, ...problem }] });
    }
  });

  it('skips only the bad entry and names the problem', () => {
    const { author: _author, ...withoutAuthor } = entry({ id: 'no-author' });
    const cases: [unknown, string | null, string, string][] = [
      [entry({ id: 'x', script: 'alert(1)' }), 'x', 'script', 'unknown-field'],
      [entry({ id: 'Bad Id' }), 'Bad Id', 'id', 'invalid-field'],
      [entry({ id: 'x', title: '   ' }), 'x', 'title', 'invalid-field'],
      [entry({ id: 'x', title: 'a'.repeat(121) }), 'x', 'title', 'invalid-field'],
      [entry({ id: 'x', title: 'Two\nlines' }), 'x', 'title', 'invalid-field'],
      [withoutAuthor, 'no-author', 'author', 'invalid-field'],
      [entry({ id: 'x', language: 'english' }), 'x', 'language', 'invalid-field'],
      [entry({ id: 'x' }, { fileName: '../x.pdf' }), 'x', 'revision.fileName', 'invalid-field'],
      [entry({ id: 'x' }, { fileName: 'guide.exe' }), 'x', 'revision.fileName', 'invalid-field'],
      [entry({ id: 'x' }, { bytes: 0 }), 'x', 'revision.bytes', 'invalid-field'],
      [entry({ id: 'x' }, { bytes: 26_214_401 }), 'x', 'revision.bytes', 'invalid-field'],
      [entry({ id: 'x' }, { sha256: sha.replace('b', 'B') }), 'x', 'revision.sha256', 'invalid-field'],
      [entry({ id: 'x' }, { pages: 0 }), 'x', 'revision.pages', 'invalid-field'],
      [entry({ id: 'x' }, { addedOn: '2026-02-30' }), 'x', 'revision.addedOn', 'invalid-field'],
      [entry({ id: 'x' }, { checksum: 'abc' }), 'x', 'revision.checksum', 'unknown-field'],
      [entry({ id: 'guide' }, { fileName: 'other.pdf' }), 'guide', 'id', 'duplicate-id'],
      [entry({ id: 'other' }), 'other', 'revision.fileName', 'duplicate-file-name'],
    ];
    for (const [bad, id, field, reason] of cases) {
      const parsed = parseLearningSourceCatalog(catalog(entry(), bad, entry({ id: 'last' }, { fileName: 'last.pdf' })));
      expect(parsed.problems).toEqual([{ index: 1, id, field, reason }]);
      expect(parsed.sources.map(source => source.id)).toEqual(['guide', 'last']);
    }
  });

  it('checks the size, the PDF start and the fingerprint', () => {
    const source = parseLearningSourceCatalog(catalog(entry({}, { bytes: 8 }))).sources[0] as LearningSource;
    const pdf = new TextEncoder().encode('%PDF-1.4');
    expect(checkLearningSourceFile(source, new Uint8Array(7), sha)).toBe('size-mismatch');
    expect(checkLearningSourceFile(source, new TextEncoder().encode('<!doctyp'), sha)).toBe('not-a-pdf');
    expect(checkLearningSourceFile(source, pdf, 'f'.repeat(64))).toBe('hash-mismatch');
    expect(checkLearningSourceFile(source, pdf, sha)).toBeNull();
    expect(checkLearningSourceFile(source, pdf, sha.toUpperCase())).toBeNull();
  });

  it('writes the size in decimal units', () => {
    expect([1212, 693607, 999499, 999500, 1320725, 14812348].map(formatLearningSourceSize)).toEqual(['1 KB', '694 KB', '999 KB', '1.0 MB', '1.3 MB', '14.8 MB']);
  });
});
