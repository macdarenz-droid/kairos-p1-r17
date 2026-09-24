import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import {
  projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel,
  type HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel,
} from './homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';
import { useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

/**
 * Thin React composition from the released normalized-radius hook to the
 * released Gate377 pixel-radius view model. Adds no state, effects, clocks,
 * viewport logic, sizing defaults, styling, route or market-truth ownership.
 */
export function useHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions,
  policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  const radiusScaleViewModel = useHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
    readObservedAt,
    readEvaluationTimeMs,
    options,
  );

  return projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
    radiusScaleViewModel,
    policy,
  );
}
