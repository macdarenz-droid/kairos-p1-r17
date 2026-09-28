import { describe, expect, it } from 'vitest';
import { mapBinanceSpot24hSummaryFact } from '../src/services/market-data';

const payload = {
  symbol: 'BTCUSDT',
  openPrice: '62000.00000000',
  highPrice: '65000.00000000',
  lowPrice: '61000.00000000',
  lastPrice: '64000.50000000',
  volume: '1234.50000000',
  quoteVolume: '78000000.25000000',
  openTime: 1672429382136,
  closeTime: 1672515782136,
};

describe('P21.5 Binance Spot 24h summary fact mapping foundation', () => {
  it('maps one valid provider entry into canonical P21.2 market-summary fact truth', () => {
    expect(mapBinanceSpot24hSummaryFact(payload, '2023-01-01T00:03:02.200Z')).toEqual({
      ok: true,
      fact: {
        instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
        lastPrice: '64000.50000000',
        open24h: '62000.00000000',
        high24h: '65000.00000000',
        low24h: '61000.00000000',
        baseVolume24h: '1234.50000000',
        quoteVolume24h: '78000000.25000000',
        observedAt: '2023-01-01T00:03:02.200Z',
        sourceTimestamp: '2022-12-31T19:43:02.136Z',
      },
    });
  });

  it('has no BTC-specific mapping and accepts zero 24h volume', () => {
    const result = mapBinanceSpot24hSummaryFact(
      { ...payload, symbol: 'ETHUSDT', lastPrice: '2500.10', volume: '0', quoteVolume: '0' },
      '2023-01-01T00:03:02.200Z',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.instrument.symbol).toBe('ETHUSDT');
      expect(result.fact.baseVolume24h).toBe('0');
    }
  });

  it('rejects invalid provider price and volume fields through canonical fact validation', () => {
    expect(mapBinanceSpot24hSummaryFact({ ...payload, lastPrice: '0' }, '2023-01-01T00:03:02.200Z'))
      .toEqual({ ok: false, reason: 'last-price-invalid' });
    expect(mapBinanceSpot24hSummaryFact({ ...payload, volume: '-1' }, '2023-01-01T00:03:02.200Z'))
      .toEqual({ ok: false, reason: 'base-volume-invalid' });
  });

  it('keeps receipt time caller-owned and validates provider closeTime separately', () => {
    expect(mapBinanceSpot24hSummaryFact({ ...payload, closeTime: -1 }, '2023-01-01T00:03:02.200Z'))
      .toEqual({ ok: false, reason: 'close-time-invalid' });
    expect(mapBinanceSpot24hSummaryFact(payload, 'not-a-time'))
      .toEqual({ ok: false, reason: 'observed-at-invalid' });
  });
});
