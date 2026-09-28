import {
  classifyMarketDataReconnectDisposition,
  type MarketDataDisconnectCause,
} from './marketDataReconnectDisposition';
import type { MarketDataReconnectPolicy } from './marketDataReconnectPolicy';

export type MarketDataReconnectIntent =
  | {
      readonly kind: 'retry';
      readonly policy: MarketDataReconnectPolicy;
      readonly completedAttempts: number;
    }
  | {
      readonly kind: 'stop';
      readonly reason: 'intentional-close' | 'terminal-failure';
    };

export function resolveMarketDataReconnectIntent(
  cause: MarketDataDisconnectCause,
  policy: MarketDataReconnectPolicy,
  completedAttempts: number,
): MarketDataReconnectIntent {
  const disposition = classifyMarketDataReconnectDisposition(cause);

  if (!disposition.retry) {
    return {
      kind: 'stop',
      reason: disposition.reason,
    };
  }

  return {
    kind: 'retry',
    policy,
    completedAttempts,
  };
}
