import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import { acquireBinanceSpotBrowserLiveMarketUniverseOnce } from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const observedAt = '2026-09-09T17:00:00.000Z';
const exchangeInfoPayload = JSON.stringify({ symbols: [
  { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'USDCUSDT', status: 'TRADING', baseAsset: 'USDC', quoteAsset: 'USDT' },
  { symbol: 'SOLUSDT', status: 'BREAK', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { symbol: 'ETHFDUSD', status: 'TRADING', baseAsset: 'ETH', quoteAsset: 'FDUSD' },
] });
const btc24hPayload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  resetBinanceSpotExchangeInfoCache();
});

describe('Binance Spot browser Live Market Universe acquisition binding foundation', () => {
  it('splits a scope larger than Binance’s 100-symbol limit and preserves one merged ranked result', async () => {
    const symbols = Array.from({ length: 205 }, (_, index) => `COIN${index}USDT`);
    const metadataPayload = JSON.stringify({ symbols: symbols.map((symbol) => ({
      symbol, status: 'TRADING', baseAsset: symbol.slice(0, -4), quoteAsset: 'USDT',
    })) });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/exchangeInfo')) return { text: async () => metadataPayload };
      if (url.pathname.endsWith('/ticker/24hr')) {
        const requested = JSON.parse(url.searchParams.get('symbols') ?? '[]') as string[];
        return { text: async () => JSON.stringify(requested.map((symbol, index) => ({
          symbol, openPrice: '1', highPrice: '2', lowPrice: '0.5', lastPrice: '1',
          volume: '10', quoteVolume: String(205 - symbols.indexOf(symbol)), closeTime: 1770000000000 + index,
        }))) };
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(acquireBinanceSpotBrowserLiveMarketUniverseOnce(() => observedAt, {
      excludedStablecoinBaseAssets: new Set(),
      topNCount: 2,
    })).resolves.toEqual({
      ok: true,
      instruments: [
        { venue: 'binance-spot', symbol: 'COIN0USDT' },
        { venue: 'binance-spot', symbol: 'COIN1USDT' },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const tickerRequests = fetchMock.mock.calls.slice(1).map(([input]) => new URL(String(input)));
    expect(tickerRequests.map((request) => JSON.parse(request.searchParams.get('symbols') ?? '[]')))
      .toEqual([symbols.slice(0, 100), symbols.slice(100, 200), symbols.slice(200)]);
    expect(tickerRequests.every((request) => (JSON.parse(request.searchParams.get('symbols') ?? '[]') as string[]).length <= 100)).toBe(true);
  });

  it('composes the released browser metadata and baseline ports through Gate335 without duplicating universe policy', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v3/exchangeInfo')) return { text: async () => exchangeInfoPayload };
      if (url.includes('/api/v3/ticker/24hr')) return { text: async () => btc24hPayload };
      throw new Error(`unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);

    await expect(acquireBinanceSpotBrowserLiveMarketUniverseOnce(readObservedAt, {
      excludedStablecoinBaseAssets: new Set(['USDC']),
      topNCount: 1,
    })).resolves.toEqual({
      ok: true,
      instruments: [{ venue: 'binance-spot', symbol: 'BTCUSDT' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
  });

  it('keeps the caller signal on the baseline request and gives exchangeInfo its own shared signal', async () => {
    const controller = new AbortController();
    const capturedSignals: Record<string, AbortSignal | null | undefined> = {};
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v3/exchangeInfo')) {
        capturedSignals.exchangeInfo = init?.signal;
        return { text: async () => JSON.stringify({ symbols: [
          { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
        ] }) };
      }
      if (url.includes('/api/v3/ticker/24hr')) {
        capturedSignals.baseline = init?.signal;
        return { text: async () => btc24hPayload };
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(acquireBinanceSpotBrowserLiveMarketUniverseOnce(() => observedAt, {
      excludedStablecoinBaseAssets: new Set(),
      signal: controller.signal,
    })).resolves.toMatchObject({ ok: true });
    expect(capturedSignals.baseline).toBe(controller.signal);
    expect(capturedSignals.exchangeInfo).toBeInstanceOf(AbortSignal);
    expect(capturedSignals.exchangeInfo).not.toBe(controller.signal);
  });

  it('the only waiting caller aborting ends its wait and cancels the shared request', async () => {
    const controller = new AbortController();
    let exchangeInfoSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/v3/exchangeInfo')) {
        exchangeInfoSignal = init?.signal;
        return new Promise(() => undefined);
      }
      throw new Error('baseline must not run');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const pending = acquireBinanceSpotBrowserLiveMarketUniverseOnce(() => observedAt, {
      excludedStablecoinBaseAssets: new Set(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ ok: false });
    expect(exchangeInfoSignal?.aborted).toBe(true);
  });

  it('preserves Gate335 metadata acquisition failure and does not call the baseline browser chain', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v3/exchangeInfo')) throw new Error('metadata-native-failure');
      throw new Error('baseline must not run');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);

    await expect(acquireBinanceSpotBrowserLiveMarketUniverseOnce(readObservedAt, {
      excludedStablecoinBaseAssets: new Set(),
    })).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readObservedAt).not.toHaveBeenCalled();
  });

  it('preserves Gate335 empty eligible-scope short circuit without baseline request or observation time', async () => {
    const fetchMock = vi.fn(async () => ({ text: async () => JSON.stringify({ symbols: [
      { symbol: 'USDCUSDT', status: 'TRADING', baseAsset: 'USDC', quoteAsset: 'USDT' },
    ] }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);

    await expect(acquireBinanceSpotBrowserLiveMarketUniverseOnce(readObservedAt, {
      excludedStablecoinBaseAssets: new Set(['USDC']),
    })).resolves.toEqual({ ok: true, instruments: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readObservedAt).not.toHaveBeenCalled();
  });

  it('preserves Gate335 baseline acquisition failure unchanged', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v3/exchangeInfo')) return { text: async () => JSON.stringify({ symbols: [
        { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
      ] }) };
      if (url.includes('/api/v3/ticker/24hr')) throw new Error('baseline-native-failure');
      throw new Error(`unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(acquireBinanceSpotBrowserLiveMarketUniverseOnce(() => observedAt, {
      excludedStablecoinBaseAssets: new Set(),
    })).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
