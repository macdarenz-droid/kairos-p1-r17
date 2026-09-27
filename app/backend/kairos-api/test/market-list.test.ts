import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { decodeBinanceExchangeInfo } from '../src/market/binance';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const EXCHANGE_INFO_URL = 'https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false';

const filters = (tickSize: string, stepSize: string | null) => [
  { filterType: 'PRICE_FILTER', minPrice: '0.00001000', maxPrice: '922327.00000000', tickSize },
  ...(stepSize === null ? [] : [{ filterType: 'LOT_SIZE', minQty: '0.00010000', maxQty: '100000.00000000', stepSize }]),
  { filterType: 'ICEBERG_PARTS', limit: 10 },
  { filterType: 'MARKET_LOT_SIZE', minQty: '0.00000000', maxQty: '1843.11355729', stepSize: '0.00000000' },
  { filterType: 'TRAILING_DELTA', minTrailingAboveDelta: 10, maxTrailingAboveDelta: 2000, minTrailingBelowDelta: 10, maxTrailingBelowDelta: 2000 },
  { filterType: 'PERCENT_PRICE_BY_SIDE', bidMultiplierUp: '5', bidMultiplierDown: '0.2', askMultiplierUp: '5', askMultiplierDown: '0.2', avgPriceMins: 5 },
  { filterType: 'NOTIONAL', minNotional: '0.00010000', applyMinToMarket: true, maxNotional: '9000000.00000000', applyMaxToMarket: false, avgPriceMins: 5 },
  { filterType: 'MAX_NUM_ORDERS', maxNumOrders: 200 },
  { filterType: 'MAX_NUM_ORDER_LISTS', maxNumOrderLists: 20 },
  { filterType: 'MAX_NUM_ALGO_ORDERS', maxNumAlgoOrders: 5 },
  { filterType: 'MAX_NUM_ICEBERG_ORDERS', maxNumIcebergOrders: 5 },
];
const symbol = (name: string, base: string, quote: string, extra: Record<string, unknown> = {}) =>
  ({ symbol: name, status: 'TRADING', baseAsset: base, baseAssetPrecision: 8, quoteAsset: quote, quotePrecision: 8, orderTypes: ['LIMIT'], filters: filters('0.01000000', '0.00001000'), ...extra });
const EXCHANGE_INFO = JSON.stringify({
  timezone: 'UTC',
  serverTime: 1790465614012,
  rateLimits: [],
  exchangeFilters: [],
  symbols: [
    symbol('ETHBTC', 'ETH', 'BTC', { filters: filters('0.00001000', '0.00010000') }),
    symbol('币安人生USDT', '币安人生', 'USDT'),
    symbol('BTCUSDT', 'BTC', 'USDT'),
    symbol('NOLOTUSDT', 'NOLOT', 'USDT', { filters: filters('0.01000000', null) }),
    symbol('HALTUSDT', 'HALT', 'USDT', { status: 'BREAK' }),
    symbol('ODDUSDT', 'ODD', 'USDC'),
    symbol('BTCUSDT', 'BTC', 'USDT'),
  ],
});

describe('the market list decoder', () => {
  it('keeps the markets open for trading, ascending, with their text exactly as sent, and counts the rest', () => {
    expect(decodeBinanceExchangeInfo(EXCHANGE_INFO)).toEqual({
      markets: [
        { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tickSize: '0.01000000', stepSize: '0.00001000' },
        { symbol: 'ETHBTC', base: 'ETH', quote: 'BTC', tickSize: '0.00001000', stepSize: '0.00010000' },
        { symbol: '币安人生USDT', base: '币安人生', quote: 'USDT', tickSize: '0.01000000', stepSize: '0.00001000' },
      ],
      leftOut: 4,
    });
  });

  it('reads nothing from a body that is not a list of symbols, or lists more than 5,000', () => {
    const many = JSON.stringify({ symbols: Array.from({ length: 5_001 }, () => ({})) });
    for (const body of ['[]', '{}', '{"symbols":{}}', 'not json', many]) expect(decodeBinanceExchangeInfo(body), body.slice(0, 20)).toBeNull();
  });
});

describe('the /market/symbols route', () => {
  const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
  const baseEnv = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter(), KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE });
  const answer = (body: string, status = 200, headers: Record<string, string> = {}) =>
    vi.fn<typeof fetch>(async () => new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } }));
  async function call(path: string, fetchImpl: typeof fetch) {
    const ctx = createExecutionContext();
    const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), baseEnv(), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
    await waitOnExecutionContext(ctx);
    return response;
  }

  // The KV copy lives through the file's tests; each starts without one.
  beforeEach(async () => { clearMemoryCache(); await (workerEnv.KAIROS_API_CACHE as unknown as { delete(key: string): Promise<void> }).delete('market-symbols:v1:'); });

  it('answers the compact list, kept an hour at the edge and in memory, and 6 hours in KV', async () => {
    const fetchImpl = answer(EXCHANGE_INFO);
    const first = await call('/market/symbols', fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe(EXCHANGE_INFO_URL);
    expect(first.status).toBe(200);
    const body = await first.json() as { data: { source: string; fetchedAt: string; markets: unknown[]; leftOut: number } };
    expect(body.data).toMatchObject({ source: 'binance-spot', fetchedAt: '2026-09-26T02:00:00.000Z', leftOut: 4 });
    expect(body.data.markets).toHaveLength(3);
    expect(first.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(first.headers.get('x-kairos-cache')).toBe('miss');
    const again = await call('/market/symbols', fetchImpl);
    expect(again.headers.get('x-kairos-cache')).toBe('memory');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await workerEnv.KAIROS_API_CACHE!.get('market-symbols:v1:', 'text')).toContain('"BTCUSDT"');
  });

  it('reads a market list as large as the real one (2,483,061 bytes)', async () => {
    const padded = JSON.stringify({ ...JSON.parse(EXCHANGE_INFO), padding: 'x'.repeat(2_483_061) });
    const response = await call('/market/symbols', answer(padded));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { markets: unknown[] } }).data.markets).toHaveLength(3);
  });

  it('refuses any query', async () => {
    const fetchImpl = answer(EXCHANGE_INFO);
    expect((await call('/market/symbols?x=1', fetchImpl)).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says the source's real reason, and never keeps a failure", async () => {
    const cases: [typeof fetch, number, string, number | null][] = [
      [answer('{"code":0,"msg":"Service unavailable from a restricted location"}', 451), 451, 'source-refused', null],
      [answer('{"code":0,"msg":"Forbidden"}', 403), 451, 'source-refused', null],
      [answer('', 429, { 'retry-after': '30' }), 503, 'source-busy', 30],
      [answer('', 429, { 'retry-after': '7200' }), 503, 'source-busy', 3600],
      [answer('', 418), 503, 'source-busy', 60],
      [answer('', 500), 502, 'source-unavailable', 30],
      [answer('{"symbols":[]}'), 502, 'source-unavailable', 30],
    ];
    for (const [fetchImpl, status, reason, retryAfter] of cases) {
      clearMemoryCache();
      const response = await call('/market/symbols', fetchImpl);
      expect(response.status, reason).toBe(status);
      expect(await response.json(), reason).toMatchObject({ ok: false, reason, retryAfter });
      await call('/market/symbols', fetchImpl);
      expect(fetchImpl, reason).toHaveBeenCalledTimes(2);
    }
  });
});
