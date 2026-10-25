import { describe, expect, it, vi } from 'vitest';
import {
  coordinateNextMarketDataReconnect,
  type MarketDataReconnectScheduler,
} from '../src/services/market-data';

const policy = {
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxAttempts: 4,
} as const;

function createScheduler() {
  let callback: (() => void) | undefined;
  const handle = Symbol('scheduled-reconnect');
  const schedule = vi.fn((next: () => void, _delayMs: number) => {
    callback = next;
    return handle;
  });
  const cancel = vi.fn((_handle: unknown) => undefined);

  const scheduler: MarketDataReconnectScheduler = { schedule, cancel };

  return {
    scheduler,
    schedule,
    cancel,
    fire: () => callback?.(),
    handle,
  };
}

describe('P15.9 market-data reconnect coordinator semantics', () => {
  it('plans then schedules exactly one retry using the jittered delay', () => {
    const fake = createScheduler();
    const reconnect = vi.fn();

    const result = coordinateNextMarketDataReconnect(
      fake.scheduler,
      policy,
      0,
      0.5,
      reconnect,
    );

    expect(result.kind).toBe('scheduled');
    if (result.kind !== 'scheduled') throw new Error('expected scheduled result');

    expect(result.plan).toEqual({
      kind: 'retry',
      attempt: 0,
      baseDelayMs: 1_000,
      delayMs: 500,
    });
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule).toHaveBeenCalledWith(expect.any(Function), 500);

    fake.fire();
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('does not schedule after the attempt limit', () => {
    const fake = createScheduler();

    expect(
      coordinateNextMarketDataReconnect(
        fake.scheduler,
        policy,
        4,
        0.5,
        vi.fn(),
      ),
    ).toEqual({ kind: 'stop', reason: 'attempt-limit' });

    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it('does not schedule an invalid policy', () => {
    const fake = createScheduler();

    expect(
      coordinateNextMarketDataReconnect(
        fake.scheduler,
        { initialDelayMs: 9_000, maxDelayMs: 8_000, maxAttempts: 4 },
        0,
        0.5,
        vi.fn(),
      ),
    ).toEqual({ kind: 'invalid', reason: 'invalid-policy' });

    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it('does not schedule an invalid jitter sample', () => {
    const fake = createScheduler();

    expect(
      coordinateNextMarketDataReconnect(
        fake.scheduler,
        policy,
        0,
        Number.NaN,
        vi.fn(),
      ),
    ).toEqual({ kind: 'invalid', reason: 'invalid-sample' });

    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it('delegates abort cancellation to the P15.6 scheduler owner', () => {
    const fake = createScheduler();
    const controller = new AbortController();
    const reconnect = vi.fn();

    const result = coordinateNextMarketDataReconnect(
      fake.scheduler,
      policy,
      0,
      1,
      reconnect,
      controller.signal,
    );

    expect(result.kind).toBe('scheduled');
    controller.abort();

    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(fake.cancel).toHaveBeenCalledWith(fake.handle);

    fake.fire();
    expect(reconnect).not.toHaveBeenCalled();
  });
});
