import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { decodeBinanceKlines } from '../src/market/binance';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const HOUR = 3_600_000;
const START = 1_704_067_200_000; // 2024-01-01T00:00:00Z

/** A 1-hour kline row shaped like the checked sample. */
function row(openMs: number, prices: Partial<Record<'open' | 'high' | 'low' | 'close' | 'volume', string>> = {}, length = HOUR): unknown[] {
  const { open = '83918.01000000', high = '83926.10000000', low = '83918.00000000', close = '83926.10000000', volume = '4.75359000' } = prices;
  return [openMs, open, high, low, close, volume, openMs + length - 1, '398927.32549680', 1194, '4.62833000', '388415.55693950', '0'];
}

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() });
const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));
async function call(path: string, fetchImpl: typeof fetch) {
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env(), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}

interface CandlesData {
  source: { provider: string; market: string; symbol: string };
  backup: string | null;
  interval: string;
  fetchedAt: string;
  candles: Record<string, string>[];
  next: number | null;
}
const dataOf = async (response: Response) => ((await response.json()) as { data: CandlesData }).data;

const SETTLED = `/market/candles?market=binance-spot&symbol=BTCUSDT&interval=1h&limit=3&start=${START}&end=${START + 2 * HOUR - 1}`;

describe('the /market/candles route', () => {
  beforeEach(() => clearMemoryCache());

  it('asks Binance Spot for the window and answers candles with volume, kept 7 days once the window has closed', async () => {
    const fetchImpl = answer([row(START), row(START + HOUR, { volume: '0.00000000' })]);
    const response = await call(SETTLED, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=3&startTime=${START}&endTime=${START + 2 * HOUR - 1}&timeZone=0`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=604800');
    const data = await dataOf(response);
    expect(data.source).toEqual({ provider: 'binance', market: 'spot', symbol: 'BTCUSDT' });
    expect(data.backup).toBeNull();
    expect(data.interval).toBe('1h');
    expect(data.fetchedAt).toBe('2026-09-26T02:00:00.000Z');
    expect(data.next).toBeNull();
    expect(data.candles).toEqual([
      { openTime: '2024-01-01T00:00:00.000Z', closeTime: '2024-01-01T00:59:59.999Z', open: '83918.01000000', high: '83926.10000000', low: '83918.00000000', close: '83926.10000000', volume: '4.75359000' },
      { openTime: '2024-01-01T01:00:00.000Z', closeTime: '2024-01-01T01:59:59.999Z', open: '83918.01000000', high: '83926.10000000', low: '83918.00000000', close: '83926.10000000', volume: '0.00000000' },
    ]);

    const again = await call(SETTLED, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(again.headers.get('x-kairos-cache')).toBe('memory');
    expect(again.headers.get('cache-control')).toBe('public, max-age=604800');
  });

  it('keeps a window that may still move for 10 seconds: no end, or an end less than one candle ago', async () => {
    const open = await call(`/market/candles?market=binance-spot&symbol=BTCUSDT&interval=1h&limit=3&start=${START}`, answer([row(START)]));
    expect(open.status).toBe(200);
    expect(open.headers.get('cache-control')).toBe('public, max-age=10');

    const recentStart = NOW - 3 * HOUR;
    const recent = await call(
      `/market/candles?market=binance-spot&symbol=BTCUSDT&interval=1h&limit=3&start=${recentStart}&end=${NOW - HOUR / 2}`,
      answer([row(recentStart), row(recentStart + HOUR), row(recentStart + 2 * HOUR)]),
    );
    expect(recent.status).toBe(200);
    expect(recent.headers.get('cache-control')).toBe('public, max-age=10');
  });

  it('asks Binance USDⓈ-M futures on fapi.binance.com, with no time zone, and names the futures market', async () => {
    const fetchImpl = answer([row(START)]);
    const response = await call(SETTLED.replace('binance-spot', 'binance-usdm'), fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=3&startTime=${START}&endTime=${START + 2 * HOUR - 1}`);
    expect(response.status).toBe(200);
    expect((await dataOf(response)).source).toEqual({ provider: 'binance', market: 'usdm-futures', symbol: 'BTCUSDT' });
  });

  it('sends a CJK symbol percent-encoded', async () => {
    const fetchImpl = answer([]);
    const response = await call(`/market/candles?market=binance-spot&symbol=${encodeURIComponent('币安人生USDT')}&interval=1h&limit=3`, fetchImpl);
    expect(response.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('symbol=%E5%B8%81%E5%AE%89%E4%BA%BA%E7%94%9FUSDT');
    expect((await dataOf(response)).source.symbol).toBe('币安人生USDT');
  });

  it('refuses a limit over 1,000 or of 0, a start after the end, 1-second futures candles and a base or quote that does not spell the symbol', async () => {
    const base = '/market/candles?symbol=BTCUSDT&interval=1h';
    for (const query of [
      `${base}&market=binance-spot&limit=1001`,
      `${base}&market=binance-spot&limit=0`,
      `${base}&market=binance-spot&limit=3&start=${START + HOUR}&end=${START}`,
      '/market/candles?market=binance-usdm&symbol=BTCUSDT&interval=1s&limit=3',
      `${base}&market=binance-spot&limit=3&base=BTC`,
      `${base}&market=binance-spot&limit=3&base=BTC&quote=USDC`,
    ]) {
      const fetchImpl = answer([]);
      expect((await call(query, fetchImpl)).status, query).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    const spelled = answer([]);
    expect((await call(`${base}&market=binance-spot&limit=3&base=BTC&quote=USDT`, spelled)).status).toBe(200);
  });

  it('gives the next page start when the page is full and the window goes on', async () => {
    const response = await call(
      `/market/candles?market=binance-spot&symbol=BTCUSDT&interval=1h&limit=3&start=${START}&end=${START + 10 * HOUR}`,
      answer([row(START), row(START + HOUR), row(START + 2 * HOUR)]),
    );
    expect((await dataOf(response)).next).toBe(START + 2 * HOUR + 1);
  });

  it('answers 502 for rows it cannot trust, and the source reasons for unknown, refused and busy', async () => {
    const shortRow = row(START).slice(0, 11);
    const numberPrice = [START, 83918.01, ...row(START).slice(2)];
    const bodies: [string, unknown][] = [
      ['11 items', [shortRow]],
      ['a price as a number', [numberPrice]],
      ['high below open', [row(START, { high: '83918.00000000', low: '83900.00000000' })]],
      ['a close time not of 1h', [row(START, {}, 60_000)]],
      ['a row outside the window', [row(START + 2 * HOUR)]],
      ['open times out of order', [row(START + HOUR), row(START)]],
      ['more rows than the limit', [row(START), row(START + HOUR), row(START + 2 * HOUR), row(START + 3 * HOUR)]],
    ];
    for (const [label, body] of bodies) {
      clearMemoryCache();
      const response = await call(SETTLED, answer(body));
      expect(response.status, label).toBe(502);
      expect(await response.json(), label).toMatchObject({ ok: false, reason: 'source-unavailable' });
    }

    const cases: [ReturnType<typeof answer>, number, string, number | null][] = [
      [answer('{"code":-1121,"msg":"Invalid symbol."}', 400), 404, 'unknown-market', null],
      [answer('', 451), 451, 'source-refused', null],
      [answer('', 429, { 'retry-after': '12' }), 503, 'source-busy', 12],
    ];
    for (const [fetchImpl, status, reason, retryAfter] of cases) {
      clearMemoryCache();
      const response = await call(SETTLED, fetchImpl);
      expect(response.status, reason).toBe(status);
      expect(await response.json(), reason).toMatchObject({ ok: false, reason, retryAfter });
    }
  });
});

describe('decodeBinanceKlines', () => {
  it('decodes a full page of 1,000 rows in order', () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => row(START + index * HOUR));
    const candles = decodeBinanceKlines(JSON.stringify(rows), { interval: '1h', limit: 1_000, startMs: START, endMs: null });
    expect(candles).toHaveLength(1_000);
    expect(candles?.[0].openTime).toBe('2024-01-01T00:00:00.000Z');
    expect(candles?.[999].openTime).toBe(new Date(START + 999 * HOUR).toISOString());
    expect(candles?.every((candle, index) => index === 0 || candle.openTime > candles[index - 1].openTime)).toBe(true);
  });
});
