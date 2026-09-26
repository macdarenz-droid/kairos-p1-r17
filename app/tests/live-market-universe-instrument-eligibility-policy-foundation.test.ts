import { describe, expect, it } from 'vitest';
import {
  isLiveMarketUniverseInstrumentEligible,
  type LiveMarketUniverseInstrumentMetadataFact,
} from '../src/services/market-data';

const fact: LiveMarketUniverseInstrumentMetadataFact = {
  instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tradingEnabled: true,
};

describe('Live Market Universe instrument eligibility policy foundation', () => {
  it('accepts an actively tradable USDT-quoted instrument not in the configured stablecoin exclusion set', () => {
    expect(isLiveMarketUniverseInstrumentEligible(fact, {
      excludedStablecoinBaseAssets: new Set(['USDC', 'USDT']),
    })).toBe(true);
  });

  it('rejects metadata facts that are not currently trading', () => {
    expect(isLiveMarketUniverseInstrumentEligible({ ...fact, tradingEnabled: false }, {
      excludedStablecoinBaseAssets: new Set(),
    })).toBe(false);
  });

  it('rejects non-USDT quote assets without inferring eligibility from symbol suffixes', () => {
    expect(isLiveMarketUniverseInstrumentEligible({
      ...fact,
      instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
      quoteAsset: 'FDUSD',
    }, {
      excludedStablecoinBaseAssets: new Set(),
    })).toBe(false);
  });

  it('applies only the explicit caller-configured stablecoin base-asset exclusion set', () => {
    const usdc = {
      ...fact,
      instrument: { venue: 'binance-spot', symbol: 'USDCUSDT' },
      baseAsset: 'USDC',
    };
    expect(isLiveMarketUniverseInstrumentEligible(usdc, {
      excludedStablecoinBaseAssets: new Set(['USDC']),
    })).toBe(false);
    expect(isLiveMarketUniverseInstrumentEligible(usdc, {
      excludedStablecoinBaseAssets: new Set(),
    })).toBe(true);
  });
});
