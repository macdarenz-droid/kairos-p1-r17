import { describe, expect, it } from 'vitest';
import { mapBinanceSpot24hPublicRestBaselineResponseDelivery } from '../src/services/market-data';

const observedAt = '2026-09-07T06:55:00.000Z';
const btc = {
  symbol: 'BTCUSDT',
  openPrice: '62000.00000000',
  highPrice: '65000.00000000',
  lowPrice: '61000.00000000',
  lastPrice: '64000.50000000',
  volume: '1234.50000000',
  quoteVolume: '78000000.25000000',
  closeTime: 1770000000000,
};
const eth = {
  symbol: 'ETHUSDT',
  openPrice: '2400.00000000',
  highPrice: '2600.00000000',
  lowPrice: '2300.00000000',
  lastPrice: '2500.10000000',
  volume: '5000.00000000',
  quoteVolume: '12500000.00000000',
  closeTime: 1770000000000,
};

describe('P21.10 Binance Spot 24h public REST baseline response delivery composition foundation', () => {
  it('composes one received JSON-text response into the existing complete-for-scope delivery owner', () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    const result = mapBinanceSpot24hPublicRestBaselineResponseDelivery(
      scope,
      JSON.stringify(btc),
      observedAt,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery.completeness).toBe('complete-for-scope');
      expect(result.delivery.scope).toEqual(scope);
      expect(result.delivery.facts).toHaveLength(1);
      expect(result.delivery.facts[0]?.instrument.symbol).toBe('BTCUSDT');
      expect(result.delivery.facts[0]?.observedAt).toBe(observedAt);
    }
  });

  it('preserves P21.6 scope completeness without treating response array order as ranking truth', () => {
    const scope = [
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
    ] as const;
    const result = mapBinanceSpot24hPublicRestBaselineResponseDelivery(
      scope,
      JSON.stringify([eth, btc]),
      observedAt,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new Set(result.delivery.facts.map((fact) => fact.instrument.symbol)))
        .toEqual(new Set(['BTCUSDT', 'ETHUSDT']));
    }
  });

  it('passes through P21.9 decode failures without inventing transport or status semantics', () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    expect(mapBinanceSpot24hPublicRestBaselineResponseDelivery(scope, '{"symbol":', observedAt))
      .toEqual({ ok: false, reason: 'invalid-json' });
    expect(mapBinanceSpot24hPublicRestBaselineResponseDelivery(scope, { body: 'x' }, observedAt))
      .toEqual({ ok: false, reason: 'unsupported-response-data' });
  });

  it('passes through existing P21.6 provider/delivery validation failures', () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    expect(mapBinanceSpot24hPublicRestBaselineResponseDelivery(
      scope,
      JSON.stringify({ ...btc, lastPrice: '0' }),
      observedAt,
    )).toEqual({ ok: false, reason: 'fact-mapping-failed' });

    const two = [
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
    ] as const;
    expect(mapBinanceSpot24hPublicRestBaselineResponseDelivery(
      two,
      JSON.stringify([btc]),
      observedAt,
    )).toEqual({ ok: false, reason: 'delivery-invalid' });
  });
});
