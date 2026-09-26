import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache, type RouteCachePolicy } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import worker from '../src/index';
import { buildCalendarAnswer, NEWS_CALENDAR_SOURCES } from '../src/news/calendarFeeds';
import { handleKairosApiRequest, type KairosApiRoute } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';
import { handleKairosApiScheduled, PREFETCH_STEP_MS, prefetchRouteAt, prefetchRoutes } from '../src/scheduled';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const BOC_URL = 'https://www.bankofcanada.ca/content_type/upcoming-events/?feed=ical';
const BOC_KEY = 'news-calendar-boc:v1:';
const ics = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((event) => ['BEGIN:VEVENT', ...event.split('\n'), 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');
const BOC = ics('DTSTART:20261028T134500Z\nSUMMARY:Interest Rate Announcement and Monetary Policy Report', 'DTSTART:20261225T050000Z\nSUMMARY:Christmas Day');
const BOC_RUN = 7 * PREFETCH_STEP_MS;

const answerBoc = () => vi.fn<typeof fetch>(async () => new Response(BOC, { status: 200, headers: { 'content-type': 'text/calendar' } }));
const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const production = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ROLE: 'production', KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE });

async function run(scheduledTime: number, env: KairosApiEnv, fetchImpl: typeof fetch, now = NOW) {
  const ctx = createExecutionContext();
  const outcome = await handleKairosApiScheduled(scheduledTime, env, ctx, { routes: KAIROS_API_ROUTES, now: () => new Date(now), fetchImpl });
  await waitOnExecutionContext(ctx);
  return outcome;
}
const stored = async () => JSON.parse((await workerEnv.KAIROS_API_CACHE!.get(BOC_KEY, 'text'))!);

beforeEach(() => clearMemoryCache());
afterEach(() => vi.restoreAllMocks());

describe('which route each run reads', () => {
  it('reads the nine calendars in turn, one per 20-minute step, and keeps its step a few seconds early or late', () => {
    const ids = Array.from({ length: 18 }, (_, k) => prefetchRouteAt(KAIROS_API_ROUTES, k * PREFETCH_STEP_MS)?.id);
    const calendars = NEWS_CALENDAR_SOURCES.map((source) => `news-calendar-${source}`);
    expect(ids).toEqual([...calendars, ...calendars]);
    for (let k = 0; k < 18; k += 1) {
      expect(prefetchRouteAt(KAIROS_API_ROUTES, k * PREFETCH_STEP_MS + 5_000)?.id, `k=${k} late`).toBe(ids[k]);
      expect(prefetchRouteAt(KAIROS_API_ROUTES, k * PREFETCH_STEP_MS - 5_000)?.id, `k=${k} early`).toBe(ids[k]);
    }
    expect(prefetchRouteAt(KAIROS_API_ROUTES.filter((route) => route.id === 'health'), 0)).toBeNull();
  });

  it('reads only public routes marked prefetch, with no query names and a KV copy', () => {
    expect(prefetchRoutes(KAIROS_API_ROUTES).map((route) => route.id)).toEqual(NEWS_CALENDAR_SOURCES.map((source) => `news-calendar-${source}`));
    const base = KAIROS_API_ROUTES.find((route) => route.id === 'news-calendar-boc')!;
    const noKv: RouteCachePolicy = { ...base.cache!, kvSeconds: null };
    const variants: KairosApiRoute[] = [
      { ...base, id: 'device', access: 'device' },
      { ...base, id: 'query', query: { from: { pattern: /^\d{4}$/, required: false } } },
      { ...base, id: 'no-kv', cache: noKv },
    ];
    expect(prefetchRoutes([...variants, base]).map((route) => route.id)).toEqual(['news-calendar-boc']);
  });
});

describe('the scheduled job', () => {
  it('keeps the Bank of Canada answer in KV, where a trader\'s request then finds it', async () => {
    const fetchImpl = answerBoc();
    expect(await run(BOC_RUN, production(), fetchImpl)).toBe('kept');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(BOC_URL);
    const data = JSON.parse(JSON.stringify(buildCalendarAnswer('boc', [BOC], NOW)));
    expect(await stored()).toEqual({ storedAt: '2026-09-26T02:00:00.000Z', data });

    clearMemoryCache();
    const ctx = createExecutionContext();
    const env: KairosApiEnv = { ...production(), KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() };
    const response = await handleKairosApiRequest(new Request('https://kairos-api.example.workers.dev/news/calendar/boc', { headers: { origin: APP } }), env, ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW + 60_000) });
    await waitOnExecutionContext(ctx);
    expect(response.headers.get('x-kairos-cache')).toBe('kv');
    expect(await response.json()).toEqual({ apiVersion: 1, ok: true, data });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good copy when a later read fails, and logs only the event and the route', async () => {
    expect(await run(BOC_RUN, production(), answerBoc())).toBe('kept');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const down = vi.fn<typeof fetch>(async () => new Response('down', { status: 503, headers: { 'content-type': 'text/plain' } }));
    expect(await run(BOC_RUN + 9 * PREFETCH_STEP_MS, production(), down, NOW + 3 * 3_600_000)).toBe('failed');
    expect((await stored()).storedAt).toBe('2026-09-26T02:00:00.000Z');
    expect(error.mock.calls).toEqual([['{"event":"kairos-api-prefetch-failed","route":"news-calendar-boc"}']]);

    const unused = answerBoc();
    expect(await run(BOC_RUN, { KAIROS_APP_ORIGINS: APP, KAIROS_API_ROLE: 'production' }, unused)).toBe('failed');
    expect(unused).not.toHaveBeenCalled();
  });

  it('returns at once off the production Worker: no source read, no KV use, no log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const role of ['preview', undefined]) {
      const kv = { get: vi.fn(), put: vi.fn() };
      const fetchImpl = answerBoc();
      const env = { KAIROS_APP_ORIGINS: APP, KAIROS_API_CACHE: kv, ...(role === undefined ? {} : { KAIROS_API_ROLE: role }) } as KairosApiEnv;
      expect(await run(BOC_RUN, env, fetchImpl), String(role)).toBe('not-production');
      expect(fetchImpl, String(role)).not.toHaveBeenCalled();
      expect(kv.get, String(role)).not.toHaveBeenCalled();
      expect(kv.put, String(role)).not.toHaveBeenCalled();
    }
    expect(error).not.toHaveBeenCalled();
  });

  it('runs through the Worker entry with the config\'s production role', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(String(input instanceof Request ? input.url : input)).toBe(BOC_URL);
      return new Response(BOC, { status: 200, headers: { 'content-type': 'text/calendar' } });
    });
    const ctx = createExecutionContext();
    await worker.scheduled!({ scheduledTime: BOC_RUN, cron: '*/20 * * * *', noRetry() {} } as ScheduledController, workerEnv as KairosApiEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await workerEnv.KAIROS_API_CACHE!.get(BOC_KEY, 'text')).not.toBeNull();
  });
});
