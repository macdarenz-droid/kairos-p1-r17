import { describe, expect, it } from 'vitest';
import { classifyMarketDataReconnectDisposition } from '../src/services/market-data';

describe('P15.10 market-data reconnect disposition semantics', () => {
  it('allows retry for a provider-neutral transient failure', () => {
    expect(
      classifyMarketDataReconnectDisposition({ kind: 'transient-failure' }),
    ).toEqual({ retry: true });
  });

  it('does not retry an intentional close', () => {
    expect(
      classifyMarketDataReconnectDisposition({ kind: 'intentional-close' }),
    ).toEqual({ retry: false, reason: 'intentional-close' });
  });

  it('does not retry a terminal failure', () => {
    expect(
      classifyMarketDataReconnectDisposition({ kind: 'terminal-failure' }),
    ).toEqual({ retry: false, reason: 'terminal-failure' });
  });
});
