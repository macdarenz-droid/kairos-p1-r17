import { describe, expect, it } from 'vitest';
import {
  BINANCE_SPOT_EXCHANGE_INFO_PATH,
  BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL,
  describeBinanceSpotExchangeInfoPublicRestRequest,
} from '../src/services/market-data';

describe('Binance Spot exchangeInfo public REST request descriptor foundation', () => {
  it('describes the public all-symbol exchange information request without product filtering', () => {
    expect(describeBinanceSpotExchangeInfoPublicRestRequest()).toEqual({
      venue: 'binance-spot',
      method: 'GET',
      baseUrl: 'https://data-api.binance.vision',
      path: '/api/v3/exchangeInfo',
      query: 'permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false',
      url: 'https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false',
    });
  });

  it('reuses the released public market-data base and pins only the exchangeInfo path', () => {
    expect(BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL).toBe('https://data-api.binance.vision');
    expect(BINANCE_SPOT_EXCHANGE_INFO_PATH).toBe('/api/v3/exchangeInfo');
  });
});
