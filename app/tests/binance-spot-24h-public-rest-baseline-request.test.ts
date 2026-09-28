import { describe, expect, it } from 'vitest';
import {
  BINANCE_SPOT_24H_TICKER_PATH,
  BINANCE_SPOT_24H_TICKER_RESPONSE_TYPE,
  BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL,
  describeBinanceSpot24hPublicRestBaselineRequest,
} from '../src/services/market-data';

describe('P21.7 Binance Spot 24h public REST baseline request descriptor foundation', () => {
  it('describes one explicit Binance Spot instrument with symbol and FULL response type', () => {
    const result = describeBinanceSpot24hPublicRestBaselineRequest([
      { venue: 'binance-spot', symbol: ' BTCUSDT ' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toEqual({
      venue: 'binance-spot',
      method: 'GET',
      baseUrl: 'https://data-api.binance.vision',
      path: '/api/v3/ticker/24hr',
      responseType: 'FULL',
      symbols: ['BTCUSDT'],
      query: 'symbol=BTCUSDT&type=FULL',
      url: 'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT&type=FULL',
    });
  });

  it('describes multiple explicit symbols with encoded symbols JSON while preserving caller sequence only for construction', () => {
    const result = describeBinanceSpot24hPublicRestBaselineRequest([
      { venue: 'binance-spot', symbol: 'ETHUSDT' },
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.symbols).toEqual(['ETHUSDT', 'BTCUSDT']);
    expect(result.request.query).toBe(`symbols=${encodeURIComponent('["ETHUSDT","BTCUSDT"]')}&type=FULL`);
  });

  it('rejects empty scope, foreign venues, empty symbols and duplicates rather than broadening request scope', () => {
    expect(describeBinanceSpot24hPublicRestBaselineRequest([])).toEqual({ ok: false, reason: 'scope-required' });
    expect(describeBinanceSpot24hPublicRestBaselineRequest([{ venue: 'other', symbol: 'BTCUSDT' }]))
      .toEqual({ ok: false, reason: 'venue-mismatch' });
    expect(describeBinanceSpot24hPublicRestBaselineRequest([{ venue: 'binance-spot', symbol: ' ' }]))
      .toEqual({ ok: false, reason: 'symbol-required' });
    expect(describeBinanceSpot24hPublicRestBaselineRequest([
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
      { venue: 'binance-spot', symbol: 'BTCUSDT' },
    ])).toEqual({ ok: false, reason: 'duplicate-symbol' });
  });

  it('pins only the documented public market-data base, 24h ticker path and FULL shape', () => {
    expect(BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL).toBe('https://data-api.binance.vision');
    expect(BINANCE_SPOT_24H_TICKER_PATH).toBe('/api/v3/ticker/24hr');
    expect(BINANCE_SPOT_24H_TICKER_RESPONSE_TYPE).toBe('FULL');
  });
});
