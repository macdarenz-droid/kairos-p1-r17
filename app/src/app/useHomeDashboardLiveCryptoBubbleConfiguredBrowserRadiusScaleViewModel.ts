import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import {
  composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions,
  type HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration,
} from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel } from './useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel';

/**
 * Thin configured browser radius-scale hook edge.
 * Owns no product values, browser clocks, state, geometry, route or rendering behavior.
 */
export function useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(
  configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration,
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  const options = composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions(configuration);
  return useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel(options);
}
