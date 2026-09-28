import { describe, expect, it, vi } from 'vitest';
import { composeBinanceSpot24hPublicRestBaselineRoundTrip } from '../src/services/market-data';

const observedAt = '2026-09-07T07:50:00.000Z';
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

describe('P21.11 Binance Spot 24h public REST baseline round-trip composition foundation', () => {
  it('composes descriptor, one injected execution and existing response delivery for explicit caller scope', async () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    const connect = vi.fn(async (request: { readonly url: string }) => {
      expect(request.url).toBe('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT&type=FULL');
      return JSON.stringify(btc);
    });
    const result = await composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, connect);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery.completeness).toBe('complete-for-scope');
      expect(result.delivery.scope).toEqual(scope);
      expect(result.delivery.facts[0]?.instrument.symbol).toBe('BTCUSDT');
      expect(result.delivery.facts[0]?.observedAt).toBe(observedAt);
    }
  });

  it('returns request-description failure before invoking the connector', async () => {
    const connect = vi.fn(async () => JSON.stringify(btc));
    await expect(composeBinanceSpot24hPublicRestBaselineRoundTrip([], observedAt, connect))
      .resolves.toEqual({ ok: false, reason: 'scope-required' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('passes through existing response decode/delivery failures', async () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    await expect(composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, async () => '{"symbol":'))
      .resolves.toEqual({ ok: false, reason: 'invalid-json' });
    await expect(composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, async () => JSON.stringify({ ...btc, lastPrice: '0' })))
      .resolves.toEqual({ ok: false, reason: 'fact-mapping-failed' });
  });

  it('does not invent retry or transport-error policy when the supplied connector rejects', async () => {
    const scope = [{ venue: 'binance-spot', symbol: 'BTCUSDT' }] as const;
    const failure = new Error('connector-owned-failure');
    const connect = vi.fn(async () => { throw failure; });
    await expect(composeBinanceSpot24hPublicRestBaselineRoundTrip(scope, observedAt, connect)).rejects.toBe(failure);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
