import type { MarketDataSubscription } from './marketDataTypes';

export type MarketDataSubscriptionLifecycle = {
  readonly subscription: MarketDataSubscription;
  readonly close: () => void;
};

/**
 * Owns idempotent subscription shutdown and optional AbortSignal binding.
 *
 * This helper does not create a transport, reconnect, poll, persist, or mutate
 * journal truth. It only coordinates the lifecycle of an already-created
 * MarketDataSubscription.
 */
export function bindMarketDataSubscriptionLifecycle(
  subscription: MarketDataSubscription,
  signal?: AbortSignal,
): MarketDataSubscriptionLifecycle {
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', close);
    subscription.close();
  };

  if (signal?.aborted) {
    close();
  } else {
    signal?.addEventListener('abort', close, { once: true });
  }

  return { subscription, close };
}
