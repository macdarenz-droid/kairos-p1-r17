import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectBinanceSpot24hBrowserPublicRestBaselineRequest,
  describeBinanceSpot24hPublicRestBaselineRequest,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('P21.14 Binance Spot browser public REST baseline connector foundation', () => {
  it('performs exactly one native browser fetch for the released P21.7 descriptor and returns response text', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
    if (!described.ok) throw new Error('expected valid P21.7 request descriptor');
    const text = vi.fn(async () => '{"symbol":"BTCUSDT"}');
    const fetchMock = vi.fn(async () => ({ text })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await expect(connectBinanceSpot24hBrowserPublicRestBaselineRequest(described.request)).resolves.toBe('{"symbol":"BTCUSDT"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(described.request.url, {
      method: described.request.method,
      signal: undefined,
    });
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('forwards the exact caller-owned AbortSignal without creating or interpreting cancellation', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
    if (!described.ok) throw new Error('expected valid P21.7 request descriptor');
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => ({ text: async () => '{}' })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await connectBinanceSpot24hBrowserPublicRestBaselineRequest(described.request, { signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith(described.request.url, {
      method: described.request.method,
      signal: controller.signal,
    });
  });

  it('propagates native fetch rejection unchanged for the existing P21.13 acquisition-failed mapping seam', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
    if (!described.ok) throw new Error('expected valid P21.7 request descriptor');
    const failure = new Error('native-fetch-failure');
    globalThis.fetch = vi.fn(async () => { throw failure; }) as unknown as typeof fetch;
    await expect(connectBinanceSpot24hBrowserPublicRestBaselineRequest(described.request)).rejects.toBe(failure);
  });

  it('does not inspect status, headers, retry, credentials, or provider payload semantics', async () => {
    const described = describeBinanceSpot24hPublicRestBaselineRequest(scope);
    if (!described.ok) throw new Error('expected valid P21.7 request descriptor');
    const response = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '1' }),
      text: vi.fn(async () => '{"code":-1003,"msg":"rate limit"}'),
    };
    globalThis.fetch = vi.fn(async () => response as unknown as Response) as unknown as typeof fetch;
    await expect(connectBinanceSpot24hBrowserPublicRestBaselineRequest(described.request)).resolves.toContain('rate limit');
    expect(response.text).toHaveBeenCalledTimes(1);
  });
});
