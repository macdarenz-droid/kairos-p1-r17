import { describe, expect, it } from 'vitest';
import { mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection } from '../src/services/market-data';

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

describe('Binance Spot exchangeInfo instrument metadata fact collection mapping foundation', () => {
  it('maps every explicitly supplied decoded symbol entry in caller order without universe filtering', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection([
      haltedEthBtc,
      tradingBtcUsdt,
    ])).toEqual({
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

  it('treats an explicitly supplied empty collection as an empty mapping result rather than inventing completeness policy', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection([]))
      .toEqual({ ok: true, facts: [] });
  });

  it('rejects a non-array collection deterministically', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection({ symbols: [tradingBtcUsdt] }))
      .toEqual({ ok: false, reason: 'collection-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection(null))
      .toEqual({ ok: false, reason: 'collection-invalid' });
  });

  it('fails at the first invalid entry and preserves the released one-entry mapper reason and exact index', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection([
      tradingBtcUsdt,
      { ...haltedEthBtc, quoteAsset: '' },
      tradingBtcUsdt,
    ])).toEqual({
      ok: false,
      reason: 'entry-invalid',
      index: 1,
      entryReason: 'quote-asset-invalid',
    });
  });
});
