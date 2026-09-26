import { describe, expect, it } from 'vitest';
import { mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse } from '../src/services/market-data';

const tradingBtcUsdt = {
  symbol: 'BTCUSDT',
  status: 'TRADING',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
};

const haltedEthBtc = {
  symbol: 'ETHBTC',
  status: 'BREAK',
  baseAsset: 'ETH',
  quoteAsset: 'BTC',
};

describe('Binance Spot exchangeInfo instrument metadata fact response mapping foundation', () => {
  it('extracts symbols from one whole decoded response and delegates collection mapping in provider order', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse({
      timezone: 'UTC',
      serverTime: 123,
      symbols: [haltedEthBtc, tradingBtcUsdt],
    })).toEqual({
      ok: true,
      facts: [
        {
          instrument: { venue: 'binance-spot', symbol: 'ETHBTC' },
          baseAsset: 'ETH',
          quoteAsset: 'BTC',
          tradingEnabled: false,
        },
        {
          instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          tradingEnabled: true,
        },
      ],
    });
  });

  it('accepts an empty symbols array without inventing exchange completeness or universe policy', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse({ symbols: [] }))
      .toEqual({ ok: true, facts: [] });
  });

  it('rejects a non-object whole response before symbols extraction', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse(null))
      .toEqual({ ok: false, reason: 'response-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse([]))
      .toEqual({ ok: false, reason: 'response-invalid' });
  });

  it('surfaces the released collection-invalid result for a missing or non-array symbols value', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse({}))
      .toEqual({ ok: false, reason: 'collection-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse({ symbols: {} }))
      .toEqual({ ok: false, reason: 'collection-invalid' });
  });

  it('surfaces the released first-invalid-entry result without skipping or reinterpreting entries', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse({
      symbols: [tradingBtcUsdt, { ...haltedEthBtc, baseAsset: '' }, tradingBtcUsdt],
    })).toEqual({
      ok: false,
      reason: 'entry-invalid',
      index: 1,
      entryReason: 'base-asset-invalid',
    });
  });
});
