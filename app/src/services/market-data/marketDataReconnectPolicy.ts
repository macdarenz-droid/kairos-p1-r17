export interface MarketDataReconnectPolicy {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxAttempts: number;
}

export type MarketDataReconnectDecision =
  | { readonly retry: true; readonly delayMs: number; readonly nextAttempt: number }
  | { readonly retry: false; readonly reason: 'attempt-limit' | 'invalid-policy' };

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function decideMarketDataReconnect(
  policy: MarketDataReconnectPolicy,
  completedAttempts: number,
): MarketDataReconnectDecision {
  if (
    !isNonNegativeSafeInteger(policy.initialDelayMs)
    || !isNonNegativeSafeInteger(policy.maxDelayMs)
    || !isNonNegativeSafeInteger(policy.maxAttempts)
    || policy.initialDelayMs > policy.maxDelayMs
    || !isNonNegativeSafeInteger(completedAttempts)
  ) {
    return { retry: false, reason: 'invalid-policy' };
  }

  if (completedAttempts >= policy.maxAttempts) {
    return { retry: false, reason: 'attempt-limit' };
  }

  const exponentialDelay = policy.initialDelayMs * (2 ** completedAttempts);
  const delayMs = Math.min(
    Number.isSafeInteger(exponentialDelay) ? exponentialDelay : policy.maxDelayMs,
    policy.maxDelayMs,
  );

  return {
    retry: true,
    delayMs,
    nextAttempt: completedAttempts + 1,
  };
}
