import { createExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import type { KairosApiEnv } from '../src/env';
import { handleKairosApiRequest, type KairosApiRoute, type RouteContext } from '../src/router';

const APP = 'https://kairos-p1-r17.pages.dev';
const env: KairosApiEnv = { KAIROS_APP_ORIGINS: APP };

function route(overrides: Partial<KairosApiRoute> = {}): KairosApiRoute {
  return {
    id: 'sample',
    path: '/sample',
    query: { symbol: { pattern: /^[A-Z]{2,12}$/, required: true }, limit: { pattern: /^[1-9][0-9]{0,2}$/, required: false } },
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
