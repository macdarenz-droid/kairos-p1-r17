import type { MarketDataInstrument } from '../../marketDataTypes';

export const BINANCE_SPOT_VENUE = 'binance-spot' as const;
export const BINANCE_SPOT_INITIAL_SYMBOL = 'BTCUSDT' as const;
export const BINANCE_SPOT_TRADE_STREAM_SUFFIX = '@trade' as const;

export type BinanceSpotTradeStreamDescriptor =
  | {
      readonly ok: true;
      readonly venue: typeof BINANCE_SPOT_VENUE;
      readonly symbol: string;
      readonly streamName: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'venue-mismatch' | 'symbol-required';
    };

/**
 * P16.1 owns Binance Spot stream naming only.
 *
 * Binance Spot market-data streams use lowercase symbols in stream names.
 * This owner intentionally does not create transport connections, acquire
 * credentials, discover the symbol catalogue, or mutate journal truth.
 */
export function describeBinanceSpotTradeStream(
  instrument: MarketDataInstrument,
): BinanceSpotTradeStreamDescriptor {
  if (instrument.venue !== BINANCE_SPOT_VENUE) {
    return { ok: false, reason: 'venue-mismatch' };
  }

  const symbol = instrument.symbol.trim();
  if (!symbol) {
    return { ok: false, reason: 'symbol-required' };
  }

  return {
    ok: true,
    venue: BINANCE_SPOT_VENUE,
    symbol,
    streamName: `${symbol.toLowerCase()}${BINANCE_SPOT_TRADE_STREAM_SUFFIX}`,
  };
}
