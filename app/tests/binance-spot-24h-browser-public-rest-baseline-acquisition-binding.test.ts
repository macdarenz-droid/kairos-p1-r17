import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
const observedAt = '2026-09-07T12:16:00.000Z';
const payload = JSON.stringify({
  symbol: 'BTCUSDT', openPrice: '62000', highPrice: '65000', lowPrice: '61000',
  lastPrice: '64000', volume: '1234', quoteVolume: '78000000', closeTime: 1770000000000,
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('P21.15 Binance Spot browser public REST baseline acquisition binding foundation', () => {
  it('binds released P21.13 acquisition to released P21.14 browser transport without new ownership', async () => {
    const text = vi.fn(async () => payload);
    const fetchMock = vi.fn(async () => ({ text }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const readObservedAt = vi.fn(() => observedAt);
    const port = createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(readObservedAt);

    const result = await port.acquireBaseline(scope);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text).toHaveBeenCalledTimes(1);
    expect(readObservedAt).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.delivery.scope).toEqual(scope);
      expect(result.delivery.completeness).toBe('complete-for-scope');
      expect(result.delivery.facts[0]?.observedAt).toBe(observedAt);
    }
  });

  it('preserves caller-owned cancellation through the bound P21.13/P21.14 chain', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => ({
      text: async () => payload,
      init,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const port = createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(() => observedAt);

    await expect(port.acquireBaseline(scope, { signal: controller.signal })).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.signal).toBe(controller.signal);
  });

  it('keeps existing P21.13 acquisition-failed mapping for native browser rejection', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('native-fetch-failure'); }) as unknown as typeof fetch;
    const port = createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(() => observedAt);
    await expect(port.acquireBaseline(scope)).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });
});
