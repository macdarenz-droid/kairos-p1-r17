import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';
import { BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL } from './binanceSpot24hPublicRestBaselineRequest';

export const BINANCE_SPOT_EXCHANGE_INFO_PATH = '/api/v3/exchangeInfo' as const;

export interface BinanceSpotExchangeInfoPublicRestRequestDescriptor {
  readonly venue: typeof BINANCE_SPOT_VENUE;
  readonly method: 'GET';
  readonly baseUrl: typeof BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL;
  readonly path: typeof BINANCE_SPOT_EXCHANGE_INFO_PATH;
  readonly query: '';
  readonly url: string;
}

/**
 * Describes only the public Binance Spot exchange-information request.
 * Execution, decoding, metadata mapping, caching and universe policy stay outside this owner.
 */
export function describeBinanceSpotExchangeInfoPublicRestRequest(): BinanceSpotExchangeInfoPublicRestRequestDescriptor {
  return {
    venue: BINANCE_SPOT_VENUE,
    method: 'GET',
    baseUrl: BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL,
    path: BINANCE_SPOT_EXCHANGE_INFO_PATH,
    query: '',
    url: `${BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL}${BINANCE_SPOT_EXCHANGE_INFO_PATH}`,
  };
}
