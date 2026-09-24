import type { MarketDataConnectionState } from './marketDataTypes';

export type MarketDataConnectionEvent =
  | 'connect-requested'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'reset';

export interface MarketDataConnectionTransition {
  readonly accepted: boolean;
  readonly state: MarketDataConnectionState;
}

const TRANSITIONS: Readonly<
  Record<
    MarketDataConnectionState,
    Partial<Record<MarketDataConnectionEvent, MarketDataConnectionState>>
  >
> = {
  idle: {
    'connect-requested': 'connecting',
    reset: 'idle',
  },
  connecting: {
    connected: 'live',
    disconnected: 'disconnected',
    failed: 'error',
    reset: 'idle',
  },
  live: {
    disconnected: 'disconnected',
    failed: 'error',
    reset: 'idle',
  },
  disconnected: {
    'connect-requested': 'connecting',
    reset: 'idle',
  },
  error: {
    'connect-requested': 'connecting',
    reset: 'idle',
  },
};

export function transitionMarketDataConnectionState(
  current: MarketDataConnectionState,
  event: MarketDataConnectionEvent,
): MarketDataConnectionTransition {
  const next = TRANSITIONS[current][event];
  if (next === undefined) {
    return { accepted: false, state: current };
  }
  return { accepted: true, state: next };
}
