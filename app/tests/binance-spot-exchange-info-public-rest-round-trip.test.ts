import { describe, expect, it, vi } from 'vitest';
import { composeBinanceSpotExchangeInfoPublicRestRoundTrip } from '../src/services/market-data';

describe('Binance Spot exchangeInfo public REST round-trip composition foundation', () => {
  it('composes descriptor, exactly one injected execution and released response delivery', async () => {
    const connect = vi.fn(async (request: { readonly url: string }) => {
      expect(request.url).toBe('https://data-api.binance.vision/api/v3/exchangeInfo');
      return JSON.stringify({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' }] });
    });
    const result = await composeBinanceSpotExchangeInfoPublicRestRoundTrip(connect);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('forwards caller-owned execution options without owning cancellation policy', async () => {
    const controller = new AbortController();
    const connect = vi.fn(async (_request: unknown, options?: { readonly signal?: AbortSignal }) => {
      expect(options?.signal).toBe(controller.signal);
      return JSON.stringify({ symbols: [] });
    });
    await composeBinanceSpotExchangeInfoPublicRestRoundTrip(connect, { signal: controller.signal });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('preserves connector rejection unchanged', async () => {
    const failure = new Error('connector-owned-failure');
    const connect = vi.fn(async () => { throw failure; });
    await expect(composeBinanceSpotExchangeInfoPublicRestRoundTrip(connect)).rejects.toBe(failure);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('passes through released response-delivery failures', async () => {
    await expect(composeBinanceSpotExchangeInfoPublicRestRoundTrip(async () => '{"symbols":'))
      .resolves.toEqual({ ok: false, reason: 'invalid-json' });
  });
});
