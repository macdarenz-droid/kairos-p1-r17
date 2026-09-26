/**
 * P34: the Kairos server's news routes (backend/kairos-api, /news/calendar/<source> and /news/headlines/<source>) and the
 * strict decoding of their data. The address, the device header, the time limit and the answer shape stay in
 * kairosApi.ts; what the news means for the trader belongs to application/economic-calendar.
 */
import type { KairosApiClient, KairosApiResult } from './kairosApi';

export interface NewsCalendarEvent {
  readonly key: string;
  readonly title: string;
  readonly startsAt: string;
}
export interface NewsCalendarAnswer {
  readonly source: string;
  readonly fetchedAt: string;
  /** The window the source vouched for; null when it listed nothing. */
  readonly covers: Readonly<{ from: string; to: string }> | null;
  readonly events: readonly NewsCalendarEvent[];
  readonly leftOut: number;
}
export interface NewsHeadline {
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly publisher: string | null;
}
export interface NewsHeadlinesAnswer {
  readonly source: string;
  readonly fetchedAt: string;
  readonly items: readonly NewsHeadline[];
  readonly leftOut: number;
}

/** The server's limits (backend/kairos-api/src/news): at most 2,000 events and 20 headlines a source. */
const MAX_EVENTS = 2_000;
const MAX_HEADLINES = 20;
const EVENT_KEY = /^[0-9a-f]{16}$/;
const SOURCE = /^[a-z]{2,16}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
/** Plain text as the server sends it: 1 to `limit` characters, trimmed, no control characters. */
const isText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= limit && value.trim() === value && !CONTROL_CHARACTERS.test(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** A calendar route's data, or null when any part is missing, out of its limits or about another source. */
export function decodeNewsCalendar(data: unknown, source: string): NewsCalendarAnswer | null {
  if (!isRecord(data) || data.source !== source || !isInstant(data.fetchedAt) || !isCount(data.leftOut)) return null;
  const { covers, events } = data;
  let window: NewsCalendarAnswer['covers'] = null;
  if (covers !== null) {
    if (!isRecord(covers) || !isInstant(covers.from) || !isInstant(covers.to) || covers.from > covers.to) return null;
    window = Object.freeze({ from: covers.from, to: covers.to });
  }
  if (!Array.isArray(events) || events.length > MAX_EVENTS) return null;
  const decoded: NewsCalendarEvent[] = [];
  for (const event of events) {
    if (!isRecord(event) || typeof event.key !== 'string' || !EVENT_KEY.test(event.key) || !isText(event.title, 200) || !isInstant(event.startsAt)) return null;
    decoded.push(Object.freeze({ key: event.key, title: event.title, startsAt: event.startsAt }));
  }
  return Object.freeze({ source, fetchedAt: data.fetchedAt, covers: window, events: Object.freeze(decoded), leftOut: data.leftOut });
}

/** A headline route's data, or null when any part is missing, out of its limits or about another source. */
export function decodeNewsHeadlines(data: unknown, source: string): NewsHeadlinesAnswer | null {
  if (!isRecord(data) || data.source !== source || !isInstant(data.fetchedAt) || !isCount(data.leftOut)) return null;
  const { items } = data;
  if (!Array.isArray(items) || items.length > MAX_HEADLINES) return null;
  const decoded: NewsHeadline[] = [];
  for (const item of items) {
    if (!isRecord(item) || !isText(item.title, 300) || typeof item.url !== 'string' || !isInstant(item.publishedAt)) return null;
    if (item.publisher !== null && !isText(item.publisher, 80)) return null;
    decoded.push(Object.freeze({ title: item.title, url: item.url, publishedAt: item.publishedAt, publisher: item.publisher }));
  }
  return Object.freeze({ source, fetchedAt: data.fetchedAt, items: Object.freeze(decoded), leftOut: data.leftOut });
}

export interface NewsApiPort {
  /** false when this build has no Kairos server address. */
  readonly setUp: boolean;
  calendar(source: string, options?: { readonly signal?: AbortSignal }): Promise<KairosApiResult<NewsCalendarAnswer>>;
  headlines(source: string, options?: { readonly signal?: AbortSignal }): Promise<KairosApiResult<NewsHeadlinesAnswer>>;
}

function checkedSource(source: string): string {
  // A programming error, like the client's own path check: the call rejects before any request.
  if (!SOURCE.test(source)) throw new TypeError(`Not a news source id: ${source}`);
  return source;
}

/** The news routes over U1's client. No retries: a failure is the client's KairosApiFailure (a refused decode is 'invalid-response'). */
export function createNewsApiPort(client: KairosApiClient): NewsApiPort {
  return Object.freeze({
    setUp: client.setUp,
    async calendar(source: string, options?: { readonly signal?: AbortSignal }) {
      const id = checkedSource(source);
      return client.request(`/news/calendar/${id}`, {}, (data) => decodeNewsCalendar(data, id), options);
    },
    async headlines(source: string, options?: { readonly signal?: AbortSignal }) {
      const id = checkedSource(source);
      return client.request(`/news/headlines/${id}`, {}, (data) => decodeNewsHeadlines(data, id), options);
    },
  });
}
