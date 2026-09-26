/**
 * U1: the route table. Every route the Kairos server answers is listed here; nothing else is ever answered.
 * Every upstream host the server may read is listed here with its route.
 */
import type { RouteCachePolicy } from './cache';
import { answerNewsCalendar, NEWS_CALENDAR_SOURCES, type NewsCalendarSource } from './news/calendarFeeds';
import { answerNewsHeadlines, NEWS_HEADLINE_SOURCES, type NewsHeadlineSource } from './news/headlineFeeds';
import type { KairosApiRoute } from './router';

const ready = (present: boolean) => (present ? 'ready' : 'missing');

/** P34: official calendars change rarely and are the same for every trader: 30 minutes in Workers Cache and memory (the page refreshes after 30), 6 hours in KV. */
export const NEWS_CALENDAR_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 1_800, memorySeconds: 1_800, kvSeconds: 21_600 });

/** P34: the only host each official calendar is read from (the exact URLs are in news/calendarFeeds.ts). */
const NEWS_CALENDAR_HOSTS: Readonly<Record<NewsCalendarSource, readonly string[]>> = Object.freeze({
  fed: ['www.federalreserve.gov'],
  bls: ['www.bls.gov'],
  bea: ['www.bea.gov'],
  census: ['www.census.gov'],
  ecb: ['www.ecb.europa.eu'],
  eurostat: ['ec.europa.eu'],
  ons: ['api.beta.ons.gov.uk'],
  boc: ['www.bankofcanada.ca'],
  rba: ['www.rba.gov.au'],
});

/** P34: one route per official calendar. Public: the data is public, keyless and the same for every trader, so Workers Cache may keep it. */
function newsCalendarRoute(source: NewsCalendarSource): KairosApiRoute {
  return { id: `news-calendar-${source}`, path: `/news/calendar/${source}`, access: 'public', rateLimited: true, query: {}, upstreamHosts: NEWS_CALENDAR_HOSTS[source], cache: NEWS_CALENDAR_CACHE, prefetch: true, handle: (context) => answerNewsCalendar(source, context) };
}

/** P34: headlines change within minutes: 10 minutes in Workers Cache and memory, never in KV (its shortest copy is an hour). */
export const NEWS_HEADLINES_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 600, memorySeconds: 600, kvSeconds: null });

/** P34: the only host each headline feed is read from (news/headlineFeeds.ts holds the URLs and the hosts its links may point to). */
const NEWS_HEADLINE_HOSTS: Readonly<Record<NewsHeadlineSource, readonly string[]>> = Object.freeze({
  fed: ['www.federalreserve.gov'],
  ecb: ['www.ecb.europa.eu'],
  boc: ['www.bankofcanada.ca'],
  bea: ['apps.bea.gov'],
  rba: ['www.rba.gov.au'],
  yahoo: ['finance.yahoo.com'],
});

/** P34: one route per headline feed, public and limited like the calendars, kept only 10 minutes. */
function newsHeadlinesRoute(source: NewsHeadlineSource): KairosApiRoute {
  return { id: `news-headlines-${source}`, path: `/news/headlines/${source}`, access: 'public', rateLimited: true, query: {}, upstreamHosts: NEWS_HEADLINE_HOSTS[source], cache: NEWS_HEADLINES_CACHE, handle: (context) => answerNewsHeadlines(source, context) };
}

export const KAIROS_API_ROUTES: readonly KairosApiRoute[] = Object.freeze([
  {
    id: 'health',
    path: '/health',
    access: 'public',
    rateLimited: false,
    query: {},
    upstreamHosts: [],
    cache: null,
    async handle({ env, device, now }) {
      return {
        ok: true,
        data: {
          service: 'kairos-api',
          serverTime: now.toISOString(),
          device: device.kind,
          checks: {
            deviceKey: ready(typeof env.KAIROS_ACTIVATION_PUBLIC_KEY_SPKI === 'string' && env.KAIROS_ACTIVATION_PUBLIC_KEY_SPKI.trim() !== ''),
            cache: ready(env.KAIROS_API_CACHE !== undefined),
            limits: ready(env.KAIROS_API_DEVICE_LIMITER !== undefined && env.KAIROS_API_ANONYMOUS_LIMITER !== undefined),
          },
        },
      };
    },
  },
  ...NEWS_CALENDAR_SOURCES.map(newsCalendarRoute),
  ...NEWS_HEADLINE_SOURCES.map(newsHeadlinesRoute),
]);
