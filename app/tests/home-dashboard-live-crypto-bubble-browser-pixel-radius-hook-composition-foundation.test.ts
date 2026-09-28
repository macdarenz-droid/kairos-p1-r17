import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';

const mocks = vi.hoisted(() => ({
  useReactPixelRadiusViewModel: vi.fn(),
}));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel: mocks.useReactPixelRadiusViewModel,
  };
});

import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from '../src/app/homeDashboardLiveCryptoBubbleBrowserWallClock';
import { useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel';

function pixelRadiusViewModel(marker: string): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  return {
    radiusScaleViewModel: { marker: `radius-scale-${marker}` },
    runtimeState: { marker: `runtime-${marker}` },
    pixelRadiusProjection: { marker: `pixel-${marker}` },
  } as never;
}

describe('Home Dashboard Live Crypto Bubble browser pixel-radius hook composition foundation', () => {
  beforeEach(() => {
    mocks.useReactPixelRadiusViewModel.mockReset();
  });

  it('injects exact released Gate358 browser clock sources plus caller options and policy into Gate378 once', () => {
    const options = {
      universe: { excludedStablecoinBaseAssets: new Set(['USDC']) },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.25' },
    } as never;
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 10,
      maximumRadiusCssPixels: 50,
    };
    const expected = pixelRadiusViewModel('exact');
    mocks.useReactPixelRadiusViewModel.mockReturnValue(expected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel(options, policy));

    expect(mocks.useReactPixelRadiusViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.useReactPixelRadiusViewModel).toHaveBeenCalledWith(
      readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
      readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
      options,
      policy,
    );
    expect(result.current).toBe(expected);
  });

  it('returns the exact released Gate378 result unchanged', () => {
    const options = { universe: {}, presentationPolicy: {} } as never;
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 12,
      maximumRadiusCssPixels: 48,
    };
    const expected = pixelRadiusViewModel('unchanged');
    mocks.useReactPixelRadiusViewModel.mockReturnValue(expected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel(options, policy));

    expect(result.current).toBe(expected);
  });

  it('does not retain a second browser pixel-radius result owner across rerenders', () => {
    const options = { universe: {}, presentationPolicy: {} } as never;
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 8,
      maximumRadiusCssPixels: 40,
    };
    const first = pixelRadiusViewModel('first');
    const second = pixelRadiusViewModel('second');
    mocks.useReactPixelRadiusViewModel.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { result, rerender } = renderHook(() => useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel(options, policy));
    expect(result.current).toBe(first);
    rerender();
    expect(mocks.useReactPixelRadiusViewModel).toHaveBeenCalledTimes(2);
    expect(mocks.useReactPixelRadiusViewModel).toHaveBeenNthCalledWith(
      2,
      readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
      readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
      options,
      policy,
    );
    expect(result.current).toBe(second);
  });
});
