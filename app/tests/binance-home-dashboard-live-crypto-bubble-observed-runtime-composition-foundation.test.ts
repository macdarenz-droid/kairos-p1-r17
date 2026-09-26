import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const adaptedObservationSink = { onObservation: vi.fn(), onError: vi.fn() };
  return {
    adaptedObservationSink,
    createBubbleObservationSink: vi.fn(() => adaptedObservationSink),
    startObservedRuntime: vi.fn(),
  };
});

vi.mock('../src/application/dashboard/homeDashboardLiveCryptoBubbleMetricObservationBridge', () => ({
  createHomeDashboardLiveCryptoBubbleMetricObservationSink: mocks.createBubbleObservationSink,
}));

vi.mock('../src/app/binanceHomeDashboardLiveMarketObservedRuntimeComposition', () => ({
  startBinanceHomeDashboardLiveMarketObservedRuntime: mocks.startObservedRuntime,
}));

import { startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime } from '../src/app/binanceHomeDashboardLiveCryptoBubbleObservedRuntimeComposition';

describe('Binance Home Dashboard Live Crypto Bubble Observed Runtime Composition Foundation', () => {
  beforeEach(() => {
    mocks.createBubbleObservationSink.mockClear();
    mocks.startObservedRuntime.mockReset();
  });

  it('creates exactly one Gate344 Bubble observation adapter and delegates once to Gate341 while preserving caller dependencies by reference', async () => {
    const runtimeResult = { ok: true, runtime: { instruments: [], close: vi.fn() } } as const;
    mocks.startObservedRuntime.mockResolvedValue(runtimeResult);
    const readObservedAt = vi.fn(() => '2026-09-10T00:00:00.000Z');
    const readEvaluationTimeMs = vi.fn(() => Date.parse('2026-09-10T00:00:01.000Z'));
    const observationSink = { onObservation: vi.fn(), onError: vi.fn() };
    const browserDocument = {} as never;
    const timer = {} as never;
    const universe = { excludedStablecoinBaseAssets: new Set<string>(), topNCount: 30 } as never;

    const result = await startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(
      readObservedAt,
      readEvaluationTimeMs,
      {
        universe,
        lifecycle: { document: browserDocument, timer },
        observationSink,
      },
    );

    expect(mocks.createBubbleObservationSink).toHaveBeenCalledTimes(1);
    expect(mocks.createBubbleObservationSink).toHaveBeenCalledWith(observationSink);
    expect(mocks.startObservedRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.startObservedRuntime).toHaveBeenCalledWith(
      readObservedAt,
      readEvaluationTimeMs,
      {
        universe,
        lifecycle: { document: browserDocument, timer },
        observationSink: mocks.adaptedObservationSink,
      },
    );
    expect(readObservedAt).not.toHaveBeenCalled();
    expect(readEvaluationTimeMs).not.toHaveBeenCalled();
    expect(result).toBe(runtimeResult);
  });

  it('preserves a failed Gate341 runtime result unchanged and owns the adaptation slot when no downstream sink is supplied', async () => {
    const runtimeResult = { ok: false, reason: 'acquisition-failed' } as const;
    mocks.startObservedRuntime.mockResolvedValue(runtimeResult);
    const readObservedAt = vi.fn(() => '2026-09-10T00:00:00.000Z');
    const readEvaluationTimeMs = vi.fn(() => 0);
    const universe = {} as never;

    const result = await startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(
      readObservedAt,
      readEvaluationTimeMs,
      { universe },
    );

    expect(mocks.createBubbleObservationSink).toHaveBeenCalledTimes(1);
    expect(mocks.createBubbleObservationSink).toHaveBeenCalledWith(undefined);
    expect(mocks.startObservedRuntime).toHaveBeenCalledWith(
      readObservedAt,
      readEvaluationTimeMs,
      {
        universe,
        lifecycle: undefined,
        observationSink: mocks.adaptedObservationSink,
      },
    );
    expect(result).toBe(runtimeResult);
  });
});
