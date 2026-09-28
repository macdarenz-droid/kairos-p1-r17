import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';

const mocks = vi.hoisted(() => ({
  useReactRadiusScaleViewModel: vi.fn(),
}));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel: mocks.useReactRadiusScaleViewModel,
  };
});

import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from '../src/app/homeDashboardLiveCryptoBubbleBrowserWallClock';
import { useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel';

function viewModel(marker: string): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  return {
    areaWeightViewModel: { marker: `area-${marker}` },
    runtimeState: { marker: `runtime-${marker}` },
    radiusScaleProjection: { marker: `radius-${marker}` },
  } as never;
}

describe('Home Dashboard Live Crypto Bubble browser radius-scale hook composition foundation', () => {
  beforeEach(() => {
    mocks.useReactRadiusScaleViewModel.mockReset();
  });

  it('injects the exact released Gate358 browser clock sources and caller options into Gate366 once', () => {
    const options = {
      universe: { excludedStablecoinBaseAssets: new Set(['USDC']) },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.25' },
    } as never;
    const expected = viewModel('exact');
    mocks.useReactRadiusScaleViewModel.mockReturnValue(expected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel(options));

    expect(mocks.useReactRadiusScaleViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.useReactRadiusScaleViewModel).toHaveBeenCalledWith(
      readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
      readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
      options,
    );
    expect(result.current).toBe(expected);
  });

  it('returns the exact released Gate366 result unchanged', () => {
    const options = { universe: {}, presentationPolicy: {} } as never;
    const expected = viewModel('unchanged');
    mocks.useReactRadiusScaleViewModel.mockReturnValue(expected);

    const { result } = renderHook(() => useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel(options));

    expect(result.current).toBe(expected);
  });

  it('does not retain a second browser radius-scale result owner across rerenders', () => {
    const options = { universe: {}, presentationPolicy: {} } as never;
    const first = viewModel('first');
    const second = viewModel('second');
    mocks.useReactRadiusScaleViewModel.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { result, rerender } = renderHook(() => useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel(options));
    expect(result.current).toBe(first);
    rerender();
    expect(mocks.useReactRadiusScaleViewModel).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(second);
  });
});
