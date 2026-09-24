import { describe, expect, it } from 'vitest';
import {
  BINANCE_SPOT_INITIAL_SYMBOL,
  BINANCE_SPOT_VENUE,
  describeBinanceSpotTradeStream,
} from '../src/services/market-data';

describe('P16.1 Binance Spot trade stream semantics', () => {
  it('uses BTCUSDT only as the initial proving symbol and lowercases the stream symbol', () => {
    expect(BINANCE_SPOT_INITIAL_SYMBOL).toBe('BTCUSDT');

    expect(
      describeBinanceSpotTradeStream({
        venue: BINANCE_SPOT_VENUE,
        symbol: 'BTCUSDT',
      }),
    ).toEqual({
      ok: true,
      venue: 'binance-spot',
      symbol: 'BTCUSDT',
      streamName: 'btcusdt@trade',
    });
  });

  it('remains data-driven for other Binance Spot symbols', () => {
    expect(
      describeBinanceSpotTradeStream({
        venue: BINANCE_SPOT_VENUE,
        symbol: 'ETHUSDT',
      }),
    ).toEqual({
      ok: true,
      venue: 'binance-spot',
      symbol: 'ETHUSDT',
      streamName: 'ethusdt@trade',
    });
  });

  it('rejects a non-Binance-Spot venue', () => {
    expect(
      describeBinanceSpotTradeStream({
        venue: 'other-venue',
        symbol: 'BTCUSDT',
      }),
    ).toEqual({ ok: false, reason: 'venue-mismatch' });
  });

  it('rejects an empty symbol', () => {
    expect(
      describeBinanceSpotTradeStream({
        venue: BINANCE_SPOT_VENUE,
        symbol: '   ',
      }),
    ).toEqual({ ok: false, reason: 'symbol-required' });
  });
});
