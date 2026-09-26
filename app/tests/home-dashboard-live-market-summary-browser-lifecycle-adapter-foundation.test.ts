import { describe, expect, it, vi } from 'vitest';
import {
  createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter,
  type HomeDashboardLiveMarketSummaryBrowserTimer,
  type HomeDashboardLiveMarketSummaryBrowserVisibilityDocument,
} from '../src/app/homeDashboardLiveMarketSummaryBrowserLifecycleAdapter';
import type { HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort } from '../src/application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { MarketDataInstrument } from '../src/services/market-data/marketDataTypes';

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };

function createBrowserDocument(initial: DocumentVisibilityState = 'visible') {
  let listener: (() => void) | null = null;
  const state = { visibilityState: initial };
  const addEventListener = vi.fn((_type: 'visibilitychange', next: () => void) => {
    listener = next;
  });
  const removeEventListener = vi.fn((_type: 'visibilitychange', next: () => void) => {
    if (listener === next) listener = null;
  });
  const browserDocument = {
    get visibilityState() {
      return state.visibilityState;
    },
    addEventListener,
    removeEventListener,
  } as HomeDashboardLiveMarketSummaryBrowserVisibilityDocument;
  return {
    browserDocument,
    addEventListener,
    removeEventListener,
    setVisibility(next: DocumentVisibilityState) {
      state.visibilityState = next;
      listener?.();
    },
  };
}

function createTimer() {
  let callback: (() => void) | null = null;
  let nextHandle = 0;
  const schedule = vi.fn((next: () => void, _delayMs: number) => {
    callback = next;
    nextHandle += 1;
    return nextHandle;
  });
  const cancel = vi.fn();
  const timer: HomeDashboardLiveMarketSummaryBrowserTimer = { schedule, cancel };
  return {
    timer,
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
  const signals: AbortSignal[] = [];
  const acquire = vi.fn((_scope: readonly MarketDataInstrument[], options?: { signal?: AbortSignal }) => {
    signals.push(options!.signal!);
    return new Promise<never>(() => {});
  });
  return {
    port: { acquire } as HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
    acquire,
    signals,
  };
}

describe('Home Dashboard live-market browser lifecycle adapter', () => {
  it('maps visible browser entry into Gate331 immediate acquisition and released five-second scheduling', () => {
    const page = createBrowserDocument('visible');
    const timer = createTimer();
    const pending = createPendingPort();

    const adapter = createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(
      pending.port,
      [btc],
      { document: page.browserDocument, timer: timer.timer },
    );

    expect(page.addEventListener).toHaveBeenCalledTimes(1);
    expect(page.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(pending.acquire).toHaveBeenCalledTimes(1);
    expect(timer.schedule).toHaveBeenCalledTimes(1);
    expect(timer.schedule.mock.calls[0]?.[1]).toBe(5000);
    adapter.close();
  });

  it('maps browser hidden state to suspension and visible resume to immediate reacquisition', () => {
    const page = createBrowserDocument('visible');
    const timer = createTimer();
    const pending = createPendingPort();
    const adapter = createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(
      pending.port,
      [btc],
      { document: page.browserDocument, timer: timer.timer },
    );
    const firstSignal = pending.signals[0]!;

    page.setVisibility('hidden');
    expect(firstSignal.aborted).toBe(true);
    expect(timer.cancel).toHaveBeenCalledTimes(1);
    expect(pending.acquire).toHaveBeenCalledTimes(1);

    page.setVisibility('visible');
    expect(pending.acquire).toHaveBeenCalledTimes(2);
    expect(timer.schedule).toHaveBeenCalledTimes(2);
    expect(timer.schedule.mock.calls[1]?.[1]).toBe(5000);
    adapter.close();
  });

  it('does not acquire while initially hidden and starts immediately when the page becomes visible', () => {
    const page = createBrowserDocument('hidden');
    const timer = createTimer();
    const pending = createPendingPort();
    const adapter = createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(
      pending.port,
      [btc],
      { document: page.browserDocument, timer: timer.timer },
    );

    expect(pending.acquire).not.toHaveBeenCalled();
    expect(timer.schedule).not.toHaveBeenCalled();
    page.setVisibility('visible');
    expect(pending.acquire).toHaveBeenCalledTimes(1);
    expect(timer.schedule.mock.calls[0]?.[1]).toBe(5000);
    adapter.close();
  });

  it('removes exactly its visibility listener and closes lifecycle work idempotently', () => {
    const page = createBrowserDocument('visible');
    const timer = createTimer();
    const pending = createPendingPort();
    const adapter = createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(
      pending.port,
      [btc],
      { document: page.browserDocument, timer: timer.timer },
    );
    const signal = pending.signals[0]!;

    adapter.close();
    adapter.close();

    expect(page.removeEventListener).toHaveBeenCalledTimes(1);
    expect(page.removeEventListener.mock.calls[0]?.[0]).toBe('visibilitychange');
    expect(signal.aborted).toBe(true);
    expect(timer.cancel).toHaveBeenCalledTimes(1);
    page.setVisibility('hidden');
    page.setVisibility('visible');
    timer.fire();
    expect(pending.acquire).toHaveBeenCalledTimes(1);
  });
});
