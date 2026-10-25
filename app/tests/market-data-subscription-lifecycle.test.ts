import { describe, expect, it, vi } from 'vitest';
import { bindMarketDataSubscriptionLifecycle } from '../src/services/market-data';

describe('P15.3 market-data subscription lifecycle', () => {
  it('closes an active subscription when its AbortSignal aborts', () => {
    const controller = new AbortController();
    const close = vi.fn();

    bindMarketDataSubscriptionLifecycle({ close }, controller.signal);
    controller.abort();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes immediately when supplied an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const close = vi.fn();

    bindMarketDataSubscriptionLifecycle({ close }, controller.signal);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit close idempotent and prevents later abort double-close', () => {
    const controller = new AbortController();
    const underlyingClose = vi.fn();
    const lifecycle = bindMarketDataSubscriptionLifecycle(
      { close: underlyingClose },
      controller.signal,
    );

    lifecycle.close();
    lifecycle.close();
    controller.abort();

    expect(underlyingClose).toHaveBeenCalledTimes(1);
  });

  it('works without an AbortSignal and remains explicitly closeable', () => {
    const underlyingClose = vi.fn();
    const lifecycle = bindMarketDataSubscriptionLifecycle({ close: underlyingClose });

    lifecycle.close();

    expect(underlyingClose).toHaveBeenCalledTimes(1);
  });
});
