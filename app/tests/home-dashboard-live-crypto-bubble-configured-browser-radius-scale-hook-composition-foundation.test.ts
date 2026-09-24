import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

const mocks = vi.hoisted(() => ({
  composeRuntimeOptions: vi.fn(),
  useBrowserRadiusScaleViewModel: vi.fn(),
}));

vi.mock('../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition')>();
  return {
    ...actual,
    composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions: mocks.composeRuntimeOptions,
  };
});

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel: mocks.useBrowserRadiusScaleViewModel,
  };
});

import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel';

function viewModel(marker: string): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  return {
    areaWeightViewModel: { marker: `area-${marker}` },
    runtimeState: { marker: `runtime-${marker}` },
    radiusScaleProjection: { marker: `radius-${marker}` },
  } as never;
}

describe('Home Dashboard Live Crypto Bubble configured browser radius-scale hook composition foundation', () => {
  beforeEach(() => {
    mocks.composeRuntimeOptions.mockReset();
    mocks.useBrowserRadiusScaleViewModel.mockReset();
  });

  it('delegates the exact caller configuration through Gate360 into Gate368 exactly once', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set(['USDC']),
      neutralMaxAbsoluteMovementPercent: '0.25' as never,
    };
    const options = {
      universe: { excludedStablecoinBaseAssets: configuration.excludedStablecoinBaseAssets },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: configuration.neutralMaxAbsoluteMovementPercent },
    } as never;
    const expected = viewModel('exact');
    mocks.composeRuntimeOptions.mockReturnValue(options);
    mocks.useBrowserRadiusScaleViewModel.mockReturnValue(expected);

    const { result } = renderHook(() =>
      useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(configuration),
    );

    expect(mocks.composeRuntimeOptions).toHaveBeenCalledTimes(1);
    expect(mocks.composeRuntimeOptions).toHaveBeenCalledWith(configuration);
    expect(mocks.useBrowserRadiusScaleViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.useBrowserRadiusScaleViewModel).toHaveBeenCalledWith(options);
    expect(result.current).toBe(expected);
  });

  it('returns the exact released Gate368 result unchanged', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set<string>(),
      neutralMaxAbsoluteMovementPercent: '0' as never,
    };
    const options = { universe: {}, presentationPolicy: {} } as never;
    const expected = viewModel('unchanged');
    mocks.composeRuntimeOptions.mockReturnValue(options);
    mocks.useBrowserRadiusScaleViewModel.mockReturnValue(expected);

    const { result } = renderHook(() =>
      useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(configuration),
    );

    expect(result.current).toBe(expected);
  });

  it('does not retain a second configured radius-scale result owner across rerenders', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set<string>(),
      neutralMaxAbsoluteMovementPercent: '0.25' as never,
    };
    const firstOptions = { marker: 'options-1' } as never;
    const secondOptions = { marker: 'options-2' } as never;
    const first = viewModel('first');
    const second = viewModel('second');
    mocks.composeRuntimeOptions.mockReturnValueOnce(firstOptions).mockReturnValueOnce(secondOptions);
    mocks.useBrowserRadiusScaleViewModel.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { result, rerender } = renderHook(() =>
      useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(configuration),
    );
    expect(result.current).toBe(first);

    rerender();

    expect(mocks.composeRuntimeOptions).toHaveBeenCalledTimes(2);
    expect(mocks.useBrowserRadiusScaleViewModel).toHaveBeenNthCalledWith(2, secondOptions);
    expect(result.current).toBe(second);
  });
});
