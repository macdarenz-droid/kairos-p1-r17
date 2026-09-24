import {
  projectHomeDashboardLiveCryptoBubbleAreaWeights,
  type HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
} from '../application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';
import type {
  HomeDashboardLiveCryptoBubbleReactRuntimeState,
} from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

export interface HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  readonly runtimeState: HomeDashboardLiveCryptoBubbleReactRuntimeState;
  readonly areaWeightProjection: HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult | null;
}

/**
 * Pure app-level composition between released React runtime state and the
 * released normalized Bubble area-weight projection. Visible rendering and
 * user-facing geometry remain later presentation responsibilities.
 */
export function projectHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel(
  runtimeState: HomeDashboardLiveCryptoBubbleReactRuntimeState,
): HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  const observation = runtimeState.latestObservation;
  if (observation === null) {
    return { runtimeState, areaWeightProjection: null };
  }

  return {
    runtimeState,
    areaWeightProjection: projectHomeDashboardLiveCryptoBubbleAreaWeights(
      observation.presentationStateProjection,
    ),
  };
}
