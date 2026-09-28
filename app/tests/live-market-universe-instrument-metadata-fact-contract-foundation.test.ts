import { describe, expect, it } from 'vitest';
import {
  validateLiveMarketUniverseInstrumentMetadataFact,
  type LiveMarketUniverseInstrumentMetadataFact,
} from '../src/services/market-data';

const fact: LiveMarketUniverseInstrumentMetadataFact = {
  instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tradingEnabled: true,
};

describe('Live Market Universe Instrument Metadata Fact Contract Foundation', () => {
  it('accepts provider-neutral current instrument metadata without applying universe policy', () => {
    expect(validateLiveMarketUniverseInstrumentMetadataFact(fact)).toEqual({ ok: true, fact });
    expect(validateLiveMarketUniverseInstrumentMetadataFact({ ...fact, tradingEnabled: false })).toEqual({
      ok: true,
      fact: { ...fact, tradingEnabled: false },
    });
  });

  it('rejects missing instrument and asset identity', () => {
    expect(validateLiveMarketUniverseInstrumentMetadataFact({
      ...fact,
      instrument: { venue: '', symbol: 'BTCUSDT' },
    })).toEqual({ ok: false, reason: 'instrument-required' });
    expect(validateLiveMarketUniverseInstrumentMetadataFact({ ...fact, baseAsset: ' ' })).toEqual({
      ok: false,
      reason: 'base-asset-required',
    });
    expect(validateLiveMarketUniverseInstrumentMetadataFact({ ...fact, quoteAsset: '' })).toEqual({
      ok: false,
      reason: 'quote-asset-required',
    });
  });
});
