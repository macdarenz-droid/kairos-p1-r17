import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache, MEMORY_ENTRY_MAX_CHARS, type RouteCachePolicy } from '../src/cache';
import type { KairosApiEnv, KvStore, RateLimiter } from '../src/env';
import { handleKairosApiRequest, limiterAddress, type KairosApiRoute, type RouteContext } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';
import { ACTIVATION_ID, activationKeys, deviceToken, type ActivationKeys } from './signedReceipt';

const APP = 'https://kairos-p1-r17.pages.dev';
const env: KairosApiEnv = { KAIROS_APP_ORIGINS: APP };

function route(overrides: Partial<KairosApiRoute> = {}): KairosApiRoute {
  return {
    id: 'sample',
    path: '/sample',
    access: 'public',
    rateLimited: false,
    query: { symbol: { pattern: /^[A-Z]{2,12}$/, required: true }, limit: { pattern: /^[1-9][0-9]{0,2}$/, required: false } },
    upstreamHosts: [],
    cache: null,
    handle: vi.fn(async () => ({ ok: true as const, data: { n: 1 } })),
    ...overrides,
  };
}

function call(sample: KairosApiRoute, path: string, init: RequestInit & { origin?: string | null } = {}): Promise<Response> {
  const { origin = APP, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (origin !== null) headers.set('origin', origin);
  return handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { ...rest, headers }), env, createExecutionContext(), { routes: [sample] });
}

describe('handleKairosApiRequest', () => {
  it('refuses a missing, unknown, repeated or badly formed query value before the handler', async () => {
    for (const path of ['/sample', '/sample?symbol=btc', '/sample?symbol=BTC&url=x', '/sample?symbol=BTC&symbol=ETH', '/sample?symbol=BTC&limit=0', `/sample?symbol=BTC&limit=5${'&'.repeat(513 - '?symbol=BTC&limit=5'.length)}`]) {
      const sample = route();
      const response = await call(sample, path);
      expect(response.status, path).toBe(400);
      expect(await response.json(), path).toMatchObject({ ok: false, reason: 'bad-request' });
      expect(sample.handle).not.toHaveBeenCalled();
    }
  });

  it('answers a valid request with the ok shape', async () => {
    const sample = route();
    const response = await call(sample, '/sample?symbol=BTC&limit=5');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apiVersion: 1, ok: true, data: { n: 1 } });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(APP);
    const context = vi.mocked(sample.handle).mock.calls[0][0] as RouteContext;
    expect(context.query.get('symbol')).toBe('BTC');
  });

  it('answers 404 for a path not in the table and 405 for anything but GET', async () => {
    for (const path of ['/samples', '/sample/', '/']) {
      const response = await call(route(), path);
      expect(response.status, path).toBe(404);
      expect(await response.json(), path).toMatchObject({ reason: 'not-found' });
    }
    for (const method of ['POST', 'PUT', 'HEAD']) {
      const response = await call(route(), '/sample?symbol=BTC', { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow'), method).toBe('GET, OPTIONS');
    }
  });

  it('refuses another website before any work', async () => {
    const sample = route();
    const response = await call(sample, '/sample?symbol=BTC', { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: 'origin-not-allowed' });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(sample.handle).not.toHaveBeenCalled();
  });

  it('answers a preflight from the app, and refuses one without an origin', async () => {
    const response = await call(route(), '/sample', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('accept, x-kairos-device');
    expect(response.headers.get('access-control-max-age')).toBe('7200');
    expect((await call(route(), '/sample', { method: 'OPTIONS', origin: null })).status).toBe(403);
  });

  it('turns a thrown handler into service-error and passes the source wait on', async () => {
    const thrown = await call(route({ handle: async () => { throw new Error('boom'); } }), '/sample?symbol=BTC');
    expect(thrown.status).toBe(500);
    expect(await thrown.json()).toMatchObject({ reason: 'service-error' });
    expect(thrown.headers.get('cache-control')).toBe('no-store');

    const failed = await call(route({ handle: async () => ({ ok: false as const, reason: 'source-unavailable' as const }) }), '/sample?symbol=BTC');
    expect(failed.status).toBe(502);
    expect(failed.headers.get('retry-after')).toBe('30');

    const own = await call(route({ handle: async () => ({ ok: false as const, reason: 'source-unavailable' as const, retryAfter: 5 }) }), '/sample?symbol=BTC');
    expect(own.headers.get('retry-after')).toBe('5');
  });
});

function limiter(success: boolean) {
  return { limit: vi.fn<RateLimiter['limit']>().mockResolvedValue({ success }) };
}

function callWith(routes: readonly KairosApiRoute[], path: string, callEnv: KairosApiEnv, headers: Record<string, string> = {}): Promise<Response> {
  return handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP, ...headers } }), callEnv, createExecutionContext(), { routes });
}

describe('devices and limits', () => {
  let keys: ActivationKeys;
  let good: string;

  beforeAll(async () => {
    keys = await activationKeys();
    good = await deviceToken(keys.privateKey);
  });

  it('answers a device route only for a recognised device, and limits it by its activation id', async () => {
    const deviceRoute = () => route({ access: 'device', rateLimited: true });
    const withKey = () => ({ ...env, KAIROS_ACTIVATION_PUBLIC_KEY_SPKI: keys.spki, KAIROS_API_DEVICE_LIMITER: limiter(true), KAIROS_API_ANONYMOUS_LIMITER: limiter(true) });

    const none = await callWith([deviceRoute()], '/sample?symbol=BTC', withKey());
    expect(none.status).toBe(401);
    expect(await none.json()).toMatchObject({ reason: 'device-not-recognised' });

    expect((await callWith([deviceRoute()], '/sample?symbol=BTC', withKey(), { 'x-kairos-device': 'v1.junk.junk' })).status).toBe(401);

    const noKey = await callWith([deviceRoute()], '/sample?symbol=BTC', { ...env, KAIROS_API_DEVICE_LIMITER: limiter(true) }, { 'x-kairos-device': good });
    expect(noKey.status).toBe(503);
    expect(await noKey.json()).toMatchObject({ reason: 'not-set-up' });

    const sample = deviceRoute();
    const recognisedEnv = withKey();
    const ok = await callWith([sample], '/sample?symbol=BTC', recognisedEnv, { 'x-kairos-device': good });
    expect(ok.status).toBe(200);
    expect((vi.mocked(sample.handle).mock.calls[0][0] as RouteContext).device).toEqual({ kind: 'recognised', activationId: ACTIVATION_ID });
    expect(recognisedEnv.KAIROS_API_DEVICE_LIMITER.limit).toHaveBeenCalledWith({ key: `device:${ACTIVATION_ID}` });
    expect(recognisedEnv.KAIROS_API_ANONYMOUS_LIMITER.limit).not.toHaveBeenCalled();
  });

  it('limits everyone else by a hash of their address', async () => {
    const anonymous = limiter(true);
    const response = await callWith([route({ rateLimited: true })], '/sample?symbol=BTC', { ...env, KAIROS_API_ANONYMOUS_LIMITER: anonymous }, { 'cf-connecting-ip': '203.0.113.9' });
    expect(response.status).toBe(200);
    const { key } = anonymous.limit.mock.calls[0][0];
    expect(key).toMatch(/^anonymous:[0-9a-f]{64}$/);
    expect(key).not.toContain('203.0.113.9');

    const denied = await callWith([route({ rateLimited: true })], '/sample?symbol=BTC', { ...env, KAIROS_API_ANONYMOUS_LIMITER: limiter(false) }, { 'cf-connecting-ip': '203.0.113.9' });
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBe('60');
    expect(await denied.json()).toMatchObject({ reason: 'rate-limited', retryAfter: 60 });

    const missing = await callWith([route({ rateLimited: true })], '/sample?symbol=BTC', env);
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ reason: 'not-set-up' });

    const unlimited = limiter(true);
    expect((await callWith([route()], '/sample?symbol=BTC', { ...env, KAIROS_API_ANONYMOUS_LIMITER: unlimited })).status).toBe(200);
    expect(unlimited.limit).not.toHaveBeenCalled();
  });

  it('gives one IPv6 /64 network one anonymous limit', async () => {
    const anonymous = limiter(true);
    const limitedEnv = { ...env, KAIROS_API_ANONYMOUS_LIMITER: anonymous };
    for (const ip of ['2001:db8:1:2::1', '2001:0db8:0001:0002:ffff:ffff:ffff:fffe', '2001:db8:1:3::1']) {
      await callWith([route({ rateLimited: true })], '/sample?symbol=BTC', limitedEnv, { 'cf-connecting-ip': ip });
    }
    const [first, second, third] = anonymous.limit.mock.calls.map(([options]) => options.key);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('turns an address into the anonymous limiter address', () => {
    expect(limiterAddress('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(limiterAddress('2001:0db8:0001:0002:ffff:ffff:ffff:fffe')).toBe('2001:db8:1:2::/64');
    expect(limiterAddress('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    expect(limiterAddress('203.0.113.9')).toBe('203.0.113.9');
    expect(limiterAddress('::ffff:203.0.113.9')).toBe('::ffff:203.0.113.9');
    expect(limiterAddress(null)).toBe('unidentified-client');
    expect(limiterAddress('')).toBe('unidentified-client');
  });

  it('says on /health that it recognised the device', async () => {
    const response = await callWith(KAIROS_API_ROUTES, '/health', { ...env, KAIROS_ACTIVATION_PUBLIC_KEY_SPKI: keys.spki }, { 'x-kairos-device': good });
    expect(await response.json()).toMatchObject({ ok: true, data: { device: 'recognised' } });
  });
});

describe('keeping answers and reading other sites', () => {
  const POLICY: RouteCachePolicy = { version: 1, edgeSeconds: 60, memorySeconds: 60, kvSeconds: 3600 };
  const cachedRoute = (overrides: Partial<KairosApiRoute> = {}) => route({ upstreamHosts: ['a.test'], cache: POLICY, ...overrides });

  async function send(routes: readonly KairosApiRoute[], path: string, callEnv: KairosApiEnv, fetchImpl?: typeof fetch): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), callEnv, ctx, { routes, fetchImpl });
    await waitOnExecutionContext(ctx);
    return response;
  }

  beforeEach(() => clearMemoryCache());

  it('keeps an ok answer in memory and KV, whatever the order of the query', async () => {
    const sample = cachedRoute();
    const kvEnv = { ...env, KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE };
    const first = await send([sample], '/sample?symbol=BTC&limit=5', kvEnv);
    expect(first.headers.get('x-kairos-cache')).toBe('miss');
    expect(first.headers.get('cache-control')).toBe('public, max-age=60');
    const firstJson = await first.json();

    const again = await send([sample], '/sample?limit=5&symbol=BTC', kvEnv);
    expect(again.headers.get('x-kairos-cache')).toBe('memory');

    clearMemoryCache();
    const fromKv = await send([sample], '/sample?symbol=BTC&limit=5', kvEnv);
    expect(fromKv.headers.get('x-kairos-cache')).toBe('kv');
    expect(await fromKv.json()).toEqual(firstJson);
    expect(sample.handle).toHaveBeenCalledTimes(1);
    expect(await workerEnv.KAIROS_API_CACHE!.get('sample:v1:limit=5&symbol=BTC', 'text')).not.toBeNull();
  });

  it('never keeps a failed answer', async () => {
    const handle = vi.fn(async () => ({ ok: false as const, reason: 'source-unavailable' as const }));
    const sample = cachedRoute({ handle });
    for (let call = 0; call < 2; call += 1) {
      const response = await send([sample], '/sample?symbol=FAIL', env);
      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('never fails a request because KV fails', async () => {
    const failingPut: KvStore = { get: async () => null, put: async () => { throw new Error('kv down'); } };
    expect((await send([cachedRoute()], '/sample?symbol=PUT', { ...env, KAIROS_API_CACHE: failingPut })).status).toBe(200);

    const failingGet: KvStore = { get: async () => { throw new Error('kv down'); }, put: async () => undefined };
    const sample = cachedRoute();
    expect((await send([sample], '/sample?symbol=GET', { ...env, KAIROS_API_CACHE: failingGet })).status).toBe(200);
    expect(sample.handle).toHaveBeenCalledTimes(1);
  });

  it('refuses a host the route did not list, before the network', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>();
    const sample = cachedRoute({
      handle: async ({ upstream }) => {
        await upstream('https://evil.example/x', { accept: 'application/json' });
        return { ok: true as const, data: {} };
      },
    });
    const response = await send([sample], '/sample?symbol=EVIL', env, fetchImpl);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ reason: 'service-error' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(errors.mock.calls[0][0]))).toMatchObject({ kind: 'upstream-host-refused' });
    errors.mockRestore();
  });

  it('lets a route read a host it listed', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const listed = cachedRoute({
      handle: async ({ upstream }) => {
        const result = await upstream('https://a.test/x', { accept: 'application/json' });
        return { ok: true as const, data: { read: result.ok } };
      },
    });
    const response = await send([listed], '/sample?symbol=LISTED', env, fetchImpl);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { read: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing for a route without a cache policy', async () => {
    const response = await send([route()], '/sample?symbol=BTC', env);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-kairos-cache')).toBeNull();
  });

  it('keeps memory copies within their size caps', async () => {
    const memoryOnly: RouteCachePolicy = { version: 1, edgeSeconds: 0, memorySeconds: 60, kvSeconds: null };
    const sized = (n: number) => cachedRoute({ cache: memoryOnly, handle: vi.fn(async () => ({ ok: true as const, data: { text: 'x'.repeat(n) } })) });

    const big = sized(MEMORY_ENTRY_MAX_CHARS + 1);
    expect((await send([big], '/sample?symbol=BIG', env)).headers.get('x-kairos-cache')).toBe('miss');
    expect((await send([big], '/sample?symbol=BIG', env)).headers.get('x-kairos-cache')).toBe('miss');
    expect(big.handle).toHaveBeenCalledTimes(2);

    const many = sized(950_000);
    const symbols = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II'];
    for (const symbol of symbols) await send([many], `/sample?symbol=${symbol}`, env);
    expect((await send([many], '/sample?symbol=AA', env)).headers.get('x-kairos-cache')).toBe('miss');
    expect((await send([many], '/sample?symbol=II', env)).headers.get('x-kairos-cache')).toBe('memory');
  });
});
