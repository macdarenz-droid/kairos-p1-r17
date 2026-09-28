import { describe, expect, it } from 'vitest';
import { resolveMarketDataReconnectIntent } from '../src/services/market-data';

const policy = {
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxAttempts: 4,
} as const;

describe('P15.11 market-data reconnect intent semantics', () => {
  it('preserves retry inputs for a transient failure', () => {
    expect(
      resolveMarketDataReconnectIntent(
        { kind: 'transient-failure' },
        policy,
        2,
      ),
    ).toEqual({
      kind: 'retry',
      policy,
      completedAttempts: 2,
    });
  });

  it('stops an intentional close before retry planning', () => {
    expect(
      resolveMarketDataReconnectIntent(
        { kind: 'intentional-close' },
        policy,
        2,
      ),
    ).toEqual({
      kind: 'stop',
      reason: 'intentional-close',
    });
  });

  it('stops a terminal failure before retry planning', () => {
    expect(
      resolveMarketDataReconnectIntent(
        { kind: 'terminal-failure' },
        policy,
        2,
      ),
    ).toEqual({
      kind: 'stop',
      reason: 'terminal-failure',
    });
  });
});
