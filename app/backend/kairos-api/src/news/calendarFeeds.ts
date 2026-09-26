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
export const NEWS_CALENDAR_SOURCES = Object.freeze(['fed', 'bls', 'bea', 'census', 'ecb', 'eurostat', 'ons', 'boc', 'rba'] as const);
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
const frankfurt = createZonedClock('Europe/Berlin');
const sydney = createZonedClock('Australia/Sydney');

const pad2 = (value: number): string => String(value).padStart(2, '0');
const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return undefined;
  }
}
const MONTHS: readonly string[] = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

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

const FED_MONTH = /^\d{4}-\d{2}$/;
const FED_DAYS = /^\d{1,2}(, ?\d{1,2})*$/;
const FED_TIME = /^(\d{1,2}):(\d{2}) (a|p)\.m\.$/;

/** The Fed's calendar JSON: one event per listed day, its time in New York; an entry in any other form counts once. */
const fedFeed: CalendarFeed = Object.freeze({
  request: Object.freeze({ accept: 'application/json' as const }),
  urls: () => Object.freeze(['https://www.federalreserve.gov/json/calendar.json']),
  decode(texts: readonly string[]): DecodedCalendar | null {
    const json = texts.length === 1 ? parseJson(texts[0]) : undefined;
    if (!isRecord(json) || !Array.isArray(json.events)) return null;
    const events: { title: string; startsAt: string }[] = [];
    let leftOut = 0;
    for (const entry of json.events) {
      const found = isRecord(entry) ? fedEntry(entry) : null;
      if (found === null) leftOut += 1;
      else events.push(...found);
    }
    // A body that matches no entry at all has changed shape.
    return events.length === 0 && leftOut === 0 ? null : { events, leftOut, covers: null };
  },
});

function fedEntry(entry: Record<string, unknown>): { title: string; startsAt: string }[] | null {
  const title = normaliseNewsText(entry.title, NEWS_CALENDAR_TITLE_MAX);
  const { month, days, time } = entry;
  if (title === null || typeof month !== 'string' || !FED_MONTH.test(month) || typeof days !== 'string' || !FED_DAYS.test(days) || typeof time !== 'string') return null;
  const clock = FED_TIME.exec(time);
  if (clock === null || Number(clock[1]) < 1 || Number(clock[1]) > 12) return null;
  const hour = (Number(clock[1]) % 12) + (clock[3] === 'p' ? 12 : 0);
  const found: { title: string; startsAt: string }[] = [];
  for (const day of days.split(/, ?/)) {
    const startsAt = newYork(`${month}-${pad2(Number(day))}`, `${pad2(hour)}:${clock[2]}`);
    if (startsAt === null) return null;
    found.push({ title, startsAt });
  }
  return found;
}

const ONS_DAY_MS = 92 * DAY_MS;
const ONS_RELEASE_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const onsUrl = (from: string, to: string, type: 'type-published' | 'type-upcoming') =>
  `https://api.beta.ons.gov.uk/v1/search/releases?fromDate=${from}&toDate=${to}&release-type=${type}&sort=release_date_asc&limit=1000`;

/** The ONS release calendar: the last and the next 92 days, each page whole; a cancelled or provisional release counts. */
const onsFeed: CalendarFeed = Object.freeze({
  request: Object.freeze({ accept: 'application/json' as const }),
  urls: (nowMs: number) => Object.freeze([
    onsUrl(dayKey(nowMs - ONS_DAY_MS), dayKey(nowMs), 'type-published'),
    onsUrl(dayKey(nowMs), dayKey(nowMs + ONS_DAY_MS), 'type-upcoming'),
  ]),
  decode(texts: readonly string[], nowMs: number): DecodedCalendar | null {
    if (texts.length !== 2) return null;
    const events: { title: string; startsAt: string }[] = [];
    let leftOut = 0;
    for (const text of texts) {
      const json = parseJson(text);
      // A page cut short cannot vouch for its window.
      if (!isRecord(json) || !Array.isArray(json.releases) || !isRecord(json.breakdown) || json.breakdown.total !== json.releases.length) return null;
      for (const release of json.releases) {
        const found = isRecord(release) && isRecord(release.description) ? onsRelease(release.description) : null;
        if (found === null) leftOut += 1;
        else events.push(found);
      }
    }
    const day = 91 * DAY_MS;
    return { events, leftOut, covers: { from: `${dayKey(nowMs - day)}T00:00:00.000Z`, to: `${dayKey(nowMs + day)}T00:00:00.000Z` } };
  },
});

function onsRelease(description: Record<string, unknown>): { title: string; startsAt: string } | null {
  const title = normaliseNewsText(description.title, NEWS_CALENDAR_TITLE_MAX);
  const date = description.release_date;
  if (title === null || typeof date !== 'string' || !ONS_RELEASE_DATE.test(date)) return null;
  // Only a finalised date is kept: a provisional one may still move.
  if (description.cancelled === true || description.finalised !== true) return null;
  const at = Date.parse(date);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 19) !== date.slice(0, 19)) return null;
  return { title, startsAt: new Date(at).toISOString() };
}

const CENSUS_ROW = /<tr\b[\s\S]*?<\/tr>/g;
const CENSUS_KEY = /sorttable_customkey="(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})"[^>]*>([\s\S]*?)<\/td>/;
const CENSUS_DATE = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/;
const CENSUS_LINK = /<a\b[^>]*>([\s\S]*?)<\/a>/;
const CENSUS_TIME = /<td>\s*(\d{1,2}):(\d{2}) (AM|PM)\s*<\/td>/;

/** The Census Bureau's economic indicator calendar page: each dated row's title and time, which must agree with the row's key. */
const censusFeed: CalendarFeed = Object.freeze({
  request: Object.freeze({ accept: 'text/html' as const }),
  urls: () => Object.freeze(['https://www.census.gov/economic-indicators/calendar-listview.html']),
  decode(texts: readonly string[]): DecodedCalendar | null {
    const start = texts.length === 1 ? texts[0].indexOf('id="calendar"') : -1;
    if (start < 0) return null;
    const end = texts[0].indexOf('</table>', start);
    if (end < 0) return null;
    const table = texts[0].slice(start, end);
    const events: { title: string; startsAt: string }[] = [];
    let leftOut = 0;
    for (const [row] of table.matchAll(CENSUS_ROW)) {
      const key = CENSUS_KEY.exec(row);
      if (key === null) continue;
      const link = CENSUS_LINK.exec(row);
      const title = link === null ? null : normaliseNewsText(link[1], NEWS_CALENDAR_TITLE_MAX);
      const cell = CENSUS_TIME.exec(row);
      // The visible date cell must name the key's day: a suspended release keeps its key but says "Suspended".
      const date = CENSUS_DATE.exec(normaliseNewsText(key[6], 40) ?? '');
      const sameDay = date !== null && MONTHS.indexOf(date[1]) + 1 === Number(key[2]) && Number(date[2]) === Number(key[3]) && date[3] === key[1];
      const agrees = sameDay && cell !== null && pad2((Number(cell[1]) % 12) + (cell[3] === 'PM' ? 12 : 0)) === key[4] && cell[2] === key[5];
      const startsAt = agrees ? newYork(`${key[1]}-${key[2]}-${key[3]}`, `${key[4]}:${key[5]}`) : null;
      if (title === null || startsAt === null) leftOut += 1;
      else events.push({ title, startsAt });
    }
    // A calendar table with no dated row has changed shape.
    return events.length === 0 && leftOut === 0 ? null : { events, leftOut, covers: null };
  },
});

const ECB_PAIR = /<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;

/** The ECB's meetings page: only a monetary policy meeting's Day 2 gets a time, 14:15 in Frankfurt, when the decision is published. */
const ecbFeed: CalendarFeed = Object.freeze({
  request: Object.freeze({ accept: 'text/html' as const }),
  urls: () => Object.freeze(['https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html']),
  decode(texts: readonly string[]): DecodedCalendar | null {
    const pairs = texts.length === 1 ? [...texts[0].matchAll(ECB_PAIR)] : [];
    if (pairs.length === 0) return null;
    const events: { title: string; startsAt: string }[] = [];
    let leftOut = 0;
    for (const [, day, month, year, text] of pairs) {
      const title = normaliseNewsText(text, NEWS_CALENDAR_TITLE_MAX);
      const decision = title !== null && title.includes('monetary policy meeting') && title.includes('(Day 2)') && !title.includes('non-monetary');
      const startsAt = decision ? frankfurt(`${year}-${month}-${day}`, '14:15') : null;
      if (title === null || startsAt === null) leftOut += 1;
      else events.push({ title, startsAt });
    }
    return { events, leftOut, covers: null };
  },
});

const RBA_YEAR = /Board meeting schedules (\d{4})/;
const RBA_ROW = /<th scope="row">[^<]*<\/th>\s*<td>([\s\S]*?)<\/td>/g;
const RBA_DAYS = /^(\d{1,2})(?: ([A-Z][a-z]+))? ?[–-] ?(\d{1,2}) ([A-Z][a-z]+)$/;

/** The RBA's board meeting schedule: each Monetary Policy Board meeting, announced at 14:30 in Sydney on its second day. */
const rbaFeed: CalendarFeed = Object.freeze({
  request: Object.freeze({ accept: 'text/html' as const }),
  urls: () => Object.freeze(['https://www.rba.gov.au/schedules-events/board-meeting-schedules.html']),
  decode(texts: readonly string[]): DecodedCalendar | null {
    const parts = texts.length === 1 ? texts[0].split('<table').flatMap((part) => {
      const year = RBA_YEAR.exec(part);
      return year === null ? [] : [{ year: year[1], part }];
    }) : [];
    if (parts.length === 0) return null;
    const events: { title: string; startsAt: string }[] = [];
    let leftOut = 0;
    let rows = 0;
    for (const { year, part } of parts) {
      for (const [, cell] of part.matchAll(RBA_ROW)) {
        rows += 1;
        const text = normaliseNewsText(cell, NEWS_CALENDAR_TITLE_MAX);
        // An empty cell is no meeting.
        if (text === null && cell.replace(/<[^>]*>|&nbsp;|\s/g, '') === '') continue;
        const days = text === null ? null : RBA_DAYS.exec(text);
        const month = days === null ? -1 : MONTHS.indexOf(days[4]);
        // A meeting from December into January would put its second day in the wrong year: left out.
        const firstMonthKnown = days !== null && (days[2] === undefined || (MONTHS.includes(days[2]) && MONTHS.indexOf(days[2]) <= month));
        const startsAt = firstMonthKnown && month >= 0 ? sydney(`${year}-${pad2(month + 1)}-${pad2(Number(days[3]))}`, '14:30') : null;
        if (startsAt === null) leftOut += 1;
        else events.push({ title: 'Monetary Policy Board', startsAt });
      }
    }
    // A schedule with no meeting rows at all has changed shape.
    return rows === 0 ? null : { events, leftOut, covers: null };
  },
});

export const NEWS_CALENDAR_FEEDS: Readonly<Record<NewsCalendarSource, CalendarFeed>> = Object.freeze({
  fed: fedFeed,
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
  census: censusFeed,
  ecb: ecbFeed,
  ons: onsFeed,
  boc: icsFeed('https://www.bankofcanada.ca/content_type/upcoming-events/?feed=ical', { accept: 'text/calendar' }, utcStart),
  rba: rbaFeed,
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
