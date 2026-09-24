import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisHistoryPorts } from '../src/app/analysisHistoryPorts';
import {
  BINANCE_SPOT_EXCHANGE_INFO_CACHE_TTL_MS,
  acquireBinanceSpotBrowserLiveMarketUniverseOnce,
  createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort,
  resetBinanceSpotExchangeInfoCache,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const exchangeInfoPayload = JSON.stringify({ symbols: [
  { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
] });
const btc24hPayload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

let exchangeInfoCalls = 0;
function countingFetch(exchangeInfo: () => Promise<{ text: () => Promise<string> }> = async () => ({ text: async () => exchangeInfoPayload })) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v3/exchangeInfo')) { exchangeInfoCalls += 1; return exchangeInfo(); }
    if (url.includes('/api/v3/ticker/24hr')) return Promise.resolve({ text: async () => btc24hPayload });
    return Promise.reject(new Error(`unexpected URL: ${url}`));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

const home = () => acquireBinanceSpotBrowserLiveMarketUniverseOnce(() => '2026-09-24T12:00:00.000Z', { excludedStablecoinBaseAssets: new Set() });

beforeEach(() => {
  resetBinanceSpotExchangeInfoCache();
  exchangeInfoCalls = 0;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('T-005 exchangeInfo is downloaded once per session', () => {
  it('Home, then Analysis, then Home uses one download', async () => {
    countingFetch();
    await expect(home()).resolves.toMatchObject({ ok: true });
    await expect(analysisHistoryPorts.metadata.acquireInstrumentMetadata()).resolves.toMatchObject({ ok: true });
    await expect(home()).resolves.toMatchObject({ ok: true });
    expect(exchangeInfoCalls).toBe(1);
  });

  it('downloads again once the stored copy is older than 6 hours', async () => {
    countingFetch();
    let nowMs = 1_000_000;
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort({ now: () => nowMs });
    await port.acquireInstrumentMetadata();
    nowMs += BINANCE_SPOT_EXCHANGE_INFO_CACHE_TTL_MS;
    await port.acquireInstrumentMetadata();
    expect(exchangeInfoCalls).toBe(1);
    nowMs += 1;
    await port.acquireInstrumentMetadata();
    expect(exchangeInfoCalls).toBe(2);
    expect(BINANCE_SPOT_EXCHANGE_INFO_CACHE_TTL_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('two callers at the same time share one download', async () => {
    countingFetch();
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();
    const [a, b] = await Promise.all([port.acquireInstrumentMetadata(), analysisHistoryPorts.metadata.acquireInstrumentMetadata()]);
    expect(a.ok && b.ok).toBe(true);
    expect(exchangeInfoCalls).toBe(1);
  });

  it('does not store a failure, so a retry downloads again', async () => {
    let fail = true;
    countingFetch(async () => {
      if (fail) throw new Error('offline');
      return { text: async () => exchangeInfoPayload };
    });
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
    fail = false;
    await expect(port.acquireInstrumentMetadata()).resolves.toMatchObject({ ok: true });
    expect(exchangeInfoCalls).toBe(2);
  });

  it('caller A aborting does not stop caller B from getting the data', async () => {
    let release: (value: { text: () => Promise<string> }) => void = () => undefined;
    countingFetch(() => new Promise((resolve) => { release = resolve; }));
    const port = createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort();
    const controllerA = new AbortController();
    const a = port.acquireInstrumentMetadata({ signal: controllerA.signal });
    const b = port.acquireInstrumentMetadata({ signal: new AbortController().signal });
    controllerA.abort();
    await expect(a).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
    release({ text: async () => exchangeInfoPayload });
    const result = await b;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts.map((fact) => fact.instrument.symbol)).toEqual(['BTCUSDT']);
    expect(exchangeInfoCalls).toBe(1);
  });
});
