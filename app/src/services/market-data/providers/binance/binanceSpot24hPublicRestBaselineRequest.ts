import type { MarketDataInstrument } from '../../marketDataTypes';
import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';

export const BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL = 'https://data-api.binance.vision' as const;
export const BINANCE_SPOT_24H_TICKER_PATH = '/api/v3/ticker/24hr' as const;
export const BINANCE_SPOT_24H_TICKER_RESPONSE_TYPE = 'FULL' as const;

export interface BinanceSpot24hPublicRestBaselineRequestDescriptor {
  readonly venue: typeof BINANCE_SPOT_VENUE;
  readonly method: 'GET';
  readonly baseUrl: typeof BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL;
  readonly path: typeof BINANCE_SPOT_24H_TICKER_PATH;
  readonly responseType: typeof BINANCE_SPOT_24H_TICKER_RESPONSE_TYPE;
  readonly symbols: readonly string[];
  readonly query: string;
  readonly url: string;
}

export type BinanceSpot24hPublicRestBaselineRequestResult =
  | { readonly ok: true; readonly request: BinanceSpot24hPublicRestBaselineRequestDescriptor }
  | {
      readonly ok: false;
      readonly reason: 'scope-required' | 'venue-mismatch' | 'symbol-required' | 'duplicate-symbol';
    };

/**
 * Describes only the public Binance Spot REST request for an explicit caller scope.
 * Execution, decoding, batching, request-weight policy and acquisition orchestration stay outside this owner.
 */
export function describeBinanceSpot24hPublicRestBaselineRequest(
  scope: readonly MarketDataInstrument[],
): BinanceSpot24hPublicRestBaselineRequestResult {
  if (scope.length === 0) return { ok: false, reason: 'scope-required' };

  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const instrument of scope) {
    if (instrument.venue !== BINANCE_SPOT_VENUE) return { ok: false, reason: 'venue-mismatch' };
    const symbol = instrument.symbol.trim();
    if (!symbol) return { ok: false, reason: 'symbol-required' };
    if (seen.has(symbol)) return { ok: false, reason: 'duplicate-symbol' };
    seen.add(symbol);
    symbols.push(symbol);
  }

  const scopeQuery = symbols.length === 1
    ? `symbol=${encodeURIComponent(symbols[0])}`
    : `symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const query = `${scopeQuery}&type=${BINANCE_SPOT_24H_TICKER_RESPONSE_TYPE}`;
  return {
    ok: true,
    request: {
      venue: BINANCE_SPOT_VENUE,
      method: 'GET',
      baseUrl: BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL,
      path: BINANCE_SPOT_24H_TICKER_PATH,
      responseType: BINANCE_SPOT_24H_TICKER_RESPONSE_TYPE,
      symbols,
      query,
      url: `${BINANCE_SPOT_PUBLIC_REST_MARKET_DATA_BASE_URL}${BINANCE_SPOT_24H_TICKER_PATH}?${query}`,
    },
  };
}
