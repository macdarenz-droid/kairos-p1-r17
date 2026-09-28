import { describe, expect, it, vi } from 'vitest';
import {
  createHomeDashboardLiveMarketSummaryAcquisitionLifecycle,
  type HomeDashboardLiveMarketSummaryAcquisitionLifecycleSchedulerClock,
} from '../src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionLifecycleScheduler';
import type {
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult,
} from '../src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { MarketDataInstrument } from '../src/services/market-data/marketDataTypes';

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const result = { orchestrationResult: { ok: true }, scopedSnapshot: [] } as unknown as HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult;

function createFakeScheduler() {
  let callback: (() => void) | null = null;
  let handleCounter = 0;
  const schedule = vi.fn((next: () => void, _delayMs: number) => {
    callback = next;
    handleCounter += 1;
    return handleCounter;
  });
  const cancel = vi.fn();
  const scheduler: HomeDashboardLiveMarketSummaryAcquisitionLifecycleSchedulerClock = { schedule, cancel };
  return {
    scheduler,
    schedule,
    cancel,
    fire() {
      const current = callback;
      callback = null;
      current?.();
    },
  };
}

function createPendingPort() {
  const calls: Array<{
    signal: AbortSignal;
    resolve: (value: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  const acquire = vi.fn((_scope: readonly MarketDataInstrument[], options?: { signal?: AbortSignal }) =>
    new Promise<HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult>((resolve, reject) => {
      calls.push({ signal: options!.signal!, resolve, reject });
    }));
  return {
    port: { acquire } as HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
    acquire,
    calls,
  };
}

describe('Home Dashboard live-market acquisition lifecycle scheduler', () => {
  it('starts visible entry immediately and arms exactly one five-second tick', () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
    );

    lifecycle.enter();
    lifecycle.enter();

    expect(pending.acquire).toHaveBeenCalledTimes(1);
    expect(pending.acquire.mock.calls[0]?.[0]).toEqual([btc]);
    expect(pending.calls[0]?.signal.aborted).toBe(false);
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule.mock.calls[0]?.[1]).toBe(5000);
  });

  it('uses latest-tick-wins cancellation while preserving fixed five-second starts', () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
    );

    lifecycle.enter();
    const firstSignal = pending.calls[0]!.signal;
    fake.fire();

    expect(firstSignal.aborted).toBe(true);
    expect(pending.acquire).toHaveBeenCalledTimes(2);
    expect(pending.calls[1]?.signal.aborted).toBe(false);
    expect(fake.schedule).toHaveBeenCalledTimes(2);
    expect(fake.schedule.mock.calls[1]?.[1]).toBe(5000);
  });

  it('suspends hidden acquisition by cancelling the pending tick and aborting in-flight work', () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
    );

    lifecycle.enter();
    const signal = pending.calls[0]!.signal;
    lifecycle.setVisibility('hidden');
    fake.fire();

    expect(signal.aborted).toBe(true);
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(pending.acquire).toHaveBeenCalledTimes(1);
  });

  it('resumes from hidden with an immediate acquisition and a new five-second tick', () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
      {},
      'hidden',
    );

    lifecycle.enter();
    expect(pending.acquire).not.toHaveBeenCalled();
    expect(fake.schedule).not.toHaveBeenCalled();

    lifecycle.setVisibility('visible');
    expect(pending.acquire).toHaveBeenCalledTimes(1);
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule.mock.calls[0]?.[1]).toBe(5000);
  });

  it('keeps close idempotent and prevents scheduled work after shutdown', () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
    );

    lifecycle.enter();
    const signal = pending.calls[0]!.signal;
    lifecycle.close();
    lifecycle.close();
    fake.fire();
    lifecycle.setVisibility('hidden');
    lifecycle.setVisibility('visible');
    lifecycle.enter();

    expect(signal.aborted).toBe(true);
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(pending.acquire).toHaveBeenCalledTimes(1);
  });

  it('forwards only the current non-aborted result and suppresses superseded completion', async () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const onResult = vi.fn();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
      { onResult },
    );

    lifecycle.enter();
    fake.fire();
    pending.calls[0]!.resolve(result);
    await Promise.resolve();
    expect(onResult).not.toHaveBeenCalled();

    pending.calls[1]!.resolve(result);
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(result);
  });

  it('forwards current acquisition rejection but suppresses lifecycle-driven aborted rejection', async () => {
    const fake = createFakeScheduler();
    const pending = createPendingPort();
    const onError = vi.fn();
    const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
      pending.port,
      [btc],
      fake.scheduler,
      { onError },
    );

    lifecycle.enter();
    fake.fire();
    const superseded = new Error('superseded');
    pending.calls[0]!.reject(superseded);
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();

    const current = new Error('current-network-failure');
    pending.calls[1]!.reject(current);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(current);
  });
});
