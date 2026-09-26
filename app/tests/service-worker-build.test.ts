// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import template from '../src/pwa/serviceWorker.js?raw';
import { KAIROS_LEARNING_SOURCES_CACHE, KAIROS_LEARNING_SOURCES_PATH, buildKairosServiceWorker, listKairosPublicPrecacheFiles, type KairosServiceWorkerBuildFile } from '../src/pwa/serviceWorkerBuild';

const files = (icon = new Uint8Array([1, 2, 3])): KairosServiceWorkerBuildFile[] => [
  { fileName: 'index.html', content: '<!doctype html><script src="/assets/index-a1.js"></script>' },
  { fileName: 'assets/index-a1.js', content: 'console.log(1)' },
  { fileName: 'assets/index-a1.js.map', content: '{}' },
  { fileName: 'assets/index-b2.css', content: 'body{}' },
  { fileName: 'icons/kairos-icon-192.png', content: icon },
  { fileName: 'manifest.webmanifest', content: '{"name":"Kairos"}' },
];

describe('service worker build', () => {
  it('lists every kept file once, with index.html as /', () => {
    expect(buildKairosServiceWorker(template, { buildId: 'dev-local', files: files() }).precacheUrls)
      .toEqual(['/', '/assets/index-a1.js', '/assets/index-b2.css', '/icons/kairos-icon-192.png', '/manifest.webmanifest']);
  });

  it('names the cache from the build id and the file contents', () => {
    const first = buildKairosServiceWorker(template, { buildId: 'dev-local', files: files() });
    const again = buildKairosServiceWorker(template, { buildId: 'dev-local', files: files() });
    const changed = buildKairosServiceWorker(template, { buildId: 'dev-local', files: files(new Uint8Array([1, 2, 4])) });
    expect(again.cacheVersion).toBe(first.cacheVersion);
    expect(changed.cacheVersion).not.toBe(first.cacheVersion);
    expect(first.cacheVersion).toMatch(/^dev-local-[0-9a-f]{8}$/);
    expect(buildKairosServiceWorker(template, { buildId: 'b7', files: files() }).cacheVersion).toMatch(/^b7-[0-9a-f]{8}$/);
  });

  it('refuses a template without the config token', () => {
    expect(() => buildKairosServiceWorker('self.addEventListener("install", () => {});', { buildId: 'x', files: files() }))
      .toThrow('The service worker template must contain __KAIROS_SERVICE_WORKER_CONFIG__ exactly once.');
  });

  it('finds the public files a built index.html references', () => {
    const html = '<script type="module" crossorigin src="/assets/index-x.js"></script><link rel="manifest" href="/manifest.webmanifest">'
      + '<link rel="icon" href="/icons/kairos-icon-192.png"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><a href="//cdn.example/x.js"></a>';
    expect(listKairosPublicPrecacheFiles(html)).toEqual(['icons/apple-touch-icon.png', 'icons/kairos-icon-192.png', 'manifest.webmanifest']);
  });
});

type Listener = (event: Record<string, unknown>) => void;

function runWorker() {
  const build = buildKairosServiceWorker(template, { buildId: 'dev-local', files: files() });
  const cacheName = `kairos-app-shell-${build.cacheVersion}`;
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const store = (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name)!; };
  const keyOf = (request: string | { url: string }) => { const url = new URL(typeof request === 'string' ? request : request.url, 'https://kairos.test'); return url.pathname + url.search; };
  const cacheFor = (name: string) => ({
    addAll: vi.fn(async (urls: string[]) => { for (const url of urls) store(name).set(url, new Response(`cached ${url}`)); }),
    match: vi.fn(async (request: string | { url: string }) => store(name).get(keyOf(request))?.clone()),
    put: vi.fn(async (request: string | { url: string }, response: Response) => { store(name).set(keyOf(request), response); }),
  });
  const openCaches = new Map<string, ReturnType<typeof cacheFor>>();
  const fakeCaches = {
    open: vi.fn(async (name: string) => { if (!openCaches.has(name)) openCaches.set(name, cacheFor(name)); return openCaches.get(name)!; }),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (request: { url: string }) => { for (const entries of stores.values()) { const hit = entries.get(keyOf(request)); if (hit) return hit.clone(); } return undefined; }),
  };
  const fakeSelf = {
    location: { origin: 'https://kairos.test' },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
  };
  const fakeFetch = vi.fn<(request: unknown) => Promise<Response>>();
  new Function('self', 'caches', 'fetch', build.source)(fakeSelf, fakeCaches, fakeFetch);
  const dispatch = async (type: string, fields: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | null = null;
    listeners.get(type)!({ ...fields, waitUntil: (promise: Promise<unknown>) => waits.push(promise), respondWith: (promise: Promise<Response>) => { responded = promise; } });
    await Promise.all(waits);
    return responded as Promise<Response> | null;
  };
  return { build, cacheName, stores, store, fakeCaches, fakeSelf, fakeFetch, dispatch, openCaches };
}

const request = (url: string, extra: Record<string, unknown> = {}) => ({ url, method: 'GET', mode: 'no-cors', destination: '', ...extra });

describe('service worker behaviour', () => {
  it('precaches its own file list on install and waits for the user', async () => {
    const worker = runWorker();
    await worker.dispatch('install');
    expect(worker.fakeCaches.open).toHaveBeenCalledWith(worker.cacheName);
    expect(worker.openCaches.get(worker.cacheName)!.addAll).toHaveBeenCalledWith(worker.build.precacheUrls);
    expect(worker.fakeSelf.skipWaiting).not.toHaveBeenCalled();
  });

  it('deletes old Kairos caches on activate and keeps the current and foreign ones', async () => {
    const worker = runWorker();
    worker.store('kairos-app-shell-old'); worker.store(worker.cacheName); worker.store('other-app');
    await worker.dispatch('activate');
    expect([...worker.stores.keys()].sort()).toEqual([worker.cacheName, 'other-app'].sort());
  });

  it('takes over only when asked', async () => {
    const worker = runWorker();
    await worker.dispatch('message', { data: { type: 'KAIROS_ACTIVATE_UPDATE' } });
    expect(worker.fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('answers an offline page load with its own cached shell', async () => {
    const worker = runWorker();
    await worker.dispatch('install');
    worker.fakeFetch.mockRejectedValue(new TypeError('offline'));
    const response = await worker.dispatch('fetch', { request: request('https://kairos.test/journal', { mode: 'navigate' }) });
    expect(await (await response!).text()).toBe('cached /');
  });

  it('leaves cross-origin and non-GET requests alone', async () => {
    const worker = runWorker();
    expect(await worker.dispatch('fetch', { request: request('https://api.binance.com/api/v3/ticker/24hr', { destination: 'script' }) })).toBeNull();
    expect(await worker.dispatch('fetch', { request: request('https://kairos.test/assets/x.js', { method: 'POST' }) })).toBeNull();
    expect(worker.fakeFetch).not.toHaveBeenCalled();
  });

  it('never stores an HTML answer for a script', async () => {
    const worker = runWorker();
    worker.fakeFetch.mockResolvedValue(new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const response = await worker.dispatch('fetch', { request: request('https://kairos.test/assets/x.js', { destination: 'script' }) });
    await response;
    expect(worker.store(worker.cacheName).has('/assets/x.js')).toBe(false);
  });

  it('never precaches a learning source', () => {
    expect(() => buildKairosServiceWorker(template, { buildId: 'x', files: [...files(), { fileName: 'assets/guide-a1.pdf', content: '%PDF-' }] }))
      .toThrow('Learning sources are never precached: assets/guide-a1.pdf');
    expect(() => buildKairosServiceWorker(template, { buildId: 'x', files: [...files(), { fileName: 'library/sources/a.txt', content: 'x' }] })).toThrow();
  });

  it('serves a saved learning source offline, even as a page load', async () => {
    const worker = runWorker();
    expect(KAIROS_LEARNING_SOURCES_PATH).toBe('/library/sources/');
    worker.store(KAIROS_LEARNING_SOURCES_CACHE).set('/library/sources/a.pdf?rev=aaaaaaaaaaaaaaaa', new Response('%PDF-saved'));
    worker.fakeFetch.mockRejectedValue(new TypeError('offline'));
    const response = await worker.dispatch('fetch', { request: request('https://kairos.test/library/sources/a.pdf?rev=aaaaaaaaaaaaaaaa', { mode: 'navigate' }) });
    expect(await (await response!).text()).toBe('%PDF-saved');
  });

  it('says a source is not saved when it is offline, for a missing file or another revision', async () => {
    for (const saved of [false, true]) {
      const worker = runWorker();
      if (saved) worker.store(KAIROS_LEARNING_SOURCES_CACHE).set('/library/sources/a.pdf?rev=aaaaaaaaaaaaaaaa', new Response('%PDF-saved'));
      worker.fakeFetch.mockRejectedValue(new TypeError('offline'));
      const url = `https://kairos.test/library/sources/a.pdf?rev=${saved ? 'bbbbbbbbbbbbbbbb' : 'aaaaaaaaaaaaaaaa'}`;
      const answer = await (await worker.dispatch('fetch', { request: request(url, { mode: 'navigate' }) }))!;
      expect(answer.status).toBe(503);
      expect(answer.headers.get('content-type')).toContain('text/plain');
    }
  });

  it('passes an unsaved source through online without storing it', async () => {
    const worker = runWorker();
    worker.fakeFetch.mockResolvedValue(new Response('%PDF-net'));
    const response = await worker.dispatch('fetch', { request: request('https://kairos.test/library/sources/a.pdf?rev=aaaaaaaaaaaaaaaa', { mode: 'navigate' }) });
    expect(await (await response!).text()).toBe('%PDF-net');
    for (const entries of worker.stores.values()) expect([...entries.keys()].some(key => key.startsWith('/library/'))).toBe(false);
  });

  it('keeps saved learning sources through an update and leaves a POST alone', async () => {
    const worker = runWorker();
    worker.store(KAIROS_LEARNING_SOURCES_CACHE).set('/library/sources/a.pdf?rev=aaaaaaaaaaaaaaaa', new Response('%PDF-saved'));
    worker.store('kairos-app-shell-old');
    await worker.dispatch('activate');
    expect(worker.stores.has(KAIROS_LEARNING_SOURCES_CACHE)).toBe(true);
    expect(await worker.dispatch('fetch', { request: request('https://kairos.test/library/sources/a.pdf', { method: 'POST' }) })).toBeNull();
  });
});
