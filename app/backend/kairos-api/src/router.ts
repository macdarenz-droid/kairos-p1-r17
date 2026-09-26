/**
 * U1: one pipeline for every request, in this order: origin, preflight, route, method, query, device, access, rate limit,
 * cache, handler. A route is a fixed
 * entry in the route table (routes.ts): an exact path, the query names it accepts with a strict pattern each, and a
 * handler. Anything else is refused with the one error shape; nothing is guessed and no request value becomes a URL.
 */
import { cacheControlFor, cacheKey, keep, readCached, type RouteCachePolicy } from './cache';
import { checkDevice, KAIROS_DEVICE_HEADER, type DeviceCheck } from './device';
import type { KairosApiEnv } from './env';
import { isAllowedOrigin, okResponse, parseAllowedOrigins, preflightResponse, unavailableResponse, type UnavailableReason } from './http';
import { createUpstreamFetch, UpstreamHostRefused, type UpstreamFetch } from './upstream';

export interface QueryRule { readonly pattern: RegExp; readonly required: boolean }

export type RouteAnswer =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{ ok: false; reason: 'source-unavailable' | 'not-set-up' | 'bad-request'; retryAfter?: number | null }>;

export interface RouteContext {
  readonly query: URLSearchParams;
  readonly env: KairosApiEnv;
  readonly device: DeviceCheck;
  readonly upstream: UpstreamFetch;
  readonly now: Date;
}

export interface KairosApiRoute {
  readonly id: string;
  readonly path: string;
  /** 'device': only a recognised device gets an answer. */
  readonly access: 'public' | 'device';
  /** false only for a route that does no upstream, storage or heavy work (/health). */
  readonly rateLimited: boolean;
  readonly query: Readonly<Record<string, QueryRule>>;
  readonly upstreamHosts: readonly string[];
  readonly cache: RouteCachePolicy | null;
  readonly handle: (context: RouteContext) => Promise<RouteAnswer>;
}

export interface RouterOptions {
  readonly routes: readonly KairosApiRoute[];
  readonly now?: () => Date;
  /** Tests only: the fetch the upstream fetcher uses. */
  readonly fetchImpl?: typeof fetch;
}

export const MAX_QUERY_LENGTH = 512;

/** Every name known to the route, each once, each value matching its pattern, every required name present. */
export function isValidQuery(route: KairosApiRoute, url: URL): boolean {
  if (url.search.length > MAX_QUERY_LENGTH) return false;
  const seen = new Set<string>();
  for (const [name, value] of url.searchParams) {
    const rule = Object.hasOwn(route.query, name) ? route.query[name] : undefined;
    if (rule === undefined || seen.has(name) || !rule.pattern.test(value)) return false;
    seen.add(name);
  }
  return Object.entries(route.query).every(([name, rule]) => !rule.required || seen.has(name));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The anonymous limiter's address: IPv4 as sent; IPv6 by its /64 network, because one line or server owns a whole /64. */
export function limiterAddress(ip: string | null): string {
  const value = ip?.trim().toLowerCase() ?? '';
  if (value === '') return 'unidentified-client';
  if (!value.includes(':') || value.includes('.')) return value;
  const [head, tail] = value.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export async function handleKairosApiRequest(request: Request, env: KairosApiEnv, ctx: { waitUntil(promise: Promise<unknown>): void }, options: RouterOptions): Promise<Response> {
  const allowed = parseAllowedOrigins(env.KAIROS_APP_ORIGINS);
  const origin = request.headers.get('origin');
  const fail = (reason: UnavailableReason, retryAfter?: number | null) => unavailableResponse(reason, origin, allowed, retryAfter);
  try {
    if (origin !== null && !isAllowedOrigin(origin, allowed)) return fail('origin-not-allowed');
    if (request.method === 'OPTIONS') return origin === null ? fail('origin-not-allowed') : preflightResponse(origin);
    const url = new URL(request.url);
    const route = options.routes.find((candidate) => candidate.path === url.pathname);
    if (route === undefined) return fail('not-found');
    if (request.method !== 'GET') return fail('method-not-allowed');
    if (!isValidQuery(route, url)) return fail('bad-request');
    const device = await checkDevice(request.headers.get(KAIROS_DEVICE_HEADER), env.KAIROS_ACTIVATION_PUBLIC_KEY_SPKI);
    if (route.access === 'device' && device.kind !== 'recognised') return fail(device.kind === 'not-checked' ? 'not-set-up' : 'device-not-recognised');
    if (route.rateLimited) {
      const limiter = device.kind === 'recognised' ? env.KAIROS_API_DEVICE_LIMITER : env.KAIROS_API_ANONYMOUS_LIMITER;
      if (limiter === undefined) return fail('not-set-up');
      const key = device.kind === 'recognised'
        ? `device:${device.activationId}`
        : `anonymous:${await sha256Hex(limiterAddress(request.headers.get('cf-connecting-ip')))}`;
      if (!(await limiter.limit({ key })).success) return fail('rate-limited');
    }
    const now = options.now?.() ?? new Date();
    const key = route.cache === null ? null : cacheKey(route.id, route.cache, url.searchParams);
    if (route.cache !== null && key !== null) {
      const hit = await readCached(key, route.cache, env.KAIROS_API_CACHE, now.getTime());
      if (hit !== null) {
        const response = okResponse(hit.stored.data, origin, allowed, cacheControlFor(route.cache));
        response.headers.set('x-kairos-cache', hit.layer);
        return response;
      }
    }
    const answer = await route.handle({ query: url.searchParams, env, device, upstream: createUpstreamFetch(route.upstreamHosts, options.fetchImpl), now });
    if (!answer.ok) return fail(answer.reason, answer.retryAfter);
    if (route.cache !== null && key !== null) keep(key, { storedAt: now.toISOString(), data: answer.data }, route.cache, env.KAIROS_API_CACHE, now.getTime(), (promise) => ctx.waitUntil(promise));
    const response = okResponse(answer.data, origin, allowed, cacheControlFor(route.cache));
    if (route.cache !== null) response.headers.set('x-kairos-cache', 'miss');
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: 'kairos-api-error', kind: error instanceof UpstreamHostRefused ? 'upstream-host-refused' : 'exception' }));
    return fail('service-error');
  }
}
