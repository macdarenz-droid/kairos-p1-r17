import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { decodeCoinGeckoMarkets } from '../src/market/coinGecko';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-10-24T08:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const QUERY = 'vs_currency=usd&order=market_cap_desc&per_page=250&page=1';

/** One row of CoinGecko's /coins/markets, with the extra fields it sends (left out by the decoder). */
const coin = (symbol: unknown, name: unknown) => ({ id: String(name).toLowerCase(), symbol, name, image: 'https://example.invalid/logo.png', current_price: 1, market_cap: 1 });
const COINS = [coin('btc', 'Bitcoin'), coin('eth', 'Ethereum'), coin('usdt', 'Tether')];

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = (overrides: Partial<KairosApiEnv> = {}): KairosApiEnv => ({
  KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter(), KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE,
  COIN_DATA_API_KEY: 'test-key', ...overrides,
});
const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));
async function call(fetchImpl: typeof fetch, overrides: Partial<KairosApiEnv> = {}) {
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request('https://kairos-api.example.workers.dev/market/coin-names', { headers: { origin: APP } }), env(overrides), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}
const headerOf = (fetchImpl: ReturnType<typeof answer>, name: string) => new Headers(fetchImpl.mock.calls[0][1]?.headers).get(name);

describe('T-059b coin names from CoinGecko', () => {
  // The KV copy lives through the file's tests; each starts without one.
  beforeEach(async () => { clearMemoryCache(); await (workerEnv.KAIROS_API_CACHE as unknown as { delete(key: string): Promise<void> }).delete('market-coin-names:v1:'); });

  it('asks the demo host with the demo key header, answers small names A→Z, and keeps them a day', async () => {
    const fetchImpl = answer(COINS);
    const first = await call(fetchImpl);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`https://api.coingecko.com/api/v3/coins/markets?${QUERY}`);
    expect(headerOf(fetchImpl, 'x-cg-demo-api-key')).toBe('test-key');
    expect(headerOf(fetchImpl, 'x-cg-pro-api-key')).toBeNull();
    expect(first.status).toBe(200);
    expect(((await first.json()) as { data: unknown }).data).toEqual({
      source: 'coingecko', fetchedAt: '2026-10-24T08:00:00.000Z',
      names: [{ symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' }, { symbol: 'USDT', name: 'Tether' }],
    });
    expect(first.headers.get('cache-control')).toBe('public, max-age=86400');
    const again = await call(fetchImpl);
    expect(again.headers.get('x-kairos-cache')).toBe('memory');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await workerEnv.KAIROS_API_CACHE!.get('market-coin-names:v1:', 'text')).toContain('"Bitcoin"');
  });

  it('asks the pro host with the pro key header for a paid key', async () => {
    const fetchImpl = answer(COINS);
    expect((await call(fetchImpl, { COIN_DATA_PLAN: 'pro' })).status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`https://pro-api.coingecko.com/api/v3/coins/markets?${QUERY}`);
    expect(headerOf(fetchImpl, 'x-cg-pro-api-key')).toBe('test-key');
    expect(headerOf(fetchImpl, 'x-cg-demo-api-key')).toBeNull();
  });

  it('is not set up without the key, and never asks CoinGecko then', async () => {
    for (const overrides of [{ COIN_DATA_API_KEY: undefined }, { COIN_DATA_API_KEY: '' }]) {
      clearMemoryCache();
      const fetchImpl = answer(COINS);
      const response = await call(fetchImpl, overrides);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, reason: 'not-set-up' });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('answers the source reasons: a refused key, busy (its wait), down, and an answer it cannot trust', async () => {
    const cases: Array<[string, ReturnType<typeof answer>, number, string, number | null]> = [
      ['refused', answer({ status: { error_code: 10002 } }, 401), 451, 'source-refused', null],
      ['busy', answer({ status: { error_code: 429 } }, 429, { 'retry-after': '7' }), 503, 'source-busy', 7],
      ['down', answer('oops', 500, { 'content-type': 'text/plain' }), 502, 'source-unavailable', 30],
      ['not a list', answer({ coins: COINS }), 502, 'source-unavailable', 30],
      ['nothing usable', answer([coin('', 'Nameless'), coin('btc', '')]), 502, 'source-unavailable', 30],
    ];
    for (const [label, fetchImpl, status, reason, retryAfter] of cases) {
      clearMemoryCache();
      const response = await call(fetchImpl);
      expect(response.status, label).toBe(status);
      expect(await response.json(), label).toMatchObject({ ok: false, reason, retryAfter });
    }
  });
});

describe('T-059b the coin-names decoder', () => {
  it('leaves out bad rows and every row of a symbol two coins share, never guessing a name', () => {
    const decoded = decodeCoinGeckoMarkets(JSON.stringify([
      coin('btc', 'Bitcoin'), coin('eth', 'Ethereum'), coin('eth', 'Ethereum Classic Wrapped'), coin('sol', ' Solana '),
      coin('bad symbol', 'Space'), coin('x'.repeat(21), 'Too long'), coin('ctl', 'Bell\u0007'), coin('long', 'L'.repeat(61)), coin(7, 'Seven'), 'not a row',
    ]));
    expect(decoded).toEqual([{ symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'SOL', name: 'Solana' }]);
  });

  it('refuses an answer that is not a list of at most 250 rows', () => {
    expect(decodeCoinGeckoMarkets('not json')).toBeNull();
    expect(decodeCoinGeckoMarkets(JSON.stringify({ coins: [] }))).toBeNull();
    expect(decodeCoinGeckoMarkets(JSON.stringify(Array.from({ length: 251 }, (_, index) => coin(`C${index}`, `Coin ${index}`))))).toBeNull();
    expect(decodeCoinGeckoMarkets(JSON.stringify(Array.from({ length: 250 }, (_, index) => coin(`C${index}`, `Coin ${index}`))))).toHaveLength(250);
  });
});
