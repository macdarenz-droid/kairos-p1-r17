import { describe, expect, it, vi } from 'vitest';
import { createUpstreamFetch, UpstreamHostRefused } from '../src/upstream';

const HOSTS = ['api.binance.com'];

function answer(body: string, status = 200, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status, headers }));
}

describe('createUpstreamFetch', () => {
  it('refuses every host the route did not list, before the network', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const upstream = createUpstreamFetch(HOSTS, fetchImpl);
    for (const url of ['https://evil.example/x', 'http://api.binance.com/x', 'https://api.binance.com:8443/x', 'https://u:p@api.binance.com/x', 'https://api.binance.com.evil.example/x', 'nonsense']) {
      await expect(upstream(url, { accept: 'application/json' }), url).rejects.toBeInstanceOf(UpstreamHostRefused);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never follows a redirect and sends only its own headers', async () => {
    const fetchImpl = answer('', 302, { location: 'https://evil.example/' });
    expect(await createUpstreamFetch(HOSTS, fetchImpl)('https://api.binance.com/x', { accept: 'application/json' })).toEqual({ ok: false, failure: 'redirect', status: 302 });
    const init = fetchImpl.mock.calls[0][1]!;
    expect(init.redirect).toBe('manual');
    expect(init.headers).toEqual({ accept: 'application/json', 'user-agent': 'Kairos-api/1 (+https://kairos-p1-r17.pages.dev)' });

    const keyed = answer('{}');
    await createUpstreamFetch(HOSTS, keyed)('https://api.binance.com/x', { accept: 'application/json', headers: { 'x-api-key': 'k' } });
    expect(keyed.mock.calls[0][1]!.headers).toEqual({ 'x-api-key': 'k', accept: 'application/json', 'user-agent': 'Kairos-api/1 (+https://kairos-p1-r17.pages.dev)' });
  });

  it('checks the answer: status, type and size', async () => {
    const get = (fetchImpl: typeof fetch, accept: 'application/json' | 'application/xml' = 'application/json', maxBytes?: number) =>
      createUpstreamFetch(HOSTS, fetchImpl)('https://api.binance.com/x', { accept, maxBytes });
    expect(await get(answer('{"x":1}'))).toEqual({ ok: true, status: 200, contentType: 'application/json', text: '{"x":1}' });
    expect(await get(answer('x'.repeat(2000)), 'application/json', 1000)).toMatchObject({ ok: false, failure: 'too-large' });
    expect(await get(answer('{}', 200, { 'content-type': 'application/json', 'content-length': '5000000' }))).toMatchObject({ ok: false, failure: 'too-large' });
    expect(await get(answer('<html></html>', 200, { 'content-type': 'text/html' }))).toMatchObject({ ok: false, failure: 'content-type' });
    expect(await get(answer('<rss/>', 200, { 'content-type': 'application/rss+xml; charset=utf-8' }), 'application/xml')).toMatchObject({ ok: true, text: '<rss/>' });
    expect(await get(answer('down', 503))).toEqual({ ok: false, failure: 'status', status: 503 });
  });

  it('gives up after the time limit, and reports a network failure', async () => {
    const hanging = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
    }));
    expect(await createUpstreamFetch(HOSTS, hanging)('https://api.binance.com/x', { accept: 'application/json', timeoutMs: 50 })).toEqual({ ok: false, failure: 'timeout', status: null });
    const broken = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network down'));
    expect(await createUpstreamFetch(HOSTS, broken)('https://api.binance.com/x', { accept: 'application/json' })).toEqual({ ok: false, failure: 'network', status: null });
  });

  it('reports a timeout when the time limit runs out while the answer is being read', async () => {
    const stalling = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"x":'));
          init!.signal!.addEventListener('abort', () => controller.error(init!.signal!.reason));
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    expect(await createUpstreamFetch(HOSTS, stalling)('https://api.binance.com/x', { accept: 'application/json', timeoutMs: 50 })).toEqual({ ok: false, failure: 'timeout', status: 200 });
  });
});
