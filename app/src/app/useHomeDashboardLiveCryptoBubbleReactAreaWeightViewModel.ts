import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel,
  type HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel,
} from './homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import {
  useHomeDashboardLiveCryptoBubblePresentationObservedRuntime,
  type HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
} from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

/**
 * React-ready composition of the released Gate351 runtime binding with the
 * released Gate354 area-weight view model. This hook adds no state, effects,
 * provider policy, market semantics, geometry, styling, or visible rendering.
 */
export function useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
): HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  const runtimeState = useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
    readObservedAt,
    readEvaluationTimeMs,
    options,
  );

  return projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(runtimeState);
}
