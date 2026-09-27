import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseMarketDataPorts, withTypedFailures, type MarketDataPortSet } from '../src/app/marketDataPorts';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import { createBinanceSpotCandleHistoryPort } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryAcquisition';
import { connectBinanceSpotCandleHistoryBrowser } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryBrowserConnector';

const START = 1_704_067_200_000;
const REQUEST: MarketCandleHistoryRequest = { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '1h', limit: 1, startTimeMs: START, endTimeMs: START + 3_599_999 };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function directPorts(history: MarketDataPortSet['history'] = createBinanceSpotCandleHistoryPort(connectBinanceSpotCandleHistoryBrowser, () => new Date().toISOString())): MarketDataPortSet {
  return {
    history,
    metadata: { acquireInstrumentMetadata: async () => ({ ok: false, reason: 'acquisition-failed' }) },
    baseline: { acquireBaseline: async () => ({ ok: false, reason: 'acquisition-failed' }) },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('chooseMarketDataPorts', () => {
  it('keeps the direct Binance path when the build has no server address', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json([]));
    vi.stubGlobal('fetch', fetchImpl);
    const ports = chooseMarketDataPorts({ baseUrl: null, direct: directPorts() });
    expect(ports.route).toBe('direct');
    await ports.history.acquireHistory(REQUEST);
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/^https:\/\/data-api\.binance\.vision\/api\/v3\/klines\?/);
  });

  it('asks the Kairos server when the build has its address', async () => {
    const serverFetch = vi.fn<typeof fetch>(async () => json({ apiVersion: 1, ok: true, data: { source: { provider: 'binance', market: 'spot', symbol: 'BTCUSDT' }, backup: null, interval: '1h', fetchedAt: '2026-09-26T02:00:00.000Z', candles: [], next: null } }));
    const directFetch = vi.fn<typeof fetch>(async () => json([]));
    vi.stubGlobal('fetch', directFetch);
    const ports = chooseMarketDataPorts({ baseUrl: 'https://api.test', fetchImpl: serverFetch, direct: directPorts() });
    expect(ports.route).toBe('server');
    const result = await ports.history.acquireHistory(REQUEST);
    expect(String(serverFetch.mock.calls[0][0])).toMatch(/^https:\/\/api\.test\/market\/candles\?/);
    expect(directFetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe('withTypedFailures', () => {
  const history = (result: MarketCandleHistoryResult) => withTypedFailures(directPorts({ acquireHistory: async () => result }), () => true).history.acquireHistory(REQUEST);
  const httpError = (status: number, retryAfter: string | null = null): MarketCandleHistoryResult => ({ ok: false, reason: 'http-error', status, retryAfter });

  it('says why the direct path failed', async () => {
    expect(await history(httpError(451))).toEqual({ ok: false, reason: 'unavailable', why: 'region', retryAfterSeconds: null });
    expect(await history(httpError(403))).toMatchObject({ why: 'region' });
    expect(await history(httpError(429, '30'))).toEqual({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 30 });
    expect(await history(httpError(500))).toMatchObject({ why: 'source-down' });
    expect(await history({ ok: false, reason: 'transport-failed' })).toMatchObject({ why: 'source-down' });
    expect(await history({ ok: false, reason: 'invalid-response', detail: 'invalid-json' })).toMatchObject({ why: 'unreadable' });
    expect(await history({ ok: false, reason: 'cancelled' })).toEqual({ ok: false, reason: 'cancelled' });
    const offline = withTypedFailures(directPorts({ acquireHistory: async () => ({ ok: false, reason: 'transport-failed' }) }), () => false);
    expect(await offline.history.acquireHistory(REQUEST)).toMatchObject({ why: 'offline' });
  });

  it('says the market list could not be had because the device is offline', async () => {
    const ports = withTypedFailures(directPorts(), () => false);
    expect(await ports.metadata.acquireInstrumentMetadata()).toEqual({ ok: false, reason: 'unavailable', why: 'offline', retryAfterSeconds: null });
    expect(await withTypedFailures(directPorts(), () => true).metadata.acquireInstrumentMetadata()).toMatchObject({ why: 'source-down' });
  });
});
