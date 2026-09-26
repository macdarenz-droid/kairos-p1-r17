/**
 * P34: the latest headlines the Kairos server reads, one route per feed whose terms allow a title and a link: the press
 * releases of the Fed, the ECB, the Bank of Canada, the BEA and the RBA, and Yahoo Finance. Titles and links only; no
 * article text, no images. Every link must be https on a host listed for its feed.
 */
import type { RouteAnswer, RouteContext } from '../router';
import type { UpstreamRequest } from '../upstream';
import { normaliseNewsText, readRssItems } from './newsParsing';

export const NEWS_HEADLINES_MAX = 20;
export const NEWS_HEADLINE_MAX_AGE_DAYS = 30;
export const NEWS_HEADLINE_SOURCES = Object.freeze(['fed', 'ecb', 'boc', 'bea', 'rba', 'yahoo'] as const);
export type NewsHeadlineSource = (typeof NEWS_HEADLINE_SOURCES)[number];

const DAY_MS = 86_400_000;

type HeadlineFeed = Readonly<{ url: string; request: UpstreamRequest; linkHosts: readonly string[] }>;
const feed = (url: string, accept: UpstreamRequest['accept'], linkHosts: readonly string[]): HeadlineFeed => Object.freeze({ url, request: Object.freeze({ accept }), linkHosts: Object.freeze(linkHosts) });

export const NEWS_HEADLINE_FEEDS: Readonly<Record<NewsHeadlineSource, HeadlineFeed>> = Object.freeze({
  fed: feed('https://www.federalreserve.gov/feeds/press_all.xml', 'application/rss+xml', ['www.federalreserve.gov']),
  ecb: feed('https://www.ecb.europa.eu/rss/press.html', 'application/rss+xml', ['www.ecb.europa.eu']),
  boc: feed('https://www.bankofcanada.ca/content_type/press-releases/feed/', 'application/rss+xml', ['www.bankofcanada.ca']),
  // BEA answers 406 to application/rss+xml and application/xml, and sends text/xml to text/xml.
  bea: feed('https://apps.bea.gov/rss/rss.xml', 'text/xml', ['www.bea.gov', 'bea.gov', 'apps.bea.gov']),
  rba: feed('https://www.rba.gov.au/rss/rss-cb-media-releases.xml', 'application/rss+xml', ['www.rba.gov.au']),
  yahoo: feed('https://finance.yahoo.com/news/rssindex', 'application/rss+xml', ['finance.yahoo.com']),
});

const RFC_822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}(:\d{2})? (GMT|UT|UTC|EST|EDT|CST|CDT|MST|MDT|PST|PDT|[+-]\d{4})$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface NewsHeadline {
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly publisher: string | null;
}

export interface NewsHeadlinesData {
  readonly source: NewsHeadlineSource;
  readonly fetchedAt: string;
  readonly items: readonly NewsHeadline[];
  readonly leftOut: number;
}

/** An https link on one of the feed's hosts, with a doubled leading slash made single; null otherwise. */
function headlineUrl(raw: string | null, linkHosts: readonly string[]): string | null {
  const text = normaliseNewsText(raw, 2000);
  if (text === null) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || !linkHosts.includes(url.hostname)) return null;
  url.pathname = url.pathname.replace(/^\/{2,}/, '/');
  return url.href;
}

/** A feed's date (RFC 822 or ISO 8601 with a zone) as a UTC instant; null otherwise. */
function headlineDate(raw: string | null): string | null {
  const text = normaliseNewsText(raw, 64);
  if (text === null || !(RFC_822.test(text) || ISO_8601.test(text))) return null;
  const at = Date.parse(text);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** The route's data from the feed's body: headlines of the last 30 days, one per link, newest first, at most 20; null when the body is not a feed. */
export function buildHeadlinesAnswer(source: NewsHeadlineSource, texts: readonly string[], nowMs: number): NewsHeadlinesData | null {
  const items = readRssItems(texts[0] ?? '');
  if (items === null) return null;
  const { linkHosts } = NEWS_HEADLINE_FEEDS[source];
  const earliest = nowMs - NEWS_HEADLINE_MAX_AGE_DAYS * DAY_MS;
  const latest = nowMs + DAY_MS;
  const kept: NewsHeadline[] = [];
  let leftOut = 0;
  for (const item of items) {
    const title = normaliseNewsText(item.title, 300);
    const url = headlineUrl(item.link, linkHosts);
    const publishedAt = headlineDate(item.date);
    if (title === null || url === null || publishedAt === null) { leftOut += 1; continue; }
    const at = Date.parse(publishedAt);
    if (at < earliest || at > latest) continue;
    kept.push({ title, url, publishedAt, publisher: normaliseNewsText(item.publisher, 80) });
  }
  kept.sort((a, b) => (a.publishedAt > b.publishedAt ? -1 : a.publishedAt < b.publishedAt ? 1 : a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  const seen = new Set<string>();
  const unique = kept.filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)));
  return { source, fetchedAt: new Date(nowMs).toISOString(), items: unique.slice(0, NEWS_HEADLINES_MAX), leftOut };
}

/** One headline feed, read now from its source; any failed read or unreadable body is 'source-unavailable'. */
export async function answerNewsHeadlines(source: NewsHeadlineSource, context: RouteContext): Promise<RouteAnswer> {
  const nowMs = context.now.getTime();
  const feed = NEWS_HEADLINE_FEEDS[source];
  const result = await context.upstream(feed.url, feed.request);
  if (!result.ok) return { ok: false, reason: 'source-unavailable' };
  const data = buildHeadlinesAnswer(source, [result.text], nowMs);
  return data === null ? { ok: false, reason: 'source-unavailable' } : { ok: true, data };
}
