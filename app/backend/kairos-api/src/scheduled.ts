/**
 * P34: the Kairos server's scheduled job. A cron trigger (wrangler.jsonc, every 20 minutes) keeps the answers of the routes
 * marked `prefetch` fresh in KV: each run reads ONE of them, in turn (one source per run keeps it inside the Free plan's
 * 10 ms of CPU), so with nine routes each is read every 3 hours. Only an ok answer is kept (U1's keep); a failed read
 * leaves the last good copy in KV until it expires, and logs only an event name and the route id. It runs only on the
 * production Worker (U1's var KAIROS_API_ROLE is "production"): the preview Worker kairos-api-preview is deployed from
 * the same config and gets the same cron trigger, but there, or with no role set, a run returns at once, reading no
 * source and writing no KV.
 */
import { cacheKey, keep } from './cache';
import type { KairosApiEnv } from './env';
import type { KairosApiRoute } from './router';
import { createUpstreamFetch } from './upstream';

export const PREFETCH_STEP_MS = 20 * 60_000;

export type PrefetchOutcome = 'kept' | 'failed' | 'nothing-due' | 'not-production';

/** The routes the job may read, in table order: marked `prefetch`, public, without query names, kept in KV. */
export function prefetchRoutes(routes: readonly KairosApiRoute[]): readonly KairosApiRoute[] {
  return routes.filter((route) => route.prefetch === true && route.access === 'public' && Object.keys(route.query).length === 0 && route.cache !== null && route.cache.kvSeconds !== null);
}

/** The route read by the run scheduled at `scheduledTime`: each 20-minute step reads the next one (rounded, so a run a few seconds early or late keeps its step). */
export function prefetchRouteAt(routes: readonly KairosApiRoute[], scheduledTime: number): KairosApiRoute | null {
  const due = prefetchRoutes(routes);
  if (due.length === 0 || !Number.isFinite(scheduledTime)) return null;
  const step = Math.round(scheduledTime / PREFETCH_STEP_MS);
  return due[((step % due.length) + due.length) % due.length];
}

export interface ScheduledOptions {
  readonly routes: readonly KairosApiRoute[];
  readonly now?: () => Date;
  /** Tests only. */
  readonly fetchImpl?: typeof fetch;
}

export async function handleKairosApiScheduled(scheduledTime: number, env: KairosApiEnv, ctx: { waitUntil(promise: Promise<unknown>): void }, options: ScheduledOptions): Promise<PrefetchOutcome> {
  if (env.KAIROS_API_ROLE !== 'production') return 'not-production';
  const route = prefetchRouteAt(options.routes, scheduledTime);
  if (route === null || route.cache === null) return 'nothing-due';
  const failed = (): PrefetchOutcome => {
    console.error(JSON.stringify({ event: 'kairos-api-prefetch-failed', route: route.id }));
    return 'failed';
  };
  const kv = env.KAIROS_API_CACHE;
  if (kv === undefined) return failed();
  const now = options.now?.() ?? new Date();
  const query = new URLSearchParams();
  try {
    const answer = await route.handle({ query, env, device: { kind: 'not-sent' }, upstream: createUpstreamFetch(route.upstreamHosts, options.fetchImpl), now });
    if (!answer.ok) return failed();
    keep(cacheKey(route.id, route.cache, query), { storedAt: now.toISOString(), data: answer.data }, route.cache, kv, now.getTime(), (promise) => ctx.waitUntil(promise));
    return 'kept';
  } catch {
    return failed();
  }
}
