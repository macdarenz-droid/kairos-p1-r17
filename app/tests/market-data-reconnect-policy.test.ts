import { describe, expect, it } from 'vitest';
import { decideMarketDataReconnect } from '../src/services/market-data';

const policy = {
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  maxAttempts: 5,
} as const;

describe('P15.5 market-data reconnect policy', () => {
  it('uses deterministic capped exponential backoff', () => {
    expect(decideMarketDataReconnect(policy, 0)).toEqual({ retry: true, delayMs: 500, nextAttempt: 1 });
    expect(decideMarketDataReconnect(policy, 1)).toEqual({ retry: true, delayMs: 1_000, nextAttempt: 2 });
    expect(decideMarketDataReconnect(policy, 4)).toEqual({ retry: true, delayMs: 8_000, nextAttempt: 5 });
  });

  it('stops at the configured attempt limit', () => {
    expect(decideMarketDataReconnect(policy, 5)).toEqual({ retry: false, reason: 'attempt-limit' });
    expect(decideMarketDataReconnect(policy, 6)).toEqual({ retry: false, reason: 'attempt-limit' });
  });

  it('rejects invalid policies explicitly', () => {
    expect(decideMarketDataReconnect({ ...policy, initialDelayMs: -1 }, 0)).toEqual({
      retry: false,
      reason: 'invalid-policy',
    });
    expect(decideMarketDataReconnect({ ...policy, initialDelayMs: 9_000 }, 0)).toEqual({
      retry: false,
      reason: 'invalid-policy',
    });
    expect(decideMarketDataReconnect({ ...policy, maxAttempts: Number.POSITIVE_INFINITY }, 0)).toEqual({
      retry: false,
      reason: 'invalid-policy',
    });
  });

  it('rejects invalid completed-attempt counters', () => {
    expect(decideMarketDataReconnect(policy, -1)).toEqual({ retry: false, reason: 'invalid-policy' });
    expect(decideMarketDataReconnect(policy, 0.5)).toEqual({ retry: false, reason: 'invalid-policy' });
  });

  it('owns policy only and does not schedule timers itself', () => {
    expect(decideMarketDataReconnect({ initialDelayMs: 0, maxDelayMs: 0, maxAttempts: 1 }, 0))
      .toEqual({ retry: true, delayMs: 0, nextAttempt: 1 });
  });
});
