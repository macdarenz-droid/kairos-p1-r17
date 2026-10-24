import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const BTC = { symbol: 'BTCUSDT', openPrice: '84099.00000000', highPrice: '84438.28000000', lowPrice: '83798.00000000', lastPrice: '84403.98000000', volume: '7882.09443000', quoteVolume: '662671049.37372070', openTime: 1790379214012, closeTime: 1790465614012, firstId: 1, lastId: 2, count: 3 };
const ETH = { ...BTC, symbol: 'ETHUSDT', openPrice: '4020.10000000', highPrice: '4100.00000000', lowPrice: '3990.00000000', lastPrice: '4050.55000000', volume: '0.00000000', quoteVolume: '0.00000000' };

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() });
const answer = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
async function call(path: string, fetchImpl: typeof fetch) {
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env(), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}

describe('the /market/tickers route', () => {
  beforeEach(() => clearMemoryCache());

  it('asks Binance for the MINI tickers and answers them in the requested order, prices as the same text, kept 5 seconds', async () => {
    const fetchImpl = answer([ETH, BTC]);
    const response = await call('/market/tickers?symbols=BTCUSDT,ETHUSDT', fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D&type=MINI');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=5');
    const { data } = await response.json() as { data: { source: string; fetchedAt: string; tickers: Record<string, string>[] } };
    expect(data.source).toBe('binance-spot');
    expect(data.fetchedAt).toBe('2026-09-26T02:00:00.000Z');
    expect(data.tickers.map((ticker) => ticker.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(data.tickers[0]).toEqual({
      symbol: 'BTCUSDT', lastPrice: '84403.98000000', openPrice: '84099.00000000', highPrice: '84438.28000000', lowPrice: '83798.00000000',
      volume: '7882.09443000', quoteVolume: '662671049.37372070', openTime: '2026-09-25T23:33:34.012Z', closeTime: '2026-09-26T23:33:34.012Z',
    });
  });

  it('refuses a list out of order, repeated, too long or in lower case, and takes 100 symbols of 12 characters', async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => `A${String(index).padStart(3, '0')}BBBBUSDT`);
    for (const list of ['ETHUSDT,BTCUSDT', 'BTCUSDT,BTCUSDT', [...hundred, 'ZZZUSDT'].join(','), 'btcusdt']) {
      const fetchImpl = answer([]);
      expect((await call(`/market/tickers?symbols=${list}`, fetchImpl)).status, list.slice(0, 20)).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    const fetchImpl = answer(hundred.map((symbol) => ({ ...BTC, symbol })));
    const response = await call(`/market/tickers?symbols=${hundred.join(',')}`, fetchImpl);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { tickers: unknown[] } }).data.tickers).toHaveLength(100);
  });

  it('answers 502 for an answer missing a symbol, holding another, or with a price as a number; 404 for an unknown market', async () => {
    for (const body of [[BTC], [BTC, ETH, { ...BTC, symbol: 'XRPUSDT' }], [BTC, { ...ETH, symbol: 'XRPUSDT' }], [{ ...BTC, lastPrice: 84403.98 }, ETH]]) {
      clearMemoryCache();
      const response = await call('/market/tickers?symbols=BTCUSDT,ETHUSDT', answer(body));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ ok: false, reason: 'source-unavailable' });
    }
    const unknown = await call('/market/tickers?symbols=NOPEUSDT', answer('{"code":-1121,"msg":"Invalid symbol."}', 400));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ ok: false, reason: 'unknown-market', retryAfter: null });
  });
});
