import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from './homeDashboardLiveCryptoBubbleBrowserWallClock';
import type { HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from './homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';
import { useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from './useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

/**
 * Browser-clock injection edge for the released Gate378 pixel-radius hook.
 * Owns no clock implementation, state, viewport, sizing defaults, geometry,
 * styling, route, provider, persistence or market-truth behavior.
 */
export function useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel(
  options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
  policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  return useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
    readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
    readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
    options,
    policy,
  );
}
