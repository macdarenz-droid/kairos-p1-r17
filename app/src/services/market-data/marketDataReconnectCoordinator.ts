import {
  planNextMarketDataReconnect,
  type MarketDataReconnectPlan,
} from './marketDataReconnectPlan';
import {
  scheduleMarketDataReconnect,
  type MarketDataReconnectSchedule,
  type MarketDataReconnectScheduler,
} from './marketDataReconnectScheduler';
import type { MarketDataReconnectPolicy } from './marketDataReconnectPolicy';

export type MarketDataReconnectCoordinationResult =
  | {
      readonly kind: 'scheduled';
      readonly plan: Extract<MarketDataReconnectPlan, { readonly kind: 'retry' }>;
      readonly schedule: MarketDataReconnectSchedule;
    }
  | {
      readonly kind: 'stop';
      readonly reason: 'attempt-limit';
    }
  | {
      readonly kind: 'invalid';
      readonly reason: 'invalid-policy' | 'invalid-sample';
    };

export function coordinateNextMarketDataReconnect(
  scheduler: MarketDataReconnectScheduler,
  policy: MarketDataReconnectPolicy,
  completedAttempts: number,
  sample: number,
  reconnect: () => void,
  signal?: AbortSignal,
): MarketDataReconnectCoordinationResult {
  const plan = planNextMarketDataReconnect(policy, completedAttempts, sample);

  if (plan.kind === 'invalid') {
    return plan;
  }

  if (plan.kind === 'stop') {
    return plan;
  }

  return {
    kind: 'scheduled',
    plan,
    schedule: scheduleMarketDataReconnect(
      scheduler,
      plan.delayMs,
      reconnect,
      signal,
    ),
  };
}
