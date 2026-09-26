import { describe, expect, it } from 'vitest';
import { mapBinanceSpot24hBaselineDelivery } from '../src/services/market-data';

const observedAt = '2023-01-01T00:03:02.200Z';
const btc = {
  symbol: 'BTCUSDT',
  openPrice: '62000.00000000',
  highPrice: '65000.00000000',
  lowPrice: '61000.00000000',
  lastPrice: '64000.50000000',
  volume: '1234.50000000',
  quoteVolume: '78000000.25000000',
  closeTime: 1672515782136,
};
const eth = {
  symbol: 'ETHUSDT',
  openPrice: '2400.00',
  highPrice: '2600.00',
  lowPrice: '2300.00',
  lastPrice: '2500.10',
  volume: '5000.00',
  quoteVolume: '12500000.00',
  closeTime: 1672515782136,
};

describe('P21.6 Binance Spot 24h baseline delivery mapping foundation', () => {
  it('composes one decoded entry into a complete baseline for an explicit one-instrument scope', () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    const result = mapBinanceSpot24hBaselineDelivery(scope, btc, observedAt);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery.completeness).toBe('complete-for-scope');
      expect(result.delivery.scope).toEqual(scope);
      expect(result.delivery.facts.map((fact) => fact.instrument.symbol)).toEqual(['BTCUSDT']);
    }
  });

  it('composes an entry array through the P21.5 mapper without making response order authoritative', () => {
    const scope = [
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
    ] as const;
    const result = mapBinanceSpot24hBaselineDelivery(scope, [eth, btc], observedAt);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new Set(result.delivery.facts.map((fact) => fact.instrument.symbol)))
        .toEqual(new Set(['BTCUSDT', 'ETHUSDT']));
    }
  });

  it('rejects invalid decoded payload shapes and invalid provider entries', () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    expect(mapBinanceSpot24hBaselineDelivery(scope, 'not-a-ticker', observedAt))
      .toEqual({ ok: false, reason: 'payload-invalid' });
    expect(mapBinanceSpot24hBaselineDelivery(scope, { ...btc, lastPrice: '0' }, observedAt))
      .toEqual({ ok: false, reason: 'fact-mapping-failed' });
  });

  it('rejects missing, duplicate, and out-of-scope facts instead of inferring completeness', () => {
    const two = [
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
    ] as const;
    expect(mapBinanceSpot24hBaselineDelivery(two, [btc], observedAt))
      .toEqual({ ok: false, reason: 'delivery-invalid' });
    expect(mapBinanceSpot24hBaselineDelivery(two, [btc, btc], observedAt))
      .toEqual({ ok: false, reason: 'delivery-invalid' });
    const btcOnly = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    expect(mapBinanceSpot24hBaselineDelivery(btcOnly, [btc, eth], observedAt))
      .toEqual({ ok: false, reason: 'delivery-invalid' });
  });
});
