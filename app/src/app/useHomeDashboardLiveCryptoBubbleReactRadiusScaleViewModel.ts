import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel,
  type HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel,
} from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import { useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from './useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

/**
 * Thin React composition from the released area-weight hook to the
 * released Gate365 radius-scale view model. Adds no state, effects,
 * clocks, provider/product policy, pixel geometry, styling or route ownership.
 */
export function useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  const areaWeightViewModel = useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
    readObservedAt,
    readEvaluationTimeMs,
    options,
  );

  return projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(areaWeightViewModel);
}
