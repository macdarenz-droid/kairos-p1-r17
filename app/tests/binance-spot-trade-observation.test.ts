import { describe, expect, it } from 'vitest';
import { mapBinanceSpotTradeObservation } from '../src/services/market-data';

describe('P16.2 Binance Spot trade observation mapping', () => {
  it('maps a valid BTCUSDT trade into the P15 observation contract', () => {
    const result = mapBinanceSpotTradeObservation(
      {
        e: 'trade',
        E: 1672515782136,
        s: 'BTCUSDT',
        t: 12345,
        p: '42123.45000000',
        q: '0.01000000',
        T: 1672515782136,
        m: true,
        M: true,
      },
      '2023-01-01T00:03:02.200Z',
    );

    expect(result).toEqual({
      ok: true,
      observation: {
        instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
        price: '42123.45000000',
        observedAt: '2023-01-01T00:03:02.200Z',
        sourceTimestamp: '2022-12-31T19:43:02.136Z',
      },
    });
  });

  it('maps another Binance Spot symbol without BTCUSDT-specific logic', () => {
    const result = mapBinanceSpotTradeObservation(
      {
        e: 'trade',
        s: 'ETHUSDT',
        p: '2500.10',
        T: 1672515782136,
      },
      '2023-01-01T00:03:02.200Z',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.observation.instrument.symbol).toBe('ETHUSDT');
      expect(result.observation.price).toBe('2500.10');
    }
  });

  it('rejects wrong event types and invalid prices', () => {
    expect(
      mapBinanceSpotTradeObservation(
        { e: 'aggTrade', s: 'BTCUSDT', p: '1', T: 1672515782136 },
        '2023-01-01T00:03:02.200Z',
      ),
    ).toEqual({ ok: false, reason: 'event-type-invalid' });

    expect(
      mapBinanceSpotTradeObservation(
        { e: 'trade', s: 'BTCUSDT', p: '0', T: 1672515782136 },
        '2023-01-01T00:03:02.200Z',
      ),
    ).toEqual({ ok: false, reason: 'price-invalid' });
  });

  it('keeps receipt time caller-owned and rejects invalid provider trade time', () => {
    expect(
      mapBinanceSpotTradeObservation(
        { e: 'trade', s: 'BTCUSDT', p: '1', T: -1 },
        '2023-01-01T00:03:02.200Z',
      ),
    ).toEqual({ ok: false, reason: 'trade-time-invalid' });

    expect(
      mapBinanceSpotTradeObservation(
        { e: 'trade', s: 'BTCUSDT', p: '1', T: 1672515782136 },
        'not-a-time',
      ),
    ).toEqual({ ok: false, reason: 'observed-at-invalid' });
  });
});
