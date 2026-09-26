/**
 * P34: the official release calendars the Kairos server reads, one route per source. Each feed names its only URLs and
 * turns the source's own file into small JSON: a title and a UTC instant per release, plus how many rows it left out.
 * The server rates nothing and decides nothing about the product; the app does that (golden rule 7).
 */
import type { RouteAnswer, RouteContext } from '../router';
import type { UpstreamRequest } from '../upstream';
import { createZonedClock, newsEventKey, normaliseNewsText, readIcsEvents } from './newsParsing';

export const NEWS_CALENDAR_WINDOW_DAYS = 400;
export const NEWS_CALENDAR_MAX_EVENTS = 2000;
export const NEWS_CALENDAR_TITLE_MAX = 200;
export const NEWS_CALENDAR_SOURCES = Object.freeze(['bls', 'bea', 'eurostat', 'boc'] as const);
export type NewsCalendarSource = (typeof NEWS_CALENDAR_SOURCES)[number];

type Covers = Readonly<{ from: string; to: string }>;
export type DecodedCalendar = Readonly<{ events: readonly Readonly<{ title: string; startsAt: string }>[]; leftOut: number; covers: Covers | null }>;

export interface CalendarFeed {
  readonly request: UpstreamRequest;
  urls(nowMs: number): readonly string[];
  /** null: the body is not what the source publishes. */
  decode(texts: readonly string[], nowMs: number): DecodedCalendar | null;
}

const DAY_MS = 86_400_000;
const UTC_STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
const LOCAL_STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})00$/;
const DATE_STAMP = /^(\d{4})(\d{2})(\d{2})$/;

/** YYYYMMDDTHHMMSSZ as a UTC instant; null for anything else, such as 30 February. */
function utcStamp(value: string): string | null {
  const match = UTC_STAMP.exec(value);
  if (match === null) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
  const at = Date.parse(iso);
  return Number.isFinite(at) && new Date(at).toISOString() === iso ? iso : null;
}

const newYork = createZonedClock('America/New_York');
const luxembourg = createZonedClock('Europe/Luxembourg');

/** One iCalendar file: each event's title and the instant `startOf` accepts; any other row is left out and counted. */
function icsFeed(url: string, request: UpstreamRequest, startOf: (dtstart: Readonly<{ params: string; value: string }>) => string | null): CalendarFeed {
  return Object.freeze({
    request: Object.freeze(request),
    urls: () => Object.freeze([url]),
    decode(texts: readonly string[]): DecodedCalendar | null {
      const rows = texts.length === 1 ? readIcsEvents(texts[0]) : null;
      if (rows === null) return null;
      const events: { title: string; startsAt: string }[] = [];
      let leftOut = 0;
      for (const row of rows) {
        const title = normaliseNewsText(row.summary, NEWS_CALENDAR_TITLE_MAX);
        const startsAt = row.dtstart === null ? null : startOf(row.dtstart);
        if (title === null || startsAt === null) leftOut += 1;
        else events.push({ title, startsAt });
      }
      return { events, leftOut, covers: null };
    },
  });
}

const utcStart = ({ params, value }: Readonly<{ params: string; value: string }>) => (params === '' || params === ';VALUE=DATE-TIME' ? utcStamp(value) : null);

export const NEWS_CALENDAR_FEEDS: Readonly<Record<NewsCalendarSource, CalendarFeed>> = Object.freeze({
  bls: icsFeed('https://www.bls.gov/schedule/news_release/bls.ics', { accept: 'text/calendar' }, ({ params, value }) => {
    const match = params === ';TZID=US-Eastern' ? LOCAL_STAMP.exec(value) : null;
    return match === null ? null : newYork(`${match[1]}-${match[2]}-${match[3]}`, `${match[4]}:${match[5]}`);
  }),
  bea: icsFeed('https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics', { accept: 'text/plain' }, utcStart),
  // Eurostat lists dates only; it publishes first releases "at 11 am CET", Europe/Luxembourg time.
  eurostat: icsFeed('https://ec.europa.eu/eurostat/o/calendars/eventsIcal?theme=0&category=2', { accept: 'text/plain' }, ({ params, value }) => {
    const match = params === ';VALUE=DATE' ? DATE_STAMP.exec(value) : null;
    return match === null ? null : luxembourg(`${match[1]}-${match[2]}-${match[3]}`, '11:00');
  }),
  boc: icsFeed('https://www.bankofcanada.ca/content_type/upcoming-events/?feed=ical', { accept: 'text/calendar' }, utcStart),
});

export interface NewsCalendarData {
  readonly source: NewsCalendarSource;
  readonly fetchedAt: string;
  /** The window the source vouched for; null with no events. */
  readonly covers: Covers | null;
  readonly events: readonly Readonly<{ key: string; title: string; startsAt: string }>[];
  readonly leftOut: number;
}

/** The route's data from the source's bodies: events within 400 days of now, one per key, in time order; null when the bodies are not the source's or hold too many events. */
export function buildCalendarAnswer(source: NewsCalendarSource, texts: readonly string[], nowMs: number): NewsCalendarData | null {
  const decoded = NEWS_CALENDAR_FEEDS[source].decode(texts, nowMs);
  if (decoded === null) return null;
  const earliest = nowMs - NEWS_CALENDAR_WINDOW_DAYS * DAY_MS;
  const latest = nowMs + NEWS_CALENDAR_WINDOW_DAYS * DAY_MS;
  const byKey = new Map<string, { key: string; title: string; startsAt: string }>();
  for (const event of decoded.events) {
    const at = Date.parse(event.startsAt);
    if (!(at >= earliest && at <= latest)) continue;
    const key = newsEventKey(source, event.title, event.startsAt);
    if (!byKey.has(key)) byKey.set(key, { key, title: event.title, startsAt: event.startsAt });
  }
  const events = [...byKey.values()].sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  if (events.length > NEWS_CALENDAR_MAX_EVENTS) return null;
  let covers: Covers | null = null;
  if (decoded.covers !== null) {
    const from = Math.max(Date.parse(decoded.covers.from), earliest);
    const to = Math.min(Date.parse(decoded.covers.to), latest);
    covers = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  } else if (events.length > 0) {
    covers = { from: events[0].startsAt, to: events[events.length - 1].startsAt };
  }
  return { source, fetchedAt: new Date(nowMs).toISOString(), covers, events, leftOut: decoded.leftOut };
}

/** One official calendar, read now from its source; any failed read or unreadable body is 'source-unavailable'. */
export async function answerNewsCalendar(source: NewsCalendarSource, context: RouteContext): Promise<RouteAnswer> {
  const nowMs = context.now.getTime();
  const feed = NEWS_CALENDAR_FEEDS[source];
  const results = await Promise.all(feed.urls(nowMs).map((url) => context.upstream(url, feed.request)));
  const texts: string[] = [];
  for (const result of results) {
    if (!result.ok) return { ok: false, reason: 'source-unavailable' };
    texts.push(result.text);
  }
  const data = buildCalendarAnswer(source, texts, nowMs);
  return data === null ? { ok: false, reason: 'source-unavailable' } : { ok: true, data };
}
