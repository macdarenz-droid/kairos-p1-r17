import {
  planMarketDataReconnectAttempt,
  type MarketDataReconnectAttempt,
} from './marketDataReconnectAttempt';
import {
  scheduleMarketDataReconnect,
  type MarketDataReconnectSchedule,
  type MarketDataReconnectScheduler,
} from './marketDataReconnectScheduler';
import type { MarketDataDisconnectCause } from './marketDataReconnectDisposition';
import type { MarketDataReconnectPolicy } from './marketDataReconnectPolicy';

export type MarketDataReconnectExecution =
  | {
      readonly kind: 'scheduled';
      readonly attempt: Extract<MarketDataReconnectAttempt, { readonly kind: 'retry' }>;
      readonly schedule: MarketDataReconnectSchedule;
    }
  | Exclude<MarketDataReconnectAttempt, { readonly kind: 'retry' }>;

export function executeMarketDataReconnectAttempt(
  scheduler: MarketDataReconnectScheduler,
  cause: MarketDataDisconnectCause,
  policy: MarketDataReconnectPolicy,
  completedAttempts: number,
  sample: number,
  reconnect: () => void,
  signal?: AbortSignal,
): MarketDataReconnectExecution {
  const attempt = planMarketDataReconnectAttempt(
    cause,
    policy,
    completedAttempts,
    sample,
  );

  if (attempt.kind !== 'retry') {
    return attempt;
  }

  return {
    kind: 'scheduled',
    attempt,
    schedule: scheduleMarketDataReconnect(
      scheduler,
      attempt.plan.delayMs,
      reconnect,
      signal,
    ),
  };
}
