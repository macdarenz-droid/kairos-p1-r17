import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from './homeDashboardLiveCryptoBubbleBrowserWallClock';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import { useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

/**
 * Browser-clock injection edge for the released Gate366 radius-scale hook.
 * Owns no clock implementation, state, provider/product policy, geometry or route behavior.
 */
export function useHomeDashboardLiveCryptoBubbleBrowserRadiusScaleViewModel(
  options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  return useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
    readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
    readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
    options,
  );
}
