import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-10-25T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
// Binance's rolling-window MINI ticker (GET /api/v3/ticker?…&windowSize=…&type=MINI), as read on 2026-10-25.
const BTC = { symbol: 'BTCUSDT', openPrice: '113210.01000000', highPrice: '113400.00000000', lowPrice: '113010.00000000', lastPrice: '113305.50000000', volume: '412.11000000', quoteVolume: '46680000.10000000', openTime: 1792889999123, closeTime: 1792893599123, firstId: 1, lastId: 2, count: 3 };
const ETH = { ...BTC, symbol: 'ETHUSDT', openPrice: '4020.10000000', lastPrice: '3990.00000000', volume: '0.00000000', quoteVolume: '0.00000000' };

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() });
const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) => vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));
async function call(path: string, fetchImpl: typeof fetch, environment: KairosApiEnv = env()) {
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), environment, ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}
type MovesBody = { data: { source: string; window: string; fetchedAt: string; moves: Record<string, string>[] } };

describe('the /market/moves route (T-061e, D271)', () => {
  beforeEach(() => clearMemoryCache());

  it('asks Binance for the 1-hour rolling window and answers each move in the requested order, prices as the same text, kept 30 seconds', async () => {
    const fetchImpl = answer([ETH, BTC]);
    const response = await call('/market/moves?symbols=BTCUSDT,ETHUSDT&window=1h', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://data-api.binance.vision/api/v3/ticker?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D&windowSize=1h&type=MINI');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=30');
    const { data } = await response.json() as MovesBody;
    expect(data).toEqual({
      source: 'binance-spot', window: '1h', fetchedAt: '2026-10-25T02:00:00.000Z',
      moves: [
        { symbol: 'BTCUSDT', openPrice: '113210.01000000', lastPrice: '113305.50000000', openTime: '2026-10-25T00:59:59.123Z', closeTime: '2026-10-25T01:59:59.123Z' },
        { symbol: 'ETHUSDT', openPrice: '4020.10000000', lastPrice: '3990.00000000', openTime: '2026-10-25T00:59:59.123Z', closeTime: '2026-10-25T01:59:59.123Z' },
      ],
    });
  });

  it('asks for the 7-day window and keeps that answer 5 minutes; the same question is answered from the copy', async () => {
    const fetchImpl = answer([BTC]);
    const first = await call('/market/moves?symbols=BTCUSDT&window=7d', fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://data-api.binance.vision/api/v3/ticker?symbols=%5B%22BTCUSDT%22%5D&windowSize=7d&type=MINI');
    expect(first.headers.get('cache-control')).toBe('public, max-age=300');
    expect(((await first.json()) as MovesBody).data.window).toBe('7d');
    const again = await call('/market/moves?window=7d&symbols=BTCUSDT', fetchImpl);
    expect(again.status).toBe(200);
    expect(again.headers.get('x-kairos-cache')).toBe('memory');
    expect(again.headers.get('cache-control')).toBe('public, max-age=300');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Another window is another question.
    await call('/market/moves?symbols=BTCUSDT&window=1h', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('takes the ticker rules for the list (100 symbols, strictly ascending, upper case) and only 1h or 7d', async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => `A${String(index).padStart(3, '0')}BBBBUSDT`);
    for (const query of [
      'symbols=ETHUSDT,BTCUSDT&window=1h', 'symbols=BTCUSDT,BTCUSDT&window=1h', `symbols=${[...hundred, 'ZZZUSDT'].join(',')}&window=1h`, 'symbols=btcusdt&window=1h',
      'symbols=BTCUSDT', 'window=1h', 'symbols=BTCUSDT&window=24h', 'symbols=BTCUSDT&window=1d', 'symbols=BTCUSDT&window=1h&window=7d', 'symbols=BTCUSDT&window=1h&type=FULL',
    ]) {
      const fetchImpl = answer([]);
      expect((await call(`/market/moves?${query}`, fetchImpl)).status, query.slice(0, 40)).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    const fetchImpl = answer(hundred.map((symbol) => ({ ...BTC, symbol })));
    const response = await call(`/market/moves?symbols=${hundred.join(',')}&window=7d`, fetchImpl);
    expect(response.status).toBe(200);
    expect(((await response.json()) as MovesBody).data.moves).toHaveLength(100);
  });

  it('answers source-unavailable for a missing, extra or unreadable row; unknown-market, source-busy and source-refused as Binance says', async () => {
    for (const body of [[BTC], [BTC, ETH, { ...BTC, symbol: 'XRPUSDT' }], [BTC, { ...ETH, symbol: 'XRPUSDT' }], [{ ...BTC, lastPrice: 113305.5 }, ETH], [{ ...BTC, openPrice: '-1' }, ETH], 'not json']) {
      clearMemoryCache();
      const response = await call('/market/moves?symbols=BTCUSDT,ETHUSDT&window=1h', answer(body));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ ok: false, reason: 'source-unavailable' });
    }
    const unknown = await call('/market/moves?symbols=NOPEUSDT&window=1h', answer('{"code":-1121,"msg":"Invalid symbol."}', 400));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ ok: false, reason: 'unknown-market', retryAfter: null });
    const busy = await call('/market/moves?symbols=BTCUSDT&window=1h', answer('{}', 429, { 'retry-after': '12' }));
    expect(busy.status).toBe(503);
    expect(await busy.json()).toMatchObject({ ok: false, reason: 'source-busy', retryAfter: 12 });
    const refused = await call('/market/moves?symbols=BTCUSDT&window=1h', answer('{}', 451));
    expect(refused.status).toBe(451);
    expect(await refused.json()).toMatchObject({ ok: false, reason: 'source-refused' });
    // A failure is never kept: the next question asks Binance again.
    const fetchImpl = answer([BTC]);
    expect((await call('/market/moves?symbols=BTCUSDT&window=1h', fetchImpl)).status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is limited like every market route: a device past its limit is refused before Binance is asked', async () => {
    const fetchImpl = answer([BTC]);
    const environment: KairosApiEnv = { ...env(), KAIROS_API_ANONYMOUS_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } };
    const response = await call('/market/moves?symbols=BTCUSDT&window=1h', fetchImpl, environment);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ ok: false, reason: 'rate-limited', retryAfter: 60 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
