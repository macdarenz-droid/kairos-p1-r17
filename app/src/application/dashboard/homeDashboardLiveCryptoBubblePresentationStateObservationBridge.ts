import {
  projectHomeDashboardLiveCryptoBubblePresentationState,
  type HomeDashboardLiveCryptoBubblePresentationPolicy,
  type HomeDashboardLiveCryptoBubblePresentationStateProjectionResult,
} from './homeDashboardLiveCryptoBubblePresentationStateProjection';
import type {
  HomeDashboardLiveCryptoBubbleMetricObservation,
  HomeDashboardLiveCryptoBubbleMetricObservationSink,
} from './homeDashboardLiveCryptoBubbleMetricObservationBridge';

export interface HomeDashboardLiveCryptoBubblePresentationStateObservation {
  readonly metricObservation: HomeDashboardLiveCryptoBubbleMetricObservation;
  readonly presentationStateProjection: HomeDashboardLiveCryptoBubblePresentationStateProjectionResult;
}

export interface HomeDashboardLiveCryptoBubblePresentationStateObservationSink {
  readonly onObservation?: (
    observation: HomeDashboardLiveCryptoBubblePresentationStateObservation,
  ) => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * Provider-neutral application bridge from released Bubble metric observations
 * to released semantic presentation-state projection. Numeric metric/freshness
 * truth and derived semantic state stay separately inspectable below React.
 */
export function createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(
  policy: HomeDashboardLiveCryptoBubblePresentationPolicy,
  sink: HomeDashboardLiveCryptoBubblePresentationStateObservationSink = {},
): HomeDashboardLiveCryptoBubbleMetricObservationSink {
  return {
    onObservation(metricObservation) {
      const presentationStateProjection = projectHomeDashboardLiveCryptoBubblePresentationState(
        metricObservation,
        policy,
      );
      sink.onObservation?.({
        metricObservation,
        presentationStateProjection,
      });
    },
    onError(error) {
      sink.onError?.(error);
    },
  };
}
