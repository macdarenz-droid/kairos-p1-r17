import {
  decideMarketDataReconnect,
  type MarketDataReconnectPolicy,
} from './marketDataReconnectPolicy';
import { applyMarketDataReconnectFullJitter } from './marketDataReconnectJitter';

export type MarketDataReconnectPlan =
  | {
      readonly kind: 'retry';
      readonly attempt: number;
      readonly baseDelayMs: number;
      readonly delayMs: number;
    }
  | {
      readonly kind: 'stop';
      readonly reason: 'attempt-limit';
    }
  | {
      readonly kind: 'invalid';
      readonly reason: 'invalid-policy' | 'invalid-sample';
    };

export function planNextMarketDataReconnect(
  policy: MarketDataReconnectPolicy,
  attempt: number,
  sample: number,
): MarketDataReconnectPlan {
  const decision = decideMarketDataReconnect(policy, attempt);

  if (!decision.retry) {
    return decision.reason === 'attempt-limit'
      ? { kind: 'stop', reason: 'attempt-limit' }
      : { kind: 'invalid', reason: 'invalid-policy' };
  }

  const jitter = applyMarketDataReconnectFullJitter(decision.delayMs, sample);

  if (!jitter.accepted) {
    return { kind: 'invalid', reason: 'invalid-sample' };
  }

  return {
    kind: 'retry',
    attempt,
    baseDelayMs: decision.delayMs,
    delayMs: jitter.delayMs,
  };
}
