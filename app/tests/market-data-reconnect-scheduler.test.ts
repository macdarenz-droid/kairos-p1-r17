import { describe, expect, it, vi } from 'vitest';
import { scheduleMarketDataReconnect } from '../src/services/market-data';

function createFakeScheduler() {
  let callback: (() => void) | null = null;
  const handle = Symbol('retry');
  const schedule = vi.fn((next: () => void, _delayMs: number) => {
    callback = next;
    return handle;
  });
  const cancel = vi.fn();

  return {
    scheduler: { schedule, cancel },
    fire: () => callback?.(),
    handle,
    schedule,
    cancel,
  };
}

describe('P15.6 market-data reconnect scheduler lifecycle', () => {
  it('schedules one reconnect using the supplied delay', () => {
    const fake = createFakeScheduler();
    const reconnect = vi.fn();

    scheduleMarketDataReconnect(fake.scheduler, 1_500, reconnect);

    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule.mock.calls[0]?.[1]).toBe(1_500);

    fake.fire();
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry explicitly and prevents reconnect', () => {
    const fake = createFakeScheduler();
    const reconnect = vi.fn();
    const scheduled = scheduleMarketDataReconnect(fake.scheduler, 500, reconnect);

    scheduled.cancel();
    scheduled.cancel();
    fake.fire();

    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(fake.cancel).toHaveBeenCalledWith(fake.handle);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('cancels a pending retry when its AbortSignal aborts', () => {
    const fake = createFakeScheduler();
    const reconnect = vi.fn();
    const controller = new AbortController();

    scheduleMarketDataReconnect(fake.scheduler, 500, reconnect, controller.signal);
    controller.abort();
    fake.fire();

    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('does not schedule when supplied an already-aborted signal', () => {
    const fake = createFakeScheduler();
    const controller = new AbortController();
    controller.abort();

    scheduleMarketDataReconnect(fake.scheduler, 500, vi.fn(), controller.signal);

    expect(fake.schedule).not.toHaveBeenCalled();
    expect(fake.cancel).not.toHaveBeenCalled();
  });

  it('does not cancel after the reconnect has already fired', () => {
    const fake = createFakeScheduler();
    const reconnect = vi.fn();
    const scheduled = scheduleMarketDataReconnect(fake.scheduler, 500, reconnect);

    fake.fire();
    scheduled.cancel();

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(fake.cancel).not.toHaveBeenCalled();
  });
});
