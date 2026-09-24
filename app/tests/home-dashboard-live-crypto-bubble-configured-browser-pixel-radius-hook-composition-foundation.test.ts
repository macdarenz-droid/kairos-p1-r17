import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

const mocks = vi.hoisted(() => ({
  composeRuntimeOptions: vi.fn(),
  useBrowserPixelRadiusViewModel: vi.fn(),
}));

vi.mock('../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition')>();
  return {
    ...actual,
    composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions: mocks.composeRuntimeOptions,
  };
});

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/app/useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel')>();
  return {
    ...actual,
    useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel: mocks.useBrowserPixelRadiusViewModel,
  };
});

import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel';

function viewModel(marker: string): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  return {
    radiusScaleViewModel: { marker: `radius-scale-${marker}` },
    runtimeState: { marker: `runtime-${marker}` },
    pixelRadiusProjection: { marker: `pixel-${marker}` },
  } as never;
}

describe('Home Dashboard Live Crypto Bubble configured browser pixel-radius hook composition foundation', () => {
  beforeEach(() => {
    mocks.composeRuntimeOptions.mockReset();
    mocks.useBrowserPixelRadiusViewModel.mockReset();
  });

  it('delegates the exact caller configuration and pixel-radius policy into Gate379 exactly once', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set(['USDC']),
      neutralMaxAbsoluteMovementPercent: '0.25' as never,
    };
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 12,
      maximumRadiusCssPixels: 48,
    };
    const options = {
      universe: { excludedStablecoinBaseAssets: configuration.excludedStablecoinBaseAssets },
      presentationPolicy: { neutralMaxAbsoluteMovementPercent: configuration.neutralMaxAbsoluteMovementPercent },
    } as never;
    const expected = viewModel('exact');
    mocks.composeRuntimeOptions.mockReturnValue(options);
    mocks.useBrowserPixelRadiusViewModel.mockReturnValue(expected);

    const { result } = renderHook(() =>
      useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel(configuration, policy),
    );

    expect(mocks.composeRuntimeOptions).toHaveBeenCalledTimes(1);
    expect(mocks.composeRuntimeOptions).toHaveBeenCalledWith(configuration);
    expect(mocks.useBrowserPixelRadiusViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.useBrowserPixelRadiusViewModel).toHaveBeenCalledWith(options, policy);
    expect(result.current).toBe(expected);
  });

  it('returns the exact released Gate379 result unchanged', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set<string>(),
      neutralMaxAbsoluteMovementPercent: '0' as never,
    };
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 10,
      maximumRadiusCssPixels: 40,
    };
    const options = { universe: {}, presentationPolicy: {} } as never;
    const expected = viewModel('unchanged');
    mocks.composeRuntimeOptions.mockReturnValue(options);
    mocks.useBrowserPixelRadiusViewModel.mockReturnValue(expected);

    const { result } = renderHook(() =>
      useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel(configuration, policy),
    );

    expect(result.current).toBe(expected);
  });

  it('does not retain a second configured pixel-radius result owner across rerenders', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set<string>(),
      neutralMaxAbsoluteMovementPercent: '0.25' as never,
    };
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 14,
      maximumRadiusCssPixels: 52,
    };
    const firstOptions = { marker: 'options-1' } as never;
    const secondOptions = { marker: 'options-2' } as never;
    const first = viewModel('first');
    const second = viewModel('second');
    mocks.composeRuntimeOptions.mockReturnValueOnce(firstOptions).mockReturnValueOnce(secondOptions);
    mocks.useBrowserPixelRadiusViewModel.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { result, rerender } = renderHook(() =>
      useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel(configuration, policy),
    );
    expect(result.current).toBe(first);

    rerender();

    expect(mocks.composeRuntimeOptions).toHaveBeenCalledTimes(2);
    expect(mocks.useBrowserPixelRadiusViewModel).toHaveBeenNthCalledWith(2, secondOptions, policy);
    expect(result.current).toBe(second);
  });
});
