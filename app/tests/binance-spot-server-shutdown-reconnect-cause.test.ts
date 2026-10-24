import { describe, expect, it } from 'vitest';
import { resolveBinanceSpotServerShutdownReconnectCause } from '../src/services/market-data/providers/binance/binanceSpotServerShutdownReconnectCause';

describe('P16.14 Binance Spot serverShutdown reconnect cause', () => {
  it('maps valid serverShutdown evidence to the P15 transient-failure cause without inventing time', () => {
    const result = resolveBinanceSpotServerShutdownReconnectCause(JSON.stringify({ e: 'serverShutdown', E: 1725345600123 }));
    expect(result).toEqual({ kind: 'server-shutdown', eventTime: 1725345600123, cause: { kind: 'transient-failure' } });
  });

  it('does not treat normal trade traffic as shutdown evidence', () => {
    expect(resolveBinanceSpotServerShutdownReconnectCause(JSON.stringify({ e: 'trade', E: 1 }))).toEqual({ kind: 'not-server-shutdown' });
  });

  it('preserves decode failure rather than scheduling or guessing', () => {
    expect(resolveBinanceSpotServerShutdownReconnectCause('{')).toEqual({ kind: 'invalid-message', reason: 'invalid-json' });
  });
});
