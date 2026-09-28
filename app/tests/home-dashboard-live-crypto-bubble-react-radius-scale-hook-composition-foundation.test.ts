import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';

const mocks = vi.hoisted(() => ({
  useAreaWeightViewModel: vi.fn(),
  projectRadiusScaleViewModel: vi.fn(),
}));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel: mocks.useAreaWeightViewModel,
  };
});

vi.mock('../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel')>();
  return {
    ...actual,
    projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel: mocks.projectRadiusScaleViewModel,
  };
});

import { useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';

function areaWeightViewModel(marker: string): HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  return {
    runtimeState: {
      status: 'running',
      latestObservation: null,
      lastError: null,
    },
    areaWeightProjection: { marker } as never,
  } as HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel;
}

function radiusScaleViewModel(
  areaWeightViewModel: HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel,
  marker: string,
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  return {
    areaWeightViewModel,
    runtimeState: areaWeightViewModel.runtimeState,
    radiusScaleProjection: { marker } as never,
  };
}

describe('Home Dashboard Live Crypto Bubble React radius-scale hook composition foundation', () => {
  beforeEach(() => {
    mocks.useAreaWeightViewModel.mockReset();
    mocks.projectRadiusScaleViewModel.mockReset();
  });

  it('delegates caller-owned runtime inputs unchanged and projects the exact released area-weight view model once', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = {
      universe: { excludedStablecoinSymbols: new Set(['USDCUSDT']), limit: 30 },
      lifecycle: { visibleIntervalMs: 5000 },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.25' },
    } as never;
    const areaViewModel = areaWeightViewModel('first-area');
    const radiusViewModel = radiusScaleViewModel(areaViewModel, 'first-radius');
    mocks.useAreaWeightViewModel.mockReturnValue(areaViewModel);
    mocks.projectRadiusScaleViewModel.mockReturnValue(radiusViewModel);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
    ));

    expect(mocks.useAreaWeightViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.useAreaWeightViewModel).toHaveBeenCalledWith(readObservedAt, readEvaluationTimeMs, options);
    expect(mocks.projectRadiusScaleViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.projectRadiusScaleViewModel).toHaveBeenCalledWith(areaViewModel);
    expect(result.current).toBe(radiusViewModel);
  });

  it('does not retain a second app-level radius-scale state owner across rerenders', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = { universe: {}, lifecycle: {}, presentationPolicy: {} } as never;
    const firstArea = areaWeightViewModel('first-area');
    const secondArea = areaWeightViewModel('second-area');
    const firstRadius = radiusScaleViewModel(firstArea, 'first-radius');
    const secondRadius = radiusScaleViewModel(secondArea, 'second-radius');
    mocks.useAreaWeightViewModel.mockReturnValueOnce(firstArea).mockReturnValueOnce(secondArea);
    mocks.projectRadiusScaleViewModel.mockImplementation((value) => value === firstArea ? firstRadius : secondRadius);

    const { result, rerender } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
    ));
    expect(result.current).toBe(firstRadius);

    rerender();

    expect(mocks.useAreaWeightViewModel).toHaveBeenCalledTimes(2);
    expect(mocks.projectRadiusScaleViewModel).toHaveBeenCalledTimes(2);
    expect(mocks.projectRadiusScaleViewModel).toHaveBeenNthCalledWith(2, secondArea);
    expect(result.current).toBe(secondRadius);
  });

  it('returns the exact released Gate365 radius-scale view-model result unchanged', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = { universe: {}, lifecycle: {}, presentationPolicy: {} } as never;
    const areaViewModel = areaWeightViewModel('exact-area');
    const exactRadiusProjection = { ok: false, reason: 'area-weight-projection-invalid' } as never;
    const projected = {
      areaWeightViewModel: areaViewModel,
      runtimeState: areaViewModel.runtimeState,
      radiusScaleProjection: exactRadiusProjection,
    } as HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
    mocks.useAreaWeightViewModel.mockReturnValue(areaViewModel);
    mocks.projectRadiusScaleViewModel.mockReturnValue(projected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
    ));

    expect(result.current).toBe(projected);
    expect(result.current.areaWeightViewModel).toBe(areaViewModel);
    expect(result.current.runtimeState).toBe(areaViewModel.runtimeState);
    expect(result.current.radiusScaleProjection).toBe(exactRadiusProjection);
  });
});
