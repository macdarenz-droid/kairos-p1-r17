import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from './homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';
import {
  composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions,
  type HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration,
} from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel } from './useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel';

/**
 * Thin configured browser pixel-radius hook edge.
 * Owns no product values, pixel-radius defaults, browser clocks, state, geometry,
 * route or rendering behavior.
 */
export function useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel(
  configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration,
  policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  const options = composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions(configuration);
  return useHomeDashboardLiveCryptoBubbleBrowserPixelRadiusViewModel(options, policy);
}
