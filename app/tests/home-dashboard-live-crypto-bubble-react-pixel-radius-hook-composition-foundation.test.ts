import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';

const mocks = vi.hoisted(() => ({
  useRadiusScaleViewModel: vi.fn(),
  projectPixelRadiusViewModel: vi.fn(),
}));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel: mocks.useRadiusScaleViewModel,
  };
});

vi.mock('../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel')>();
  return {
    ...actual,
    projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel: mocks.projectPixelRadiusViewModel,
  };
});

import { useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';

function radiusScaleViewModel(marker: string): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  return {
    areaWeightViewModel: { marker: `area-${marker}` } as never,
    runtimeState: {
      status: 'running',
      latestObservation: null,
      lastError: null,
    },
    radiusScaleProjection: { marker } as never,
  } as HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
}

function pixelRadiusViewModel(
  radiusScaleViewModel: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel,
  marker: string,
): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  return {
    radiusScaleViewModel,
    runtimeState: radiusScaleViewModel.runtimeState,
    pixelRadiusProjection: { marker } as never,
  };
}

describe('Home Dashboard Live Crypto Bubble React pixel-radius hook composition foundation', () => {
  beforeEach(() => {
    mocks.useRadiusScaleViewModel.mockReset();
    mocks.projectPixelRadiusViewModel.mockReset();
  });

  it('delegates exact caller runtime inputs and exact pixel-radius policy once through the released owners', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = {
      universe: { excludedStablecoinSymbols: new Set(['USDCUSDT']), limit: 30 },
      lifecycle: { visibleIntervalMs: 5000 },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.25' },
    } as never;
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 10,
      maximumRadiusCssPixels: 50,
    };
    const radiusScale = radiusScaleViewModel('first-radius-scale');
    const pixelRadius = pixelRadiusViewModel(radiusScale, 'first-pixel-radius');
    mocks.useRadiusScaleViewModel.mockReturnValue(radiusScale);
    mocks.projectPixelRadiusViewModel.mockReturnValue(pixelRadius);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
      policy,
    ));

    expect(mocks.useRadiusScaleViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.useRadiusScaleViewModel).toHaveBeenCalledWith(readObservedAt, readEvaluationTimeMs, options);
    expect(mocks.projectPixelRadiusViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.projectPixelRadiusViewModel).toHaveBeenCalledWith(radiusScale, policy);
    expect(result.current).toBe(pixelRadius);
  });

  it('does not retain a second app-level pixel-radius state owner across rerenders', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = { universe: {}, lifecycle: {}, presentationPolicy: {} } as never;
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 12,
      maximumRadiusCssPixels: 48,
    };
    const firstRadiusScale = radiusScaleViewModel('first-radius-scale');
    const secondRadiusScale = radiusScaleViewModel('second-radius-scale');
    const firstPixel = pixelRadiusViewModel(firstRadiusScale, 'first-pixel');
    const secondPixel = pixelRadiusViewModel(secondRadiusScale, 'second-pixel');
    mocks.useRadiusScaleViewModel.mockReturnValueOnce(firstRadiusScale).mockReturnValueOnce(secondRadiusScale);
    mocks.projectPixelRadiusViewModel.mockImplementation((value) => value === firstRadiusScale ? firstPixel : secondPixel);

    const { result, rerender } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
      policy,
    ));
    expect(result.current).toBe(firstPixel);

    rerender();

    expect(mocks.useRadiusScaleViewModel).toHaveBeenCalledTimes(2);
    expect(mocks.projectPixelRadiusViewModel).toHaveBeenCalledTimes(2);
    expect(mocks.projectPixelRadiusViewModel).toHaveBeenNthCalledWith(2, secondRadiusScale, policy);
    expect(result.current).toBe(secondPixel);
  });

  it('returns the exact released Gate377 pixel-radius view-model result unchanged', () => {
    const readObservedAt = vi.fn();
    const readEvaluationTimeMs = vi.fn();
    const options = { universe: {}, lifecycle: {}, presentationPolicy: {} } as never;
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 10,
      maximumRadiusCssPixels: 50,
    };
    const radiusScale = radiusScaleViewModel('exact-radius-scale');
    const exactFailure = {
      ok: false,
      reason: 'pixel-radius-policy-invalid',
      policy,
    } as never;
    const projected = {
      radiusScaleViewModel: radiusScale,
      runtimeState: radiusScale.runtimeState,
      pixelRadiusProjection: exactFailure,
    } as HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel;
    mocks.useRadiusScaleViewModel.mockReturnValue(radiusScale);
    mocks.projectPixelRadiusViewModel.mockReturnValue(projected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
      readObservedAt,
      readEvaluationTimeMs,
      options,
      policy,
    ));

    expect(result.current).toBe(projected);
    expect(result.current.radiusScaleViewModel).toBe(radiusScale);
    expect(result.current.runtimeState).toBe(radiusScale.runtimeState);
    expect(result.current.pixelRadiusProjection).toBe(exactFailure);
  });
});
