import { describe, expect, it } from 'vitest';
import { planMarketDataReconnectAttempt } from '../src/services/market-data';

const policy = {
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxAttempts: 4,
} as const;

describe('P15.12 market-data reconnect attempt semantics', () => {
  it('plans a retry only after transient reconnect intent is accepted', () => {
    expect(
      planMarketDataReconnectAttempt(
        { kind: 'transient-failure' },
        policy,
        0,
        0.5,
      ),
    ).toEqual({
      kind: 'retry',
      plan: {
        kind: 'retry',
        attempt: 0,
        baseDelayMs: 1_000,
        delayMs: 500,
      },
    });
  });

  it('stops intentional close before sample validation', () => {
    expect(
      planMarketDataReconnectAttempt(
        { kind: 'intentional-close' },
        policy,
        0,
        Number.NaN,
      ),
    ).toEqual({ kind: 'stop', reason: 'intentional-close' });
  });

  it('stops terminal failure before sample validation', () => {
    expect(
      planMarketDataReconnectAttempt(
        { kind: 'terminal-failure' },
        policy,
        0,
        Number.NaN,
      ),
    ).toEqual({ kind: 'stop', reason: 'terminal-failure' });
  });

  it('preserves the bounded attempt limit for transient failures', () => {
    expect(
      planMarketDataReconnectAttempt(
        { kind: 'transient-failure' },
        policy,
        4,
        Number.NaN,
      ),
    ).toEqual({ kind: 'stop', reason: 'attempt-limit' });
  });

  it('preserves invalid planning results for transient failures', () => {
    expect(
      planMarketDataReconnectAttempt(
        { kind: 'transient-failure' },
        policy,
        0,
        1.01,
      ),
    ).toEqual({ kind: 'invalid', reason: 'invalid-sample' });
  });
});
