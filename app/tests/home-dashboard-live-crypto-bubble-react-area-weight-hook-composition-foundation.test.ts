import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeState } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';
import type { HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';

const mocks = vi.hoisted(() => ({
  useRuntime: vi.fn(),
  projectViewModel: vi.fn(),
}));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubblePresentationObservedRuntime: mocks.useRuntime,
  };
});

vi.mock('../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel')>();
  return {
    ...actual,
    projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel: mocks.projectViewModel,
  };
});

import { useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel';

function runtimeState(status: HomeDashboardLiveCryptoBubbleReactRuntimeState['status']): HomeDashboardLiveCryptoBubbleReactRuntimeState {
  return { status, latestObservation: null, lastError: null };
}

function viewModel(state: HomeDashboardLiveCryptoBubbleReactRuntimeState): HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  return { runtimeState: state, areaWeightProjection: null };
}

describe('Home Dashboard Live Crypto Bubble React area-weight hook composition foundation', () => {
  beforeEach(() => {
    mocks.useRuntime.mockReset();
    mocks.projectViewModel.mockReset();
  });

  it('delegates caller-owned runtime inputs unchanged and projects the exact released runtime state once', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = {
      universe: { excludedStablecoinSymbols: new Set(['USDCUSDT']), limit: 30 },
      lifecycle: { visibleIntervalMs: 5000 },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.1' },
    } as never;
    const state = runtimeState('running');
    const projected = viewModel(state);
    mocks.useRuntime.mockReturnValue(state);
    mocks.projectViewModel.mockReturnValue(projected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
    ));

    expect(mocks.useRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.useRuntime).toHaveBeenCalledWith(readObservedAt, readEvaluationTimeMs, options);
    expect(mocks.projectViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.projectViewModel).toHaveBeenCalledWith(state);
    expect(result.current).toBe(projected);
  });

  it('does not retain a second runtime-state owner when the released runtime binding returns a new state', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = {
      universe: { marker: 'caller-universe' },
      lifecycle: { marker: 'caller-lifecycle' },
      presentationPolicy: { marker: 'caller-presentation-policy' },
    } as never;
    const firstState = runtimeState('starting');
    const secondError = new Error('later acquisition failed');
    const secondState: HomeDashboardLiveCryptoBubbleReactRuntimeState = {
      status: 'acquisition-failed',
      latestObservation: null,
      lastError: secondError,
    };
    const firstViewModel = viewModel(firstState);
    const secondViewModel = viewModel(secondState);
    mocks.useRuntime.mockReturnValueOnce(firstState).mockReturnValueOnce(secondState);
    mocks.projectViewModel.mockImplementation((state) => state === firstState ? firstViewModel : secondViewModel);

    const { result, rerender } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
    ));
    expect(result.current).toBe(firstViewModel);

    rerender();

    expect(mocks.useRuntime).toHaveBeenCalledTimes(2);
    expect(mocks.projectViewModel).toHaveBeenCalledTimes(2);
    expect(mocks.projectViewModel).toHaveBeenNthCalledWith(2, secondState);
    expect(result.current).toBe(secondViewModel);
    expect(result.current.runtimeState.lastError).toBe(secondError);
  });

  it('keeps the released projector result exact instead of reshaping area-weight evidence in the hook', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = { universe: {}, lifecycle: {}, presentationPolicy: {} } as never;
    const state = runtimeState('running');
    const areaWeightProjection = { ok: false, reason: 'bubble-metric-projection-invalid' } as never;
    const projected = { runtimeState: state, areaWeightProjection } as HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel;
    mocks.useRuntime.mockReturnValue(state);
    mocks.projectViewModel.mockReturnValue(projected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
    ));

    expect(result.current).toBe(projected);
    expect(result.current.areaWeightProjection).toBe(areaWeightProjection);
  });
});
