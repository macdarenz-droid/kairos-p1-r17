import { describe, expect, it, vi } from 'vitest';
import { createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort } from '../src/services/market-data';

describe('Binance Spot exchangeInfo instrument metadata acquisition adapter foundation', () => {
  it('implements the provider-neutral metadata acquisition port using the released exchangeInfo round trip', async () => {
    const connect = vi.fn(async (request: { readonly url: string }) => {
      expect(request.url).toBe('https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false');
      return JSON.stringify({ symbols: [
        { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
        { symbol: 'ETHUSDT', status: 'TRADING', baseAsset: 'ETH', quoteAsset: 'USDT' },
      ] });
    });
    const port = createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(connect);
    const result = await port.acquireInstrumentMetadata();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.facts).toHaveLength(2);
    }
  });

  it('forwards the exact caller-owned AbortSignal through the released execution seam', async () => {
    const controller = new AbortController();
    const options = { signal: controller.signal } as const;
    const connect = vi.fn(async (_request: unknown, received?: { readonly signal?: AbortSignal }) => {
      expect(received).toBe(options);
      expect(received?.signal).toBe(controller.signal);
      return JSON.stringify({ symbols: [] });
    });
    const port = createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(connect);
    await expect(port.acquireInstrumentMetadata(options)).resolves.toEqual({ ok: true, facts: [] });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('maps released decode/mapping failure to acquisition-failed', async () => {
    const port = createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(async () => '{"symbols":');
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });

  it('maps connector rejection to acquisition-failed without inventing transport semantics', async () => {
    const port = createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(async () => {
      throw new Error('connector-owned-failure');
    });
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });
});
