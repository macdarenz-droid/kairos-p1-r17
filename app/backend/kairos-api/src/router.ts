/**
 * U1: one pipeline for every request, in this order: origin, preflight, route, method, query, handler. A route is a fixed
 * entry in the route table (routes.ts): an exact path, the query names it accepts with a strict pattern each, and a
 * handler. Anything else is refused with the one error shape; nothing is guessed and no request value becomes a URL.
 */
import type { KairosApiEnv } from './env';
import { isAllowedOrigin, okResponse, parseAllowedOrigins, preflightResponse, unavailableResponse, type UnavailableReason } from './http';

export interface QueryRule { readonly pattern: RegExp; readonly required: boolean }

export type RouteAnswer =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{ ok: false; reason: 'source-unavailable' | 'not-set-up' | 'bad-request'; retryAfter?: number | null }>;

export interface RouteContext {
  readonly query: URLSearchParams;
  readonly env: KairosApiEnv;
  readonly now: Date;
}

export interface KairosApiRoute {
  readonly id: string;
  readonly path: string;
  readonly query: Readonly<Record<string, QueryRule>>;
  readonly handle: (context: RouteContext) => Promise<RouteAnswer>;
}

export interface RouterOptions {
  readonly routes: readonly KairosApiRoute[];
  readonly now?: () => Date;
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
    const now = options.now?.() ?? new Date();
    const answer = await route.handle({ query: url.searchParams, env, now });
    if (!answer.ok) return fail(answer.reason, answer.retryAfter);
    return okResponse(answer.data, origin, allowed, 'no-store');
  } catch {
    console.error(JSON.stringify({ event: 'kairos-api-error' }));
    return fail('service-error');
  }
}
