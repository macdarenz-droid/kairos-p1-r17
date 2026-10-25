import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import {
  startBinanceHomeDashboardLiveMarketRuntime,
} from '../src/app/binanceHomeDashboardLiveMarketRuntimeBootstrap';
import type { DecimalString } from '../src/domain/trades';
import type {
  HomeDashboardLiveMarketSummaryBrowserTimer,
  HomeDashboardLiveMarketSummaryBrowserVisibilityDocument,
} from '../src/app/homeDashboardLiveMarketSummaryBrowserLifecycleAdapter';

const originalFetch = globalThis.fetch;
const observedAt = '2026-09-09T19:30:00.000Z';
const exchangeInfoPayload = JSON.stringify({ symbols: [
  { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
] });
const btc24hPayload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function createBrowserDocument() {
  let listener: (() => void) | null = null;
  const addEventListener = vi.fn((_type: 'visibilitychange', next: () => void) => {
    listener = next;
  });
  const removeEventListener = vi.fn((_type: 'visibilitychange', next: () => void) => {
    if (listener === next) listener = null;
  });
  const browserDocument = {
    visibilityState: 'visible' as const,
    addEventListener,
    removeEventListener,
  } satisfies HomeDashboardLiveMarketSummaryBrowserVisibilityDocument;
  return { browserDocument, addEventListener, removeEventListener };
}

function createTimer() {
  const schedule = vi.fn((_callback: () => void, _delayMs: number) => 1);
  const cancel = vi.fn();
  const timer: HomeDashboardLiveMarketSummaryBrowserTimer = { schedule, cancel };
  return { timer, schedule, cancel };
}

beforeEach(() => {
  resetBinanceSpotExchangeInfoCache();
});

describe('Binance Home Dashboard live-market runtime bootstrap foundation', () => {
  it('uses Gate336 once, reuses the same caller observation source, and starts the released browser lifecycle for the selected scope', async () => {
    const page = createBrowserDocument();
    const timer = createTimer();
    const readObservedAt = vi.fn(() => observedAt);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v3/exchangeInfo')) return { text: async () => exchangeInfoPayload };
      if (url.includes('/api/v3/ticker/24hr')) return { text: async () => btc24hPayload };
      throw new Error(`unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onResult = vi.fn();

    const result = await startBinanceHomeDashboardLiveMarketRuntime(readObservedAt, {
      universe: { excludedStablecoinBaseAssets: new Set(), topNCount: 1 },
      lifecycle: { document: page.browserDocument, timer: timer.timer, observer: { onResult } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runtime.instruments).toEqual([{ venue: 'binance-spot', symbol: 'BTCUSDT' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readObservedAt).toHaveBeenCalledTimes(2);
    expect(page.addEventListener).toHaveBeenCalledTimes(1);
    expect(timer.schedule).toHaveBeenCalledTimes(1);
    expect(timer.schedule.mock.calls[0]?.[1]).toBe(5000);
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    result.runtime.close();
  });

  it('preserves Gate336 acquisition failure and starts no session/lifecycle work', async () => {
    const page = createBrowserDocument();
    const timer = createTimer();
    const readObservedAt = vi.fn(() => observedAt);
    globalThis.fetch = vi.fn(async () => { throw new Error('metadata-failure'); }) as unknown as typeof fetch;

    await expect(startBinanceHomeDashboardLiveMarketRuntime(readObservedAt, {
      universe: { excludedStablecoinBaseAssets: new Set() },
      lifecycle: { document: page.browserDocument, timer: timer.timer },
    })).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });

    expect(readObservedAt).not.toHaveBeenCalled();
    expect(page.addEventListener).not.toHaveBeenCalled();
    expect(timer.schedule).not.toHaveBeenCalled();
  });

  it('treats Gate336 authoritative empty selected scope as a successful idle runtime without invalid baseline polling', async () => {
    const page = createBrowserDocument();
    const timer = createTimer();
    const readObservedAt = vi.fn(() => observedAt);
    globalThis.fetch = vi.fn(async () => ({ text: async () => JSON.stringify({ symbols: [
      { symbol: 'USDCUSDT', status: 'TRADING', baseAsset: 'USDC', quoteAsset: 'USDT' },
    ] }) })) as unknown as typeof fetch;

    const result = await startBinanceHomeDashboardLiveMarketRuntime(readObservedAt, {
      universe: { excludedStablecoinBaseAssets: new Set(['USDC']) },
      lifecycle: { document: page.browserDocument, timer: timer.timer },
    });

    expect(result).toMatchObject({ ok: true, runtime: { instruments: [] } });
    expect(readObservedAt).not.toHaveBeenCalled();
    expect(page.addEventListener).not.toHaveBeenCalled();
    expect(timer.schedule).not.toHaveBeenCalled();
    if (result.ok) {
      expect(() => {
        result.runtime.close();
        result.runtime.close();
      }).not.toThrow();
    }
  });

  it('exposes one idempotent close handle that delegates released browser lifecycle shutdown', async () => {
    const page = createBrowserDocument();
    const timer = createTimer();
    const readObservedAt = vi.fn(() => observedAt);
    let baselineCall = 0;
    let liveSignal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v3/exchangeInfo')) {
        return Promise.resolve({ text: async () => exchangeInfoPayload }) as Promise<Response>;
      }
      if (url.includes('/api/v3/ticker/24hr')) {
        baselineCall += 1;
        if (baselineCall === 1) {
          return Promise.resolve({ text: async () => btc24hPayload }) as Promise<Response>;
        }
        liveSignal = init?.signal;
        return new Promise<Response>(() => {});
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    }) as unknown as typeof fetch;

    const result = await startBinanceHomeDashboardLiveMarketRuntime(readObservedAt, {
      universe: { excludedStablecoinBaseAssets: new Set() },
      lifecycle: { document: page.browserDocument, timer: timer.timer },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(liveSignal?.aborted).toBe(false);
    result.runtime.close();
    result.runtime.close();
    expect(page.removeEventListener).toHaveBeenCalledTimes(1);
    expect(timer.cancel).toHaveBeenCalledTimes(1);
    expect(liveSignal?.aborted).toBe(true);
  });
});

describe('U2 Home live market through the build\'s ports (T-048g)', () => {
  it('calls only the injected metadata and baseline ports, and keeps the top 30 eligible USDT markets by quote volume', async () => {
    const page = createBrowserDocument();
    const timer = createTimer();
    const readObservedAt = vi.fn(() => observedAt);
    globalThis.fetch = vi.fn(async () => { throw new Error('no direct Binance request expected'); }) as unknown as typeof fetch;
    const coins = Array.from({ length: 35 }, (_, index) => `C${String(index).padStart(2, '0')}`);
    const fact = (symbol: string, baseAsset: string, quoteAsset: string, tradingEnabled = true) =>
      ({ instrument: { venue: 'binance-spot', symbol }, baseAsset, quoteAsset, tradingEnabled });
    const metadataFacts = [
      ...coins.map((coin) => fact(`${coin}USDT`, coin, 'USDT')),
      fact('C00BTC', 'C00', 'BTC'),
      fact('HALTUSDT', 'HALT', 'USDT', false),
      fact('USDCUSDT', 'USDC', 'USDT'),
    ];
    const volumeOf = (symbol: string) => symbol === 'USDCUSDT' ? '999999999' : String(1000 + Number(symbol.slice(1, 3)));
    const metadata = { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts: metadataFacts })) };
    const baseline = {
      acquireBaseline: vi.fn(async (scope: readonly { venue: string; symbol: string }[]) => ({
        ok: true as const,
        delivery: {
          completeness: 'complete-for-scope' as const,
          scope,
          facts: scope.map((instrument) => ({
            instrument, lastPrice: '2' as DecimalString, open24h: '1' as DecimalString, high24h: '3' as DecimalString,
            low24h: '1' as DecimalString, baseVolume24h: '10' as DecimalString,
            quoteVolume24h: volumeOf(instrument.symbol) as DecimalString, observedAt, sourceTimestamp: null,
          })),
        },
      })),
    };

    const result = await startBinanceHomeDashboardLiveMarketRuntime(readObservedAt, {
      universe: { excludedStablecoinBaseAssets: new Set(['USDC']) },
      lifecycle: { document: page.browserDocument, timer: timer.timer },
      ports: { metadata, baseline },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runtime.instruments.map((instrument) => instrument.symbol)).toEqual(
      coins.slice().reverse().slice(0, 30).map((coin) => `${coin}USDT`),
    );
    expect(metadata.acquireInstrumentMetadata).toHaveBeenCalledTimes(1);
    expect(baseline.acquireBaseline.mock.calls[0][0].map((instrument) => instrument.symbol)).toEqual(coins.map((coin) => `${coin}USDT`));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(readObservedAt).not.toHaveBeenCalled();
    result.runtime.close();
  });

  it('carries the port\'s typed reason when the market list fails', async () => {
    const unavailable = { ok: false as const, reason: 'unavailable' as const, why: 'region' as const, retryAfterSeconds: null };
    const result = await startBinanceHomeDashboardLiveMarketRuntime(vi.fn(() => observedAt), {
      universe: { excludedStablecoinBaseAssets: new Set() },
      ports: { metadata: { acquireInstrumentMetadata: vi.fn(async () => unavailable) }, baseline: { acquireBaseline: vi.fn() } },
    });
    expect(result).toEqual({ ok: false, reason: 'acquisition-failed', unavailable });
  });
});
