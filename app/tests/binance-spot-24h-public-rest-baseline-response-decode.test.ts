import { describe, expect, it } from 'vitest';
import { decodeBinanceSpot24hPublicRestBaselineResponse } from '../src/services/market-data';

describe('P21.9 Binance Spot 24h public REST baseline response decode foundation', () => {
  it('decodes a single FULL 24h ticker JSON object without changing lexical decimal strings', () => {
    const result = decodeBinanceSpot24hPublicRestBaselineResponse(
      '{"symbol":"BTCUSDT","lastPrice":"42123.45000000","openPrice":"41000.00000000","highPrice":"43000.00000000","lowPrice":"40500.00000000","volume":"123.45000000","quoteVolume":"5200000.12345678","closeTime":1770000000000}',
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        symbol: 'BTCUSDT',
        lastPrice: '42123.45000000',
        openPrice: '41000.00000000',
        highPrice: '43000.00000000',
        lowPrice: '40500.00000000',
        volume: '123.45000000',
        quoteVolume: '5200000.12345678',
        closeTime: 1770000000000,
      },
    });
  });

  it('decodes a multiple-symbol FULL 24h ticker JSON array without inferring ordering semantics', () => {
    const result = decodeBinanceSpot24hPublicRestBaselineResponse(
      '[{"symbol":"ETHUSDT","lastPrice":"2500.00000000"},{"symbol":"BTCUSDT","lastPrice":"42123.45000000"}]',
    );
    expect(result).toEqual({
      ok: true,
      payload: [
        { symbol: 'ETHUSDT', lastPrice: '2500.00000000' },
        { symbol: 'BTCUSDT', lastPrice: '42123.45000000' },
      ],
    });
  });

  it('rejects malformed JSON text deterministically', () => {
    expect(decodeBinanceSpot24hPublicRestBaselineResponse('{"symbol":"BTCUSDT"'))
      .toEqual({ ok: false, reason: 'invalid-json' });
  });

  it('rejects non-text response data instead of inventing concrete Response/body/binary semantics', () => {
    expect(decodeBinanceSpot24hPublicRestBaselineResponse({ json: true }))
      .toEqual({ ok: false, reason: 'unsupported-response-data' });
    expect(decodeBinanceSpot24hPublicRestBaselineResponse(new Uint8Array([1, 2, 3])))
      .toEqual({ ok: false, reason: 'unsupported-response-data' });
  });
});
