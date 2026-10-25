import { describe, expect, it } from 'vitest';
import { planNextMarketDataReconnect } from '../src/services/market-data';

const policy = {
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxAttempts: 4,
} as const;

describe('P15.8 market-data reconnect plan semantics', () => {
  it('composes the bounded policy delay with full jitter', () => {
    expect(planNextMarketDataReconnect(policy, 0, 0.5)).toEqual({
      kind: 'retry',
      attempt: 0,
      baseDelayMs: 1_000,
      delayMs: 500,
    });

    expect(planNextMarketDataReconnect(policy, 3, 0.25)).toEqual({
      kind: 'retry',
      attempt: 3,
      baseDelayMs: 8_000,
      delayMs: 2_000,
    });
  });

  it('preserves the policy attempt limit without scheduling', () => {
    expect(planNextMarketDataReconnect(policy, 5, 0.5)).toEqual({
      kind: 'stop',
      reason: 'attempt-limit',
    });
  });

  it('maps invalid policy to one explicit plan result', () => {
    expect(
      planNextMarketDataReconnect(
        { initialDelayMs: 9_000, maxDelayMs: 8_000, maxAttempts: 4 },
        1,
        0.5,
      ),
    ).toEqual({ kind: 'invalid', reason: 'invalid-policy' });
  });

  it('maps invalid jitter samples to one explicit plan result', () => {
    expect(planNextMarketDataReconnect(policy, 1, 1.01)).toEqual({
      kind: 'invalid',
      reason: 'invalid-sample',
    });
  });

  it('does not require a sample once the attempt limit is reached', () => {
    expect(planNextMarketDataReconnect(policy, 5, Number.NaN)).toEqual({
      kind: 'stop',
      reason: 'attempt-limit',
    });
  });
});
