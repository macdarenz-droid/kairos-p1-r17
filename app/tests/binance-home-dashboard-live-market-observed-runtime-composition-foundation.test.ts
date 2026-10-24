import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const observer = { onResult: vi.fn(), onError: vi.fn() };
  return {
    observer,
    createObserver: vi.fn(() => observer),
    startRuntime: vi.fn(),
  };
});

vi.mock('../src/application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge', () => ({
  createHomeDashboardLiveMarketSummaryFreshnessObservationObserver: mocks.createObserver,
}));

vi.mock('../src/app/binanceHomeDashboardLiveMarketRuntimeBootstrap', () => ({
  startBinanceHomeDashboardLiveMarketRuntime: mocks.startRuntime,
}));

import { startBinanceHomeDashboardLiveMarketObservedRuntime } from '../src/app/binanceHomeDashboardLiveMarketObservedRuntimeComposition';

describe('Binance Home Dashboard Live Market Observed Runtime Composition Foundation', () => {
  beforeEach(() => {
    mocks.createObserver.mockClear();
    mocks.startRuntime.mockReset();
  });

  it('creates exactly one freshness observer and delegates once while preserving caller options by reference', async () => {
    const runtimeResult = { ok: true, runtime: { instruments: [], close: vi.fn() } } as const;
    mocks.startRuntime.mockResolvedValue(runtimeResult);
    const readObservedAt = vi.fn(() => '2026-09-10T00:00:00.000Z');
    const readEvaluationTimeMs = vi.fn(() => Date.parse('2026-09-10T00:00:01.000Z'));
    const observationSink = { onObservation: vi.fn(), onError: vi.fn() };
    const browserDocument = {} as never;
    const timer = {} as never;
    const universe = { excludedStablecoinBaseAssets: new Set<string>(), topCount: 30 } as never;

    const result = await startBinanceHomeDashboardLiveMarketObservedRuntime(
      readObservedAt,
      readEvaluationTimeMs,
      {
        universe,
        lifecycle: { document: browserDocument, timer },
        observationSink,
      },
    );

    expect(mocks.createObserver).toHaveBeenCalledTimes(1);
    expect(mocks.createObserver).toHaveBeenCalledWith(readEvaluationTimeMs, observationSink);
    expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.startRuntime).toHaveBeenCalledWith(readObservedAt, {
      universe,
      lifecycle: {
        document: browserDocument,
        timer,
        observer: mocks.observer,
      },
    });
    expect(readObservedAt).not.toHaveBeenCalled();
    expect(readEvaluationTimeMs).not.toHaveBeenCalled();
    expect(result).toBe(runtimeResult);
  });

  it('owns the observer slot even when no document/timer overrides are supplied and preserves a failed bootstrap result unchanged', async () => {
    const runtimeResult = { ok: false, reason: 'acquisition-failed' } as const;
    mocks.startRuntime.mockResolvedValue(runtimeResult);
    const readObservedAt = vi.fn(() => '2026-09-10T00:00:00.000Z');
    const readEvaluationTimeMs = vi.fn(() => 0);
    const universe = {} as never;

    const result = await startBinanceHomeDashboardLiveMarketObservedRuntime(
      readObservedAt,
      readEvaluationTimeMs,
      { universe },
    );

    expect(mocks.createObserver).toHaveBeenCalledTimes(1);
    expect(mocks.startRuntime).toHaveBeenCalledWith(readObservedAt, {
      universe,
      lifecycle: { observer: mocks.observer },
    });
    expect(result).toBe(runtimeResult);
  });
});
