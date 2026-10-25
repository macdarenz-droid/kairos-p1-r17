// @vitest-environment node
import { describe, expect, it } from 'vitest';
import catalogJson from '../src/content/library/learningSources.json';
import { checkLearningSourceFile, parseLearningSourceCatalog } from '../src/domain/library/learningSources';

interface NodeFs { readdirSync(path: string): string[]; readFileSync(path: string): Uint8Array }
const loadBuiltin = (name: string): Promise<unknown> => import(/* @vite-ignore */ name);
const folder = decodeURIComponent(new URL('../public/library/sources/', import.meta.url).pathname);
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');

describe('P23 shipped learning sources match their catalog', () => {
  const catalog = parseLearningSourceCatalog(catalogJson);

  it('parses the shipped catalog with no problems', () => {
    expect(catalog.problems).toEqual([]);
    expect(catalog.sources.map(source => source.id)).toContain('kairos-library-sample');
  });

  it('ships every listed file with the size, PDF start and fingerprint the catalog records', async () => {
    const fs = await loadBuiltin('node:fs') as NodeFs;
    const results = [];
    for (const source of catalog.sources) {
      const bytes = new Uint8Array(fs.readFileSync(folder + source.revision.fileName));
      const sha = hex(await crypto.subtle.digest('SHA-256', bytes));
      results.push({ fileName: source.revision.fileName, problem: checkLearningSourceFile(source, bytes, sha) });
    }
    expect(results).toEqual(catalog.sources.map(source => ({ fileName: source.revision.fileName, problem: null })));
  });

  it('ships no file without its catalog entry', async () => {
    const fs = await loadBuiltin('node:fs') as NodeFs;
    const listed = new Set(catalog.sources.map(source => source.revision.fileName));
    expect(fs.readdirSync(folder).filter(name => !listed.has(name))).toEqual([]);
  });
});
