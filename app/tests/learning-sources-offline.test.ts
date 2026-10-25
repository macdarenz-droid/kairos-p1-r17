// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  browserLearningSourceDevice,
  learningSourceHref,
  readLearningSourceCatalog,
  readLearningSourceOfflineStates,
  removeLearningSourceFromDevice,
  saveLearningSourceForOffline,
  type LearningSourceCache,
  type LearningSourceDevice,
} from '../src/application/library';
import { parseLearningSourceCatalog, type LearningSource } from '../src/domain/library/learningSources';

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const bytes = new TextEncoder().encode('%PDF-1.4 kairos test');
const sha = hex(await crypto.subtle.digest('SHA-256', bytes));
const source: LearningSource = parseLearningSourceCatalog({ version: 1, sources: [{
  id: 'test-source', title: 'Test', covers: 'A test file.', author: null, origin: 'Test', rights: null, language: 'en',
  revision: { number: 1, fileName: 'test.pdf', bytes: bytes.byteLength, sha256: sha, pages: 1, addedOn: '2026-09-24' },
}] }).sources[0];

function fakeCache() {
  const store = new Map<string, Response>();
  const keyOf = (request: string | Request) => { const url = new URL(typeof request === 'string' ? request : request.url, 'https://kairos.test'); return url.pathname + url.search; };
  const cache: LearningSourceCache & { store: Map<string, Response> } = {
    store,
    keys: async () => [...store.keys()].map(key => new Request(new URL(key, 'https://kairos.test'))),
    match: async url => store.get(keyOf(url))?.clone(),
    put: vi.fn(async (url: string, response: Response) => { store.set(keyOf(url), response); }),
    delete: async request => store.delete(keyOf(request)),
  };
  return cache;
}
function device(overrides: Partial<LearningSourceDevice> = {}, cache = fakeCache()) {
  const download = vi.fn(async (_href: string) => new Response(bytes));
  const value: LearningSourceDevice = {
    openCache: async () => cache,
    download,
    sha256Hex: async data => hex(await crypto.subtle.digest('SHA-256', data)),
    freeSpace: async () => null,
    ...overrides,
  };
  return { device: value, cache, download: (overrides.download ?? download) as typeof download };
}

describe('P23 learning sources on this device', () => {
  it('reads the shipped catalog once and names each revision in its URL', () => {
    const catalog = readLearningSourceCatalog();
    expect(catalog.problems).toEqual([]);
    const sample = catalog.sources.find(item => item.id === 'kairos-library-sample')!;
    expect(sample).toBeDefined();
    expect(readLearningSourceCatalog()).toBe(catalog);
    expect(learningSourceHref(sample)).toBe('/library/sources/kairos-library-sample.pdf?rev=46b31007ebb63e86');
  });

  it('saves a checked file and lists it as saved', async () => {
    const { device: d, cache } = device();
    expect(await saveLearningSourceForOffline(source, d)).toEqual({ ok: true });
    const stored = cache.store.get(learningSourceHref(source))!;
    expect(stored.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await stored.clone().arrayBuffer())).toEqual(bytes);
    const states = await readLearningSourceOfflineStates([source], d);
    expect(states.kind === 'ready' && [...states.saved]).toEqual(['test-source']);
  });

  it('stores nothing when the download or the check fails', async () => {
    const cases: [Partial<LearningSourceDevice>, string][] = [
      [{ download: async () => { throw new TypeError('offline'); } }, 'download-failed'],
      [{ download: async () => new Response('missing', { status: 404 }) }, 'download-failed'],
      [{ download: async () => new Response(new TextEncoder().encode('<!doctype html>kairos')) }, 'file-mismatch'],
      [{ download: async () => new Response(new TextEncoder().encode('%PDF-1')) }, 'file-mismatch'],
      [{ sha256Hex: async () => '0'.repeat(64) }, 'file-mismatch'],
    ];
    for (const [overrides, reason] of cases) {
      const { device: d, cache } = device(overrides);
      expect(await saveLearningSourceForOffline(source, d)).toEqual({ ok: false, reason });
      expect(cache.store.size).toBe(0);
    }
  });

  it('keeps space free for the journal', async () => {
    const tight = device({ freeSpace: async () => bytes.byteLength + 50_000_000 - 1 });
    expect(await saveLearningSourceForOffline(source, tight.device)).toEqual({ ok: false, reason: 'not-enough-space' });
    expect(tight.download).not.toHaveBeenCalled();
    expect(await saveLearningSourceForOffline(source, device({ freeSpace: async () => null }).device)).toEqual({ ok: true });
  });

  it('refuses without Cache Storage or Web Crypto, and says when storing fails', async () => {
    const noCache = device({ openCache: null });
    expect(await readLearningSourceOfflineStates([source], noCache.device)).toEqual({ kind: 'unsupported' });
    expect(await saveLearningSourceForOffline(source, noCache.device)).toEqual({ ok: false, reason: 'unsupported' });
    expect(await removeLearningSourceFromDevice(source, noCache.device)).toEqual({ ok: false, reason: 'unsupported' });
    const noCrypto = device({ sha256Hex: null });
    expect(await saveLearningSourceForOffline(source, noCrypto.device)).toEqual({ ok: false, reason: 'unsupported' });
    expect(noCrypto.download).not.toHaveBeenCalled();
    const full = fakeCache();
    full.put = async () => { throw new DOMException('full', 'QuotaExceededError'); };
    expect(await saveLearningSourceForOffline(source, device({}, full).device)).toEqual({ ok: false, reason: 'storage-failed' });
  });

  it('removes old revisions and unlisted files on read, and removes a saved source on request', async () => {
    const { device: d, cache } = device();
    await saveLearningSourceForOffline(source, d);
    cache.store.set('/library/sources/test.pdf?rev=ffffffffffffffff', new Response('old'));
    cache.store.set('/library/sources/gone.pdf?rev=aaaaaaaaaaaaaaaa', new Response('gone'));
    const states = await readLearningSourceOfflineStates([source], d);
    expect(states.kind === 'ready' && [...states.saved]).toEqual(['test-source']);
    expect([...cache.store.keys()]).toEqual([learningSourceHref(source)]);
    expect(await removeLearningSourceFromDevice(source, d)).toEqual({ ok: true });
    const after = await readLearningSourceOfflineStates([source], d);
    expect(after.kind === 'ready' && after.saved.size).toBe(0);
  });

  it('builds the browser device from what the runtime has', async () => {
    const real = browserLearningSourceDevice();
    expect(real.openCache).toBeNull();
    expect(await real.sha256Hex!(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
