import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { buildHeadlinesAnswer, NEWS_HEADLINE_FEEDS, NEWS_HEADLINE_SOURCES } from '../src/news/headlineFeeds';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const rss = (...items: string[]) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><link>https://evil.example/</link>${items.map((item) => `<item>${item}</item>`).join('')}</channel></rss>`;
const item = (title: string, link: string, date: string) => `<title>${title}</title><link>${link}</link><pubDate>${date}</pubDate>`;

const FED = rss('<title>Federal Reserve Board announces approval of application by Peoples Bancorp Inc. </title><link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/orders20260925a.htm]]></link><pubDate><![CDATA[Fri, 25 Sep 2026 20:30:00 GMT]]></pubDate>');
const ECB = rss(item('Monetary policy statement', 'https://www.ecb.europa.eu//press/pr/date/2026/html/x.en.html', 'Thu, 24 Sep 2026 14:00:00 +0200'));
const BOC = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Press releases</title></channel>'
  + '<item rdf:about="https://www.bankofcanada.ca/2026/09/rate-announcement/"><title>Bank of Canada lowers policy rate</title><link>https://www.bankofcanada.ca/2026/09/rate-announcement/</link><dc:date>2026-09-10T11:00:09+00:00</dc:date></item></rdf:RDF>';
const BEA = rss(`${item('Personal Income and Outlays, August 2026', 'https://www.bea.gov/news/2026/personal-income-and-outlays-august-2026', 'Thu, 24 Sep 2026 08:30:00 EDT')}<linkHistoric>https://evil.example/old</linkHistoric>`);
const YAHOO = rss(`${item('Stocks rise as rates fall', 'https://finance.yahoo.com/news/stocks-rise-123.html', 'Fri, 25 Sep 2026 18:00:00 +0000')}<source url="https://www.insidermonkey.com/">Insider Monkey</source>`);

describe('the headline decoders', () => {
  it('fed: a trimmed title from its whole element, a CDATA link and date as a UTC instant, no publisher', () => {
    expect(buildHeadlinesAnswer('fed', [FED], NOW)).toEqual({
      source: 'fed',
      fetchedAt: '2026-09-26T02:00:00.000Z',
      items: [{ title: 'Federal Reserve Board announces approval of application by Peoples Bancorp Inc.', url: 'https://www.federalreserve.gov/newsevents/pressreleases/orders20260925a.htm', publishedAt: '2026-09-25T20:30:00.000Z', publisher: null }],
      leftOut: 0,
    });
  });

  it('ecb: a doubled leading slash is made single, and a +0200 date is read', () => {
    expect(buildHeadlinesAnswer('ecb', [ECB], NOW)!.items).toEqual([{ title: 'Monetary policy statement', url: 'https://www.ecb.europa.eu/press/pr/date/2026/html/x.en.html', publishedAt: '2026-09-24T12:00:00.000Z', publisher: null }]);
  });

  it('boc reads an RDF feed with dc:date; bea reads EDT and never takes linkHistoric for link', () => {
    expect(buildHeadlinesAnswer('boc', [BOC], NOW)!.items.map((headline) => headline.publishedAt)).toEqual(['2026-09-10T11:00:09.000Z']);
    const bea = buildHeadlinesAnswer('bea', [BEA], NOW)!;
    expect(bea.items).toEqual([{ title: 'Personal Income and Outlays, August 2026', url: 'https://www.bea.gov/news/2026/personal-income-and-outlays-august-2026', publishedAt: '2026-09-24T12:30:00.000Z', publisher: null }]);
    const historicFirst = rss('<title>Old link first</title><linkHistoric>https://evil.example/old</linkHistoric><link>https://www.bea.gov/news/x</link><pubDate>Thu, 24 Sep 2026 08:30:00 EDT</pubDate>');
    expect(buildHeadlinesAnswer('bea', [historicFirst], NOW)!.items.map((headline) => headline.url)).toEqual(['https://www.bea.gov/news/x']);
  });

  it('yahoo: the source element is the publisher', () => {
    expect(buildHeadlinesAnswer('yahoo', [YAHOO], NOW)!.items).toEqual([{ title: 'Stocks rise as rates fall', url: 'https://finance.yahoo.com/news/stocks-rise-123.html', publishedAt: '2026-09-25T18:00:00.000Z', publisher: 'Insider Monkey' }]);
  });

  it('counts items with a foreign, http or script link, an unreadable date or a markup-only title; drops old ones uncounted', () => {
    const good = item('Kept', 'https://finance.yahoo.com/news/kept.html', 'Fri, 25 Sep 2026 18:00:00 GMT');
    const feed = rss(
      good,
      item('Foreign', 'https://evil.example/x', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('Plain http', 'http://finance.yahoo.com/news/a.html', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('Script', 'javascript:alert(1)', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('No date', 'https://finance.yahoo.com/news/b.html', 'yesterday'),
      item('<img src=x onerror=alert(1)>', 'https://finance.yahoo.com/news/c.html', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('Too old', 'https://finance.yahoo.com/news/d.html', 'Wed, 26 Aug 2026 01:00:00 GMT'),
      item('Too far ahead', 'https://finance.yahoo.com/news/e.html', 'Sun, 27 Sep 2026 03:00:00 GMT'),
    );
    const data = buildHeadlinesAnswer('yahoo', [feed], NOW)!;
    expect(data.items.map((headline) => headline.title)).toEqual(['Kept']);
    expect(data.leftOut).toBe(5);
  });

  it('counts a link with a port, a link with credentials and a date with trailing text', () => {
    const feed = rss(
      item('Kept', 'https://finance.yahoo.com/news/kept.html', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('Port', 'https://finance.yahoo.com:8443/news/a.html', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('Credentials', 'https://u:p@finance.yahoo.com/x', 'Fri, 25 Sep 2026 18:00:00 GMT'),
      item('Trailing', 'https://finance.yahoo.com/news/b.html', 'Fri, 25 Sep 2026 18:00:00 GMT and more'),
    );
    const data = buildHeadlinesAnswer('yahoo', [feed], NOW)!;
    expect(data.items.map((headline) => headline.title)).toEqual(['Kept']);
    expect(data.leftOut).toBe(3);
  });

  it('keeps one per link, newest first, at most 20; refuses a body that is not a feed', () => {
    const at = (index: number) => new Date(NOW - (index + 1) * 3_600_000).toUTCString();
    const many = Array.from({ length: 25 }, (_, index) => item(`Headline ${index}`, `https://finance.yahoo.com/news/${index}.html`, at(index)));
    const data = buildHeadlinesAnswer('yahoo', [rss(...many.reverse(), item('Headline 0 again', 'https://finance.yahoo.com/news/0.html', at(3)))], NOW)!;
    expect(data.items.map((headline) => headline.title)).toEqual(Array.from({ length: 20 }, (_, index) => `Headline ${index}`));
    expect(data.leftOut).toBe(0);
    expect(buildHeadlinesAnswer('yahoo', ['<!doctype html><html><body>Service unavailable</body></html>'], NOW)).toBeNull();
  });
});

describe('the news headline routes', () => {
  const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
  const baseEnv = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() });
  const answer = (body: string, type: string, status = 200) => vi.fn<typeof fetch>(async () => new Response(body, { status, headers: { 'content-type': type } }));
  async function call(path: string, env: KairosApiEnv, fetchImpl: typeof fetch) {
    const ctx = createExecutionContext();
    const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env, ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
    await waitOnExecutionContext(ctx);
    return response;
  }

  beforeEach(() => clearMemoryCache());

  it('answers yahoo in the one shape, kept 10 minutes at the edge and never in KV', async () => {
    const fetchImpl = answer(YAHOO, 'application/xml; charset=utf-8');
    const response = await call('/news/headlines/yahoo', { ...baseEnv(), KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE }, fetchImpl);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apiVersion: 1, ok: true, data: JSON.parse(JSON.stringify(buildHeadlinesAnswer('yahoo', [YAHOO], NOW))) });
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
    expect(response.headers.get('x-kairos-cache')).toBe('miss');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://finance.yahoo.com/news/rssindex');
    expect(await workerEnv.KAIROS_API_CACHE!.get('news-headlines-yahoo:v1:', 'text')).toBeNull();
  });

  it('refuses an unknown feed, and answers source-unavailable when the feed refuses', async () => {
    const fetchImpl = answer(YAHOO, 'application/xml');
    expect((await call('/news/headlines/cnbc', baseEnv(), fetchImpl)).status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
    const refused = await call('/news/headlines/fed', baseEnv(), answer('Forbidden', 'text/plain', 403));
    expect(refused.status).toBe(502);
    expect(await refused.json()).toMatchObject({ reason: 'source-unavailable' });
  });

  it('asks BEA for text/xml and reads its text/xml answer', async () => {
    const fetchImpl = answer(BEA, 'text/xml; charset=utf-8');
    expect((await call('/news/headlines/bea', baseEnv(), fetchImpl)).status).toBe(200);
    expect((fetchImpl.mock.calls[0][1]!.headers as Record<string, string>).accept).toBe('text/xml');
  });

  it('lists each feed as a public, limited route with no query, the headline cache and its feed host', () => {
    for (const id of NEWS_HEADLINE_SOURCES) {
      const route = KAIROS_API_ROUTES.find((candidate) => candidate.id === `news-headlines-${id}`);
      expect(route, id).toMatchObject({ path: `/news/headlines/${id}`, access: 'public', rateLimited: true });
      expect(Object.keys(route!.query), id).toEqual([]);
      expect(route!.cache, id).toEqual({ version: 1, edgeSeconds: 600, memorySeconds: 600, kvSeconds: null });
      expect(route!.upstreamHosts, id).toContain(new URL(NEWS_HEADLINE_FEEDS[id].url).hostname);
    }
  });
});
