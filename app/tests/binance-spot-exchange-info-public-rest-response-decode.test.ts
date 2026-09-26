import { describe, expect, it } from 'vitest';
import { decodeBinanceSpotExchangeInfoPublicRestResponse } from '../src/services/market-data';

describe('Binance Spot exchangeInfo public REST response decode foundation', () => {
  it('decodes exchangeInfo JSON text without interpreting provider metadata semantics', () => {
    const result = decodeBinanceSpotExchangeInfoPublicRestResponse(
      '{"timezone":"UTC","symbols":[{"symbol":"BTCUSDT","status":"TRADING","baseAsset":"BTC","quoteAsset":"USDT"}]}',
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        timezone: 'UTC',
        symbols: [
          {
            symbol: 'BTCUSDT',
            status: 'TRADING',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
          },
        ],
      },
    });
  });

  it('preserves arbitrary valid JSON payload shape for a later semantic mapper', () => {
    expect(decodeBinanceSpotExchangeInfoPublicRestResponse('[]')).toEqual({
      ok: true,
      payload: [],
    });
    expect(decodeBinanceSpotExchangeInfoPublicRestResponse('null')).toEqual({
      ok: true,
      payload: null,
    });
  });

  it('rejects malformed JSON text deterministically', () => {
    expect(decodeBinanceSpotExchangeInfoPublicRestResponse('{"symbols":['))
      .toEqual({ ok: false, reason: 'invalid-json' });
  });

  it('rejects non-text response data instead of inventing Response/body/binary semantics', () => {
    expect(decodeBinanceSpotExchangeInfoPublicRestResponse({ symbols: [] }))
      .toEqual({ ok: false, reason: 'unsupported-response-data' });
    expect(decodeBinanceSpotExchangeInfoPublicRestResponse(new Uint8Array([1, 2, 3])))
      .toEqual({ ok: false, reason: 'unsupported-response-data' });
  });
});
