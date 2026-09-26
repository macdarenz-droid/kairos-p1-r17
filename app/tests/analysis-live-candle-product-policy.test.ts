import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT,
  ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY,
} from '../src/app/analysisLiveCandleProductPolicy';
import { decideMarketDataReconnect } from '../src/services/market-data/marketDataReconnectPolicy';

describe('Analysis live candle product policy', () => {
  it('shares the released 500-candle authoritative history limit', () => {
    expect(ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT).toBe(500);
  });

  it('publishes one immutable bounded reconnect policy', () => {
    expect(ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY).toEqual({
      initialDelayMs: 1_000,
      maxDelayMs: 8_000,
      maxAttempts: 4,
    });
    expect(Object.isFrozen(ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY)).toBe(true);
  });

  it('delegates exponential delay and attempt-limit decisions to released P15', () => {
    expect([0, 1, 2, 3].map(completed => decideMarketDataReconnect(
      ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY,
      completed,
    ))).toEqual([
      { retry: true, delayMs: 1_000, nextAttempt: 1 },
      { retry: true, delayMs: 2_000, nextAttempt: 2 },
      { retry: true, delayMs: 4_000, nextAttempt: 3 },
      { retry: true, delayMs: 8_000, nextAttempt: 4 },
    ]);
    expect(decideMarketDataReconnect(ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY, 4))
      .toEqual({ retry: false, reason: 'attempt-limit' });
  });
});
