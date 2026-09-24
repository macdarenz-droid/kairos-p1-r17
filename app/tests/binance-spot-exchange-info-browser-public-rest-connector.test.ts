import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import {
  connectBinanceSpotExchangeInfoBrowserPublicRestRequest,
  describeBinanceSpotExchangeInfoPublicRestRequest,
} from '../src/services/market-data';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

beforeEach(() => {
  resetBinanceSpotExchangeInfoCache();
});

describe('Binance Spot exchangeInfo browser public REST connector foundation', () => {
  it('fetches exactly once and returns response text unchanged', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const text = vi.fn(async () => '{"symbols":[]}');
    const fetchMock = vi.fn(async () => ({ text })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;
    await expect(connectBinanceSpotExchangeInfoBrowserPublicRestRequest(request)).resolves.toBe('{"symbols":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(request.url, { method: request.method, signal: undefined });
    expect(text).toHaveBeenCalledTimes(1);
  });
  it('forwards the exact caller-owned AbortSignal', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => ({ text: async () => '{}' })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;
    await connectBinanceSpotExchangeInfoBrowserPublicRestRequest(request, { signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith(request.url, { method: request.method, signal: controller.signal });
  });
  it('propagates native fetch rejection unchanged', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const failure = new Error('native-fetch-failure');
    globalThis.fetch = vi.fn(async () => { throw failure; }) as unknown as typeof fetch;
    await expect(connectBinanceSpotExchangeInfoBrowserPublicRestRequest(request)).rejects.toBe(failure);
  });
  it('does not interpret HTTP status or provider payload semantics', async () => {
    const request = describeBinanceSpotExchangeInfoPublicRestRequest();
    const response = { ok:false, status:429, headers:new Headers(), text:vi.fn(async () => '{"code":-1003}') };
    globalThis.fetch = vi.fn(async () => response as unknown as Response) as unknown as typeof fetch;
    await expect(connectBinanceSpotExchangeInfoBrowserPublicRestRequest(request)).resolves.toContain('-1003');
    expect(response.text).toHaveBeenCalledTimes(1);
  });
});
