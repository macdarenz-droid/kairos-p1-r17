import { describe, expect, it } from 'vitest';
import { KV_MIN_SECONDS } from '../src/cache';
import { KAIROS_API_ROUTES } from '../src/routes';

describe('KAIROS_API_ROUTES', () => {
  it('has unique ids and exact, plain paths', () => {
    expect(new Set(KAIROS_API_ROUTES.map((route) => route.id)).size).toBe(KAIROS_API_ROUTES.length);
    expect(new Set(KAIROS_API_ROUTES.map((route) => route.path)).size).toBe(KAIROS_API_ROUTES.length);
    for (const route of KAIROS_API_ROUTES) expect(route.path, route.id).toMatch(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/);
  });

  it('anchors every query pattern and lists plain upstream hosts', () => {
    for (const route of KAIROS_API_ROUTES) {
      for (const [name, rule] of Object.entries(route.query)) {
        expect(rule.pattern.source.startsWith('^') && rule.pattern.source.endsWith('$'), `${route.id}.${name}`).toBe(true);
      }
      for (const host of route.upstreamHosts) expect(host, route.id).toMatch(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
    }
  });

  it('keeps answers only by a sound cache policy, and never at the edge for a device route', () => {
    for (const route of KAIROS_API_ROUTES) {
      const cache = route.cache;
      if (cache !== null) {
        expect(Number.isInteger(cache.version) && cache.version >= 1, route.id).toBe(true);
        expect(Number.isInteger(cache.edgeSeconds) && cache.edgeSeconds >= 0, route.id).toBe(true);
        expect(Number.isInteger(cache.memorySeconds) && cache.memorySeconds >= 0, route.id).toBe(true);
        expect(cache.kvSeconds === null || cache.kvSeconds >= KV_MIN_SECONDS, route.id).toBe(true);
      }
      if (route.access === 'device') expect(cache === null || cache.edgeSeconds === 0, route.id).toBe(true);
    }
  });

  it('keeps /health public, unlimited, with no hosts and no cache', () => {
    const health = KAIROS_API_ROUTES.find((route) => route.path === '/health');
    expect(health).toMatchObject({ access: 'public', rateLimited: false, upstreamHosts: [], cache: null });
  });
});
