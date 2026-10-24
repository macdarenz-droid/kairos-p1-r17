import { describe, expect, it } from 'vitest';
import { transitionMarketDataConnectionState } from '../src/services/market-data';

describe('P15.4 market-data connection state semantics', () => {
  it('moves idle -> connecting -> live on accepted connection events', () => {
    expect(transitionMarketDataConnectionState('idle', 'connect-requested')).toEqual({
      accepted: true,
      state: 'connecting',
    });
    expect(transitionMarketDataConnectionState('connecting', 'connected')).toEqual({
      accepted: true,
      state: 'live',
    });
  });

  it('represents transport loss separately from explicit failure', () => {
    expect(transitionMarketDataConnectionState('live', 'disconnected')).toEqual({
      accepted: true,
      state: 'disconnected',
    });
    expect(transitionMarketDataConnectionState('live', 'failed')).toEqual({
      accepted: true,
      state: 'error',
    });
  });

  it('permits a new connection attempt after disconnect or error', () => {
    expect(transitionMarketDataConnectionState('disconnected', 'connect-requested')).toEqual({
      accepted: true,
      state: 'connecting',
    });
    expect(transitionMarketDataConnectionState('error', 'connect-requested')).toEqual({
      accepted: true,
      state: 'connecting',
    });
  });

  it('rejects impossible transitions without silently changing state', () => {
    expect(transitionMarketDataConnectionState('idle', 'connected')).toEqual({
      accepted: false,
      state: 'idle',
    });
    expect(transitionMarketDataConnectionState('live', 'connect-requested')).toEqual({
      accepted: false,
      state: 'live',
    });
  });

  it('supports deterministic reset to idle from every state', () => {
    for (const state of ['idle', 'connecting', 'live', 'disconnected', 'error'] as const) {
      expect(transitionMarketDataConnectionState(state, 'reset')).toEqual({
        accepted: true,
        state: 'idle',
      });
    }
  });
});
