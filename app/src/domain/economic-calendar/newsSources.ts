/**
 * P34: the online news sources Kairos reads through its server; the news routes of backend/kairos-api use the same ids.
 */
export const NEWS_CALENDAR_SOURCE_IDS = Object.freeze(['fed', 'bls', 'bea', 'census', 'ecb', 'eurostat', 'ons', 'boc', 'rba'] as const);
export const NEWS_HEADLINE_SOURCE_IDS = Object.freeze(['fed', 'ecb', 'boc', 'bea', 'rba', 'yahoo'] as const);
export type NewsCalendarSourceId = (typeof NEWS_CALENDAR_SOURCE_IDS)[number];
export type NewsHeadlineSourceId = (typeof NEWS_HEADLINE_SOURCE_IDS)[number];
export type NewsSourceId = NewsCalendarSourceId | NewsHeadlineSourceId;

export interface NewsSource {
  readonly name: string;
  /** The source's own page, linked from the calendar. */
  readonly page: string;
  /** The currency its news is about; null for a source about many markets. */
  readonly currency: string | null;
  /** The only hosts a headline link from this source may point to. */
  readonly linkHosts: readonly string[];
}

const source = (name: string, page: string, currency: string | null, linkHosts: readonly string[]): NewsSource =>
  Object.freeze({ name, page, currency, linkHosts: Object.freeze([...linkHosts]) });

export const NEWS_SOURCES: Readonly<Record<NewsSourceId, NewsSource>> = Object.freeze({
  fed: source('Federal Reserve Board', 'https://www.federalreserve.gov/newsevents/calendar.htm', 'USD', ['www.federalreserve.gov']),
  bls: source('U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/', 'USD', []),
  bea: source('U.S. Bureau of Economic Analysis', 'https://www.bea.gov/news/schedule', 'USD', ['www.bea.gov', 'bea.gov', 'apps.bea.gov']),
  census: source('U.S. Census Bureau', 'https://www.census.gov/economic-indicators/calendar-listview.html', 'USD', []),
  ecb: source('European Central Bank', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', 'EUR', ['www.ecb.europa.eu']),
  eurostat: source('Eurostat', 'https://ec.europa.eu/eurostat/news/euro-indicators/release-calendar', 'EUR', []),
  ons: source('Office for National Statistics (UK)', 'https://www.ons.gov.uk/releasecalendar', 'GBP', []),
  boc: source('Bank of Canada', 'https://www.bankofcanada.ca/press/upcoming-events/', 'CAD', ['www.bankofcanada.ca']),
  rba: source('Reserve Bank of Australia', 'https://www.rba.gov.au/schedules-events/board-meeting-schedules.html', 'AUD', ['www.rba.gov.au']),
  yahoo: source('Yahoo Finance', 'https://finance.yahoo.com/', null, ['finance.yahoo.com']),
});

export function isNewsCalendarSourceId(value: unknown): value is NewsCalendarSourceId {
  return (NEWS_CALENDAR_SOURCE_IDS as readonly unknown[]).includes(value);
}
export function isNewsHeadlineSourceId(value: unknown): value is NewsHeadlineSourceId {
  return (NEWS_HEADLINE_SOURCE_IDS as readonly unknown[]).includes(value);
}

/** A headline link Kairos may open: https, no user name or password, and a host listed for that source. */
export function isAllowedNewsLink(sourceId: NewsHeadlineSourceId, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.username === '' &&
    parsed.password === '' &&
    NEWS_SOURCES[sourceId].linkHosts.includes(parsed.hostname)
  );
}
