import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import { HomeDashboardLiveCryptoBubbleTextEvidence } from './HomeDashboardLiveCryptoBubbleTextEvidence';
import {
  useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel,
} from './useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

export interface HomeDashboardLiveCryptoBubbleTextEvidenceRuntimeProps {
  readonly readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource;
  readonly readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource;
  readonly options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions;
}

/**
 * Thin React composition boundary joining the released Gate355 runtime/view-model
 * hook to the released Gate356 textual evidence presenter. Caller-owned runtime
 * inputs remain injected; this component adds no defaults, state, effects,
 * market policy, calculations, geometry, styling, route wiring, or persistence.
 */
export function HomeDashboardLiveCryptoBubbleTextEvidenceRuntime({
  readObservedAt,
  readEvaluationTimeMs,
  options,
}: HomeDashboardLiveCryptoBubbleTextEvidenceRuntimeProps) {
  const model = useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
    readObservedAt,
    readEvaluationTimeMs,
    options,
  );

  return <HomeDashboardLiveCryptoBubbleTextEvidence model={model} />;
}
