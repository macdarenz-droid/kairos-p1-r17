import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { buildCalendarAnswer, NEWS_CALENDAR_FEEDS, NEWS_CALENDAR_SOURCES } from '../src/news/calendarFeeds';
import { newsEventKey } from '../src/news/newsParsing';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES, NEWS_CALENDAR_CACHE } from '../src/routes';
import { createUpstreamFetch } from '../src/upstream';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const ics = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((event) => ['BEGIN:VEVENT', ...event.split('\n'), 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');

const THIRD = 'GDP (Third Estimate), Industries, Corporate Profits, State GDP, and State Personal Income, 2nd Quarter 2026; State PCE, 2025';
const BEA = ics(
  'DTSTART;VALUE=DATE-TIME:20261029T123000Z\nSUMMARY:GDP (Advance Estimate)\\, 3rd Quarter 2026',
  `DTSTART:20260930T123000Z\nSUMMARY:${THIRD.slice(0, 60).replace(/,/g, '\\,').replace(/;/g, '\;')}\n ${THIRD.slice(60).replace(/,/g, '\\,').replace(/;/g, '\;')}`,
);
const BLS = ics(
  'DTSTART;TZID=US-Eastern:20261014T083000\nSUMMARY:Consumer Price Index',
  'DTSTART;TZID=US-Eastern:20261106T083000\nSUMMARY:Employment Situation',
  'DTSTART;TZID=Europe/Paris:20261014T083000\nSUMMARY:Somewhere else',
  'DTSTART;TZID=US-Eastern:20261015T083000',
);
const BOC = ics('DTSTART:20261028T134500Z\nSUMMARY:Interest Rate Announcement and Monetary Policy Report', 'DTSTART:20261225T050000Z\nSUMMARY:Christmas Day');
const EUROSTAT = ics('DTSTART;VALUE=DATE:20261002\nSUMMARY:Flash estimate inflation euro area');
const HTML = '<!doctype html><html><body>Service unavailable</body></html>';
const UA = 'Kairos-api/1 (+https://kairos-p1-r17.pages.dev)';

describe('the four iCalendar decoders', () => {
  it('BEA: UTC times, titles unescaped and whole, sorted, covered and keyed', () => {
    expect(THIRD.length).toBeGreaterThan(75);
    const data = buildCalendarAnswer('bea', [BEA], NOW)!;
    expect(data.events).toEqual([
      { key: newsEventKey('bea', THIRD, '2026-09-30T12:30:00.000Z'), title: THIRD, startsAt: '2026-09-30T12:30:00.000Z' },
      { key: newsEventKey('bea', 'GDP (Advance Estimate), 3rd Quarter 2026', '2026-10-29T12:30:00.000Z'), title: 'GDP (Advance Estimate), 3rd Quarter 2026', startsAt: '2026-10-29T12:30:00.000Z' },
    ]);
    expect(data).toMatchObject({ source: 'bea', fetchedAt: '2026-09-26T02:00:00.000Z', covers: { from: '2026-09-30T12:30:00.000Z', to: '2026-10-29T12:30:00.000Z' }, leftOut: 0 });
  });

  it('BLS: US-Eastern times across the clock change; another zone and a missing title are left out', () => {
    const data = buildCalendarAnswer('bls', [BLS], NOW)!;
    expect(data.events.map(({ title, startsAt }) => ({ title, startsAt }))).toEqual([
      { title: 'Consumer Price Index', startsAt: '2026-10-14T12:30:00.000Z' },
      { title: 'Employment Situation', startsAt: '2026-11-06T13:30:00.000Z' },
    ]);
    expect(data.leftOut).toBe(2);
  });

  it('Bank of Canada keeps every event (rating is the app\'s); Eurostat dates get 11:00 in Luxembourg', () => {
    expect(buildCalendarAnswer('boc', [BOC], NOW)!.events.map(({ title, startsAt }) => [title, startsAt])).toEqual([
      ['Interest Rate Announcement and Monetary Policy Report', '2026-10-28T13:45:00.000Z'],
      ['Christmas Day', '2026-12-25T05:00:00.000Z'],
    ]);
    expect(buildCalendarAnswer('eurostat', [EUROSTAT], NOW)!.events.map(({ title, startsAt }) => [title, startsAt])).toEqual([['Flash estimate inflation euro area', '2026-10-02T09:00:00.000Z']]);
  });

  it('drops events past the window uncounted, keeps a repeated event once, and refuses a body that is not a calendar', () => {
    const late = new Date(NOW + 401 * 86_400_000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const twice = 'DTSTART:20261028T134500Z\nSUMMARY:Interest Rate Announcement';
    const data = buildCalendarAnswer('boc', [ics(twice, twice, `DTSTART:${late}\nSUMMARY:Far away`)], NOW)!;
    expect(data.events.map((event) => event.title)).toEqual(['Interest Rate Announcement']);
    expect(data.leftOut).toBe(0);
    expect(buildCalendarAnswer('bea', [HTML], NOW)).toBeNull();
  });
});

describe('the news calendar routes', () => {
  const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
  const baseEnv = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() });
  const bodies: Record<string, [string, string]> = {
    'www.bls.gov': [BLS, 'text/calendar; charset=utf-8'],
    'www.bea.gov': [BEA, 'text/plain; charset=UTF-8'],
    'ec.europa.eu': [EUROSTAT, 'text/plain; charset=UTF-8'],
    'www.bankofcanada.ca': [BOC, 'text/calendar'],
  };
  const sources = () => vi.fn<typeof fetch>(async (input) => {
    const [body, type] = bodies[new URL(String(input)).hostname];
    return new Response(body, { status: 200, headers: { 'content-type': type } });
  });
  async function call(path: string, env: KairosApiEnv, fetchImpl: typeof fetch, method = 'GET') {
    const ctx = createExecutionContext();
    const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { method, headers: { origin: APP } }), env, ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
    await waitOnExecutionContext(ctx);
    return response;
  }

  beforeEach(() => clearMemoryCache());

  it('answers BLS in the one shape, reads the source once, and keeps it in memory and KV', async () => {
    const fetchImpl = sources();
    const env = { ...baseEnv(), KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE };
    const first = await call('/news/calendar/bls', env, fetchImpl);
    expect(first.status).toBe(200);
    const json = await first.json();
    expect(json).toEqual({ apiVersion: 1, ok: true, data: JSON.parse(JSON.stringify(buildCalendarAnswer('bls', [BLS], NOW))) });
    expect(json).toMatchObject({ data: { fetchedAt: '2026-09-26T02:00:00.000Z' } });
    expect(first.headers.get('cache-control')).toBe('public, max-age=1800');
    expect(first.headers.get('x-kairos-cache')).toBe('miss');
    expect(first.headers.get('access-control-allow-origin')).toBe(APP);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://www.bls.gov/schedule/news_release/bls.ics');
    expect(init).toMatchObject({ redirect: 'manual' });
    expect(init!.headers).toEqual({ accept: 'text/calendar', 'user-agent': UA });

    const second = await call('/news/calendar/bls', env, fetchImpl);
    expect(second.headers.get('x-kairos-cache')).toBe('memory');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clearMemoryCache();
    const third = await call('/news/calendar/bls', env, fetchImpl);
    expect(third.headers.get('x-kairos-cache')).toBe('kv');
    expect(await third.json()).toEqual(json);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await workerEnv.KAIROS_API_CACHE!.get('news-calendar-bls:v1:', 'text')).not.toBeNull();
  });

  it('asks BEA and Eurostat for text/plain and reads their text/plain answers', async () => {
    for (const [source, host] of [['bea', 'www.bea.gov'], ['eurostat', 'ec.europa.eu']] as const) {
      const fetchImpl = sources();
      const response = await call(`/news/calendar/${source}`, baseEnv(), fetchImpl);
      expect(response.status, source).toBe(200);
      expect(new URL(String(fetchImpl.mock.calls[0][0])).hostname).toBe(host);
      expect((fetchImpl.mock.calls[0][1]!.headers as Record<string, string>).accept).toBe('text/plain');
    }
  });

  it('refuses unknown paths, any query and other methods before the network', async () => {
    const fetchImpl = sources();
    for (const path of ['/news/calendar/nope', '/news/calendar', '/news/calendar/bls/']) {
      const response = await call(path, baseEnv(), fetchImpl);
      expect(response.status, path).toBe(404);
      expect(await response.json(), path).toMatchObject({ reason: 'not-found' });
    }
    const withQuery = await call('/news/calendar/bls?from=2026-09-01', baseEnv(), fetchImpl);
    expect(withQuery.status).toBe(400);
    expect(await withQuery.json()).toMatchObject({ reason: 'bad-request' });
    expect((await call('/news/calendar/bls', baseEnv(), fetchImpl, 'POST')).status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers source-unavailable for any failed read, and never keeps it', async () => {
    const failures: Array<[string, () => Promise<Response>]> = [
      ['500', async () => new Response('down', { status: 500, headers: { 'content-type': 'text/plain' } })],
      ['302', async () => new Response('', { status: 302, headers: { location: 'https://evil.example/' } })],
      ['rejected', async () => { throw new TypeError('network down'); }],
      ['too large', async () => new Response(BEA, { status: 200, headers: { 'content-type': 'text/plain', 'content-length': '2000000' } })],
      ['html as text', async () => new Response(HTML, { status: 200, headers: { 'content-type': 'text/plain' } })],
    ];
    for (const [label, answer] of failures) {
      clearMemoryCache();
      const fetchImpl = vi.fn<typeof fetch>(answer);
      for (let round = 0; round < 2; round += 1) {
        const response = await call('/news/calendar/bea', baseEnv(), fetchImpl);
        expect(response.status, label).toBe(502);
        expect(await response.json(), label).toMatchObject({ reason: 'source-unavailable' });
        expect(response.headers.get('retry-after'), label).toBe('30');
        expect(response.headers.get('cache-control'), label).toBe('no-store');
      }
      expect(fetchImpl, label).toHaveBeenCalledTimes(2);
    }
  });

  it('lists each calendar as a public, limited route with no query, the calendar cache and every host its feed reads', () => {
    for (const id of NEWS_CALENDAR_SOURCES) {
      const route = KAIROS_API_ROUTES.find((candidate) => candidate.id === `news-calendar-${id}`);
      expect(route, id).toMatchObject({ path: `/news/calendar/${id}`, access: 'public', rateLimited: true, query: {}, cache: NEWS_CALENDAR_CACHE });
      for (const url of NEWS_CALENDAR_FEEDS[id].urls(NOW)) expect(route!.upstreamHosts, url).toContain(new URL(url).hostname);
    }
  });

  it('the fetcher reads a text/plain calendar and still refuses HTML', async () => {
    const answer = (type: string) => vi.fn<typeof fetch>().mockResolvedValue(new Response(BEA, { status: 200, headers: { 'content-type': type } }));
    expect(await createUpstreamFetch(['www.bea.gov'], answer('text/plain; charset=UTF-8'))('https://www.bea.gov/x.ics', { accept: 'text/plain' })).toMatchObject({ ok: true, text: BEA });
    expect(await createUpstreamFetch(['www.bea.gov'], answer('text/html'))('https://www.bea.gov/x.ics', { accept: 'text/plain' })).toEqual({ ok: false, failure: 'content-type', status: 200 });
  });
});
