import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ startRuntime: vi.fn() }));

vi.mock('../src/app/binanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeComposition', () => ({
  startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime: mocks.startRuntime,
}));

import { useHomeDashboardLiveCryptoBubblePresentationObservedRuntime } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

function createInputs() {
  return {
    readObservedAt: vi.fn(() => '2026-09-10T00:00:00.000Z'),
    readEvaluationTimeMs: vi.fn(() => Date.parse('2026-09-10T00:00:01.000Z')),
    universe: { excludedStablecoinBaseAssets: new Set<string>(), topNCount: 30 } as never,
    lifecycle: { document: {} as never, timer: {} as never },
    presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.10' } as never,
  };
}

describe('Home Dashboard Live Crypto Bubble React Runtime Binding Foundation', () => {
  beforeEach(() => mocks.startRuntime.mockReset());

  it('starts exactly one Gate350 runtime per effect and preserves exact semantic observation plus error evidence without erasing the observation', async () => {
    const close = vi.fn();
    let resolveRuntime!: (value: { readonly ok: true; readonly runtime: { readonly instruments: readonly []; readonly close: () => void } }) => void;
    mocks.startRuntime.mockReturnValue(new Promise((resolve) => { resolveRuntime = resolve; }));
    const inputs = createInputs();

    const { result, unmount } = renderHook(() => useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
      inputs.readObservedAt,
      inputs.readEvaluationTimeMs,
      {
        universe: inputs.universe,
        lifecycle: inputs.lifecycle,
        presentationPolicy: inputs.presentationPolicy,
      },
    ));

    expect(result.current).toEqual({ status: 'starting', latestObservation: null, lastError: null });
    expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
    const call = mocks.startRuntime.mock.calls[0];
    expect(call?.[0]).toBe(inputs.readObservedAt);
    expect(call?.[1]).toBe(inputs.readEvaluationTimeMs);
    expect(call?.[2].universe).toBe(inputs.universe);
    expect(call?.[2].lifecycle).toBe(inputs.lifecycle);
    expect(call?.[2].presentationPolicy).toBe(inputs.presentationPolicy);

    const observation = { metricObservation: { marker: 'metric' }, presentationStateProjection: { marker: 'semantic' } } as never;
    const acquisitionError = new Error('temporary acquisition failure');
    act(() => call?.[2].observationSink.onObservation(observation));
    await waitFor(() => expect(result.current.latestObservation).toBe(observation));
    act(() => call?.[2].observationSink.onError(acquisitionError));
    await waitFor(() => expect(result.current.lastError).toBe(acquisitionError));
    expect(result.current.latestObservation).toBe(observation);

    await act(async () => resolveRuntime({ ok: true, runtime: { instruments: [], close } }));
    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(result.current.latestObservation).toBe(observation);
    expect(result.current.lastError).toBe(acquisitionError);

    unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes a successfully resolved runtime exactly once when bootstrap finishes after unmount', async () => {
    const close = vi.fn();
    let resolveRuntime!: (value: { readonly ok: true; readonly runtime: { readonly instruments: readonly []; readonly close: () => void } }) => void;
    mocks.startRuntime.mockReturnValue(new Promise((resolve) => { resolveRuntime = resolve; }));
    const inputs = createInputs();

    const { unmount } = renderHook(() => useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
      inputs.readObservedAt,
      inputs.readEvaluationTimeMs,
      { universe: inputs.universe, lifecycle: inputs.lifecycle, presentationPolicy: inputs.presentationPolicy },
    ));
    unmount();
    await act(async () => resolveRuntime({ ok: true, runtime: { instruments: [], close } }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps Gate350 acquisition failure explicit instead of inventing usable Bubble state', async () => {
    mocks.startRuntime.mockResolvedValue({ ok: false, reason: 'acquisition-failed' });
    const inputs = createInputs();
    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
      inputs.readObservedAt,
      inputs.readEvaluationTimeMs,
      { universe: inputs.universe, lifecycle: inputs.lifecycle, presentationPolicy: inputs.presentationPolicy },
    ));
    await waitFor(() => expect(result.current.status).toBe('acquisition-failed'));
    expect(result.current.latestObservation).toBeNull();
  });

  it('preserves an unexpected bootstrap exception as explicit error evidence', async () => {
    const error = new Error('bootstrap exception');
    const resultWithThrowingOk = Object.defineProperty({}, 'ok', {
      get: () => { throw error; },
    }) as never;
    mocks.startRuntime.mockResolvedValue(resultWithThrowingOk);
    const inputs = createInputs();
    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
      inputs.readObservedAt,
      inputs.readEvaluationTimeMs,
      { universe: inputs.universe, lifecycle: inputs.lifecycle, presentationPolicy: inputs.presentationPolicy },
    ));
    await waitFor(() => expect(result.current.status).toBe('bootstrap-error'));
    expect(result.current.lastError).toBe(error);
    expect(result.current.latestObservation).toBeNull();
  });
});
