import {
  projectLiveCryptoBubbleMetricInputs,
  type LiveCryptoBubbleMetricInputProjectionResult,
} from '../../services/market-data';
import type {
  HomeDashboardLiveMarketSummaryFreshnessObservation,
  HomeDashboardLiveMarketSummaryFreshnessObservationSink,
} from './homeDashboardLiveMarketSummaryFreshnessObservationBridge';

export interface HomeDashboardLiveCryptoBubbleMetricObservation {
  readonly freshnessObservation: HomeDashboardLiveMarketSummaryFreshnessObservation;
  readonly bubbleMetricProjection: LiveCryptoBubbleMetricInputProjectionResult;
}

export interface HomeDashboardLiveCryptoBubbleMetricObservationSink {
  readonly onObservation?: (
    observation: HomeDashboardLiveCryptoBubbleMetricObservation,
  ) => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * Provider-neutral application bridge from the released Home freshness-observation
 * sink seam to the released Live Crypto Bubble numeric metric-input projection.
 * Acquisition/session truth, freshness truth, and Bubble metric truth remain
 * separately inspectable and no presentation policy is applied here.
 */
export function createHomeDashboardLiveCryptoBubbleMetricObservationSink(
  sink: HomeDashboardLiveCryptoBubbleMetricObservationSink = {},
): HomeDashboardLiveMarketSummaryFreshnessObservationSink {
  return {
    onObservation(freshnessObservation) {
      const bubbleMetricProjection = projectLiveCryptoBubbleMetricInputs(
        freshnessObservation.freshnessEvaluation,
      );
      sink.onObservation?.({
        freshnessObservation,
        bubbleMetricProjection,
      });
    },
    onError(error) {
      sink.onError?.(error);
    },
  };
}
