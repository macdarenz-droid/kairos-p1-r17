import { describe, expect, it } from 'vitest';
import { mapBinanceSpotExchangeInfoPublicRestResponseDelivery } from '../src/services/market-data';

describe('Binance Spot exchangeInfo public REST response delivery composition foundation', () => {
  it('composes valid JSON text through decode and whole-response mapping', () => {
    const result = mapBinanceSpotExchangeInfoPublicRestResponseDelivery(JSON.stringify({ symbols: [] }));
    expect(result.ok).toBe(true);
  });

  it('preserves deterministic decoder failures unchanged', () => {
    expect(mapBinanceSpotExchangeInfoPublicRestResponseDelivery('{"symbols":'))
      .toEqual({ ok: false, reason: 'invalid-json' });
    expect(mapBinanceSpotExchangeInfoPublicRestResponseDelivery({ symbols: [] }))
      .toEqual({ ok: false, reason: 'unsupported-response-data' });
  });

  it('passes decoded payload to the released whole-response mapper without accepting arrays as responses', () => {
    const result = mapBinanceSpotExchangeInfoPublicRestResponseDelivery('[]');
    expect(result.ok).toBe(false);
  });
});
