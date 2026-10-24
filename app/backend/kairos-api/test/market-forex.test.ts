import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-10-24T08:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const HOUR = 3_600_000;
const START = Date.parse('2026-10-20T00:00:00Z'); // a Tuesday
const MONDAY = Date.parse('2026-10-19T00:00:00Z');
const START_S = START / 1_000;

/** One OANDA candle shaped like the answer checked on 2026-10-24. */
function candle(openMs: number, mid: Partial<Record<'o' | 'h' | 'l' | 'c', string>> = {}, complete = true): unknown {
  const { o = '1.16579', h = '1.16707', l = '1.16566', c = '1.16682' } = mid;
  return { complete, volume: 17095, time: new Date(openMs).toISOString().replace('.000Z', '.000000000Z'), mid: { o, h, l, c } };
}
const page = (candles: unknown[], granularity = 'H1', instrument = 'EUR_USD') => ({ instrument, granularity, candles });

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = (overrides: Partial<KairosApiEnv> = {}): KairosApiEnv => ({
  KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter(),
  KAIROS_FOREX_SOURCE: 'oanda-practice', MARKET_DATA_API_KEY: 'test-token', ...overrides,
});
const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));
async function call(path: string, fetchImpl: typeof fetch, overrides: Partial<KairosApiEnv> = {}) {
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env(overrides), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}
const urlOf = (fetchImpl: ReturnType<typeof answer>) => new URL(String(fetchImpl.mock.calls[0][0]));
const headerOf = (fetchImpl: ReturnType<typeof answer>, name: string) => new Headers(fetchImpl.mock.calls[0][1]?.headers).get(name);
const dataOf = async (response: Response) => ((await response.json()) as { data: { source: unknown; backup: unknown; interval: string; candles: Record<string, unknown>[]; next: number | null } }).data;

const ALIGNMENT = { price: 'M', dailyAlignment: '0', alignmentTimezone: 'UTC', weeklyAlignment: 'Monday' };

describe('T-055a forex and metal candles from OANDA', () => {
  beforeEach(() => clearMemoryCache());

  it('asks OANDA for mid prices from the start, one candle more, with UTC days, Monday weeks and the Bearer token', async () => {
    const fetchImpl = answer(page([candle(START), candle(START + HOUR), candle(START + 2 * HOUR)]));
    const response = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1h&limit=2&start=${START}&end=${START + 5 * HOUR}`, fetchImpl);
    const url = urlOf(fetchImpl);
    expect(`${url.origin}${url.pathname}`).toBe('https://api-fxpractice.oanda.com/v3/instruments/EUR_USD/candles');
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...ALIGNMENT, granularity: 'H1', from: String(START_S), count: '3' });
    expect(headerOf(fetchImpl, 'authorization')).toBe('Bearer test-token');
    expect(response.status).toBe(200);
    const data = await dataOf(response);
    expect(data.source).toEqual({ provider: 'oanda', market: 'forex', symbol: 'EUR_USD' });
    expect(data.backup).toBeNull();
    // The limit holds; the page is full and the window goes on, so the next page starts after the last candle.
    expect(data.candles).toEqual([
      { openTime: '2026-10-20T00:00:00.000Z', closeTime: '2026-10-20T00:59:59.999Z', open: '1.16579', high: '1.16707', low: '1.16566', close: '1.16682', volume: null },
      { openTime: '2026-10-20T01:00:00.000Z', closeTime: '2026-10-20T01:59:59.999Z', open: '1.16579', high: '1.16707', low: '1.16566', close: '1.16682', volume: null },
    ]);
    expect(data.next).toBe(START + HOUR + 1);
  });

  it('reads back from one second after the end when there is no start, and asks the live host for a live account', async () => {
    const end = START + 3 * HOUR;
    const fetchImpl = answer(page([candle(START + 2 * HOUR), candle(end)]));
    await call(`/market/candles?market=oanda-forex&symbol=XAUUSD&interval=1h&limit=2&end=${end}`, fetchImpl, { KAIROS_FOREX_SOURCE: 'oanda-live' });
    const url = urlOf(fetchImpl);
    expect(`${url.origin}${url.pathname}`).toBe('https://api-fxtrade.oanda.com/v3/instruments/XAU_USD/candles');
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...ALIGNMENT, granularity: 'H1', to: String(end / 1_000 + 1), count: '2' });
    const newest = answer(page([candle(START)], 'D'));
    await call('/market/candles?market=oanda-forex&symbol=EURUSD&interval=1d&limit=5', newest);
    expect(Object.fromEntries(urlOf(newest).searchParams)).toEqual({ ...ALIGNMENT, granularity: 'D', count: '5' });
    expect([...urlOf(newest).searchParams.keys()]).not.toContain('from');
  });

  it('leaves out the candle that holds the start and any after the end, never sending from, to and count together', async () => {
    const start = START + 10 * 60_000; // 00:10: OANDA answers from the 00:00 candle
    const fetchImpl = answer(page([candle(START), candle(START + HOUR), candle(START + 2 * HOUR)]));
    const response = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1h&limit=5&start=${start}&end=${START + HOUR}`, fetchImpl);
    const params = urlOf(fetchImpl).searchParams;
    expect(params.has('to')).toBe(false);
    expect((await dataOf(response)).candles.map(entry => entry.openTime)).toEqual(['2026-10-20T01:00:00.000Z']);
  });

  it('keeps a page of closed candles 7 days, and a page with an open candle 10 seconds', async () => {
    const settled = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1h&limit=2&start=${START}&end=${START + HOUR}`, answer(page([candle(START), candle(START + HOUR)])));
    expect(settled.headers.get('cache-control')).toBe('public, max-age=604800');
    clearMemoryCache();
    // The candle that is still forming: a page that may still move.
    const open = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1h&limit=1&start=${NOW - HOUR}`, answer(page([candle(NOW - HOUR, {}, false)])));
    expect(open.headers.get('cache-control')).toBe('public, max-age=10');
  });

  it('a week starts on Monday, and a candle that does not open where its size opens is not trusted', async () => {
    const week = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1w&limit=1&start=${MONDAY}&end=${MONDAY}`, answer(page([candle(MONDAY)], 'W')));
    expect((await dataOf(week)).candles[0]).toMatchObject({ openTime: '2026-10-19T00:00:00.000Z', closeTime: '2026-10-25T23:59:59.999Z' });
    clearMemoryCache();
    const tuesday = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1w&limit=1&start=${MONDAY}&end=${START}`, answer(page([candle(START)], 'W')));
    expect(tuesday.status).toBe(502);
  });

  it('answers the source reasons: an unknown pair, a refused token, busy (its wait), down, and an answer it cannot trust', async () => {
    const ask = (symbol: string) => `/market/candles?market=oanda-forex&symbol=${symbol}&interval=1h&limit=1&start=${START}&end=${START}`;
    const cases: Array<[string, ReturnType<typeof answer>, number, string, number | null]> = [
      ['unknown', answer({ errorMessage: "Invalid value specified for 'instrument'" }, 400), 404, 'unknown-market', null],
      ['refused', answer({ errorMessage: 'Insufficient authorization to perform request.' }, 401), 451, 'source-refused', null],
      ['busy', answer({ errorMessage: 'Too many requests' }, 429, { 'retry-after': '7' }), 503, 'source-busy', 7],
      ['busy, no wait', answer({ errorMessage: 'Too many requests' }, 429), 503, 'source-busy', 60],
      ['down', answer('oops', 500, { 'content-type': 'text/plain' }), 502, 'source-unavailable', 30],
      ['wrong pair', answer(page([candle(START)], 'H1', 'GBP_USD')), 502, 'source-unavailable', 30],
      ['high below open', answer(page([candle(START, { h: '1.10000' })])), 502, 'source-unavailable', 30],
      ['not text', answer(page([{ complete: true, volume: 1, time: '2026-10-20T00:00:00.000000000Z', mid: { o: 1.1, h: 1.2, l: 1.0, c: 1.1 } }])), 502, 'source-unavailable', 30],
    ];
    for (const [label, fetchImpl, status, reason, retryAfter] of cases) {
      clearMemoryCache();
      const response = await call(ask(label === 'unknown' ? 'EURXYZ' : 'EURUSD'), fetchImpl);
      expect(response.status, label).toBe(status);
      expect(await response.json(), label).toMatchObject({ ok: false, reason, retryAfter });
    }
  });

  it('is not set up without the source or the token, and never asks OANDA then', async () => {
    for (const overrides of [{ KAIROS_FOREX_SOURCE: undefined }, { KAIROS_FOREX_SOURCE: 'oanda' }, { MARKET_DATA_API_KEY: undefined }, { MARKET_DATA_API_KEY: '' }]) {
      clearMemoryCache();
      const fetchImpl = answer(page([candle(START)]));
      const response = await call(`/market/candles?market=oanda-forex&symbol=EURUSD&interval=1h&limit=1`, fetchImpl, overrides);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, reason: 'not-set-up' });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('refuses what OANDA cannot answer: seven letters, a base and quote, 3-day, month and 1-second sizes', async () => {
    for (const query of [
      'symbol=EURUSDT&interval=1h&limit=1', 'symbol=EURUSD&interval=1h&limit=1&base=EUR&quote=USD',
      'symbol=EURUSD&interval=3d&limit=1', 'symbol=EURUSD&interval=1M&limit=1', 'symbol=EURUSD&interval=1s&limit=1',
      'symbol=EURUSD&interval=1h&limit=1001',
    ]) {
      clearMemoryCache();
      const fetchImpl = answer(page([]));
      const response = await call(`/market/candles?market=oanda-forex&${query}`, fetchImpl);
      expect(response.status, query).toBe(400);
      expect(fetchImpl, query).not.toHaveBeenCalled();
    }
  });
});
