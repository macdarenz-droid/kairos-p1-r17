import type { DecimalString } from '../../domain/trades';
import type { MarketDataUnavailable } from './marketDataTypes';

/**
 * T-061e (D271): the rolling windows Home reads beside the 24-hour prices: Binance's rolling-window ticker, one request
 * for every market on the map. The 24-hour move comes with the prices (LiveMarketSummaryBaselineAcquisitionPort).
 */
export type MarketMovesWindow = '1h' | '7d';

/** Binance takes at most 100 symbols a request; a longer list is asked in batches. */
export const MARKET_MOVES_MAX_SYMBOLS = 100;

export interface MarketMovesRequest {
  /** Binance Spot symbols, each once. */
  readonly symbols: readonly string[];
  readonly window: MarketMovesWindow;
}

/** One market's price when the window opened and its last price, as the source wrote them. The move is the owner's. */
export interface MarketMove {
  readonly symbol: string;
  readonly open: DecimalString;
  readonly last: DecimalString;
}

/** Every requested market in the requested order, and when the source read them; or why not. */
export type MarketMovesResult =
  | Readonly<{ ok: true; observedAt: string; moves: readonly MarketMove[] }>
  | MarketDataUnavailable;

/** Acquisition only: callers own the cadence, freshness, the request budget and what a move means. */
export interface MarketMovesPort {
  acquireMoves(request: MarketMovesRequest, options?: Readonly<{ signal?: AbortSignal }>): Promise<MarketMovesResult>;
}
