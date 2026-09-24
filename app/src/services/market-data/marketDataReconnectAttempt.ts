import {
  resolveMarketDataReconnectIntent,
  type MarketDataReconnectIntent,
} from './marketDataReconnectIntent';
import {
  planNextMarketDataReconnect,
  type MarketDataReconnectPlan,
} from './marketDataReconnectPlan';
import type { MarketDataDisconnectCause } from './marketDataReconnectDisposition';
import type { MarketDataReconnectPolicy } from './marketDataReconnectPolicy';

export type MarketDataReconnectAttempt =
  | {
      readonly kind: 'retry';
      readonly plan: Extract<MarketDataReconnectPlan, { readonly kind: 'retry' }>;
    }
  | {
      readonly kind: 'stop';
      readonly reason:
        | 'intentional-close'
        | 'terminal-failure'
        | 'attempt-limit';
    }
  | {
      readonly kind: 'invalid';
      readonly reason: 'invalid-policy' | 'invalid-sample';
    };

export function planMarketDataReconnectAttempt(
  cause: MarketDataDisconnectCause,
  policy: MarketDataReconnectPolicy,
  completedAttempts: number,
  sample: number,
): MarketDataReconnectAttempt {
  const intent: MarketDataReconnectIntent = resolveMarketDataReconnectIntent(
    cause,
    policy,
    completedAttempts,
  );

  if (intent.kind === 'stop') {
    return intent;
  }

  const plan = planNextMarketDataReconnect(
    intent.policy,
    intent.completedAttempts,
    sample,
  );

  if (plan.kind === 'retry') {
    return { kind: 'retry', plan };
  }

  return plan;
}
