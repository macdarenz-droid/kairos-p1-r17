import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const adaptedObservationSink = { onObservation: vi.fn(), onError: vi.fn() };
  return {
    adaptedObservationSink,
    createPresentationObservationSink: vi.fn(() => adaptedObservationSink),
    startBubbleObservedRuntime: vi.fn(),
  };
});

vi.mock('../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge', () => ({
  createHomeDashboardLiveCryptoBubblePresentationStateObservationSink: mocks.createPresentationObservationSink,
}));

vi.mock('../src/app/binanceHomeDashboardLiveCryptoBubbleObservedRuntimeComposition', () => ({
  startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime: mocks.startBubbleObservedRuntime,
}));

import { startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime } from '../src/app/binanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeComposition';

describe('Binance Home Dashboard Live Crypto Bubble Presentation Observed Runtime Composition Foundation', () => {
  beforeEach(() => {
    mocks.createPresentationObservationSink.mockClear();
    mocks.startBubbleObservedRuntime.mockReset();
  });

  it('creates exactly one Gate349 semantic observation adapter and delegates once to Gate345 while preserving caller dependencies by reference', async () => {
    const runtimeResult = { ok: true, runtime: { instruments: [], close: vi.fn() } } as const;
    mocks.startBubbleObservedRuntime.mockResolvedValue(runtimeResult);
    const readObservedAt = vi.fn(() => '2026-09-10T00:00:00.000Z');
    const readEvaluationTimeMs = vi.fn(() => Date.parse('2026-09-10T00:00:01.000Z'));
    const presentationPolicy = { neutralMaxAbsoluteMovementPercent: '0.10' } as never;
    const observationSink = { onObservation: vi.fn(), onError: vi.fn() };
    const browserDocument = {} as never;
    const timer = {} as never;
    const universe = { excludedStablecoinBaseAssets: new Set<string>(), topNCount: 30 } as never;

    const result = await startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
      readObservedAt,
      readEvaluationTimeMs,
      {
        universe,
        lifecycle: { document: browserDocument, timer },
        presentationPolicy,
        observationSink,
      },
    );

    expect(mocks.createPresentationObservationSink).toHaveBeenCalledTimes(1);
    expect(mocks.createPresentationObservationSink).toHaveBeenCalledWith(
      presentationPolicy,
      observationSink,
    );
    expect(mocks.startBubbleObservedRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.startBubbleObservedRuntime).toHaveBeenCalledWith(
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

  it('preserves a failed Gate345 runtime result unchanged while owning the semantic adaptation slot without a downstream sink', async () => {
    const runtimeResult = { ok: false, reason: 'acquisition-failed' } as const;
    mocks.startBubbleObservedRuntime.mockResolvedValue(runtimeResult);
    const readObservedAt = vi.fn(() => '2026-09-10T00:00:00.000Z');
    const readEvaluationTimeMs = vi.fn(() => 0);
    const presentationPolicy = { neutralMaxAbsoluteMovementPercent: '0' } as never;
    const universe = {} as never;

    const result = await startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
      readObservedAt,
      readEvaluationTimeMs,
      { universe, presentationPolicy },
    );

    expect(mocks.createPresentationObservationSink).toHaveBeenCalledTimes(1);
    expect(mocks.createPresentationObservationSink).toHaveBeenCalledWith(
      presentationPolicy,
      undefined,
    );
    expect(mocks.startBubbleObservedRuntime).toHaveBeenCalledWith(
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
