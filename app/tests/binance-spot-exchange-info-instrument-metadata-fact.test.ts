import { describe, expect, it } from 'vitest';
import { mapBinanceSpotExchangeInfoInstrumentMetadataFact } from '../src/services/market-data';

const tradingSymbol = {
  symbol: 'BTCUSDT',
  status: 'TRADING',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
};

describe('Binance Spot exchangeInfo instrument metadata fact mapping foundation', () => {
  it('maps one decoded TRADING symbol entry into one canonical provider-neutral metadata fact', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact(tradingSymbol)).toEqual({
      ok: true,
      fact: {
        instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tradingEnabled: true,
      },
    });
  });

  it('preserves non-USDT asset identity and maps non-TRADING provider status to trading disabled without universe filtering', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact({
      symbol: 'ETHBTC',
      status: 'BREAK',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
    })).toEqual({
      ok: true,
      fact: {
        instrument: { venue: 'binance-spot', symbol: 'ETHBTC' },
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
        tradingEnabled: false,
      },
    });
  });

  it('rejects non-object payloads and invalid provider identity fields deterministically', () => {
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact(null))
      .toEqual({ ok: false, reason: 'payload-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact([]))
      .toEqual({ ok: false, reason: 'payload-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact({ ...tradingSymbol, symbol: ' ' }))
      .toEqual({ ok: false, reason: 'symbol-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact({ ...tradingSymbol, status: '' }))
      .toEqual({ ok: false, reason: 'status-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact({ ...tradingSymbol, baseAsset: 7 }))
      .toEqual({ ok: false, reason: 'base-asset-invalid' });
    expect(mapBinanceSpotExchangeInfoInstrumentMetadataFact({ ...tradingSymbol, quoteAsset: null }))
      .toEqual({ ok: false, reason: 'quote-asset-invalid' });
  });
});
