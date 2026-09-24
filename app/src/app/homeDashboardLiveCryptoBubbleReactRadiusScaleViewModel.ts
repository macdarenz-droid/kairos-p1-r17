import {
  projectHomeDashboardLiveCryptoBubbleRadiusScales,
  type HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
} from '../application/dashboard/homeDashboardLiveCryptoBubbleRadiusScaleProjection';
import type {
  HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel,
} from './homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';

export interface HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  readonly areaWeightViewModel: HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel;
  readonly runtimeState: HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel['runtimeState'];
  readonly radiusScaleProjection: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult | null;
}

/**
 * Pure app-level composition from the released React area-weight view model to
 * the released normalized radius-scale projection. It preserves runtime and
 * area-weight evidence by reference and owns no React state or pixel geometry.
 */
export function projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(
  areaWeightViewModel: HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel,
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  const runtimeState = areaWeightViewModel.runtimeState;
  const areaWeightProjection = areaWeightViewModel.areaWeightProjection;

  if (areaWeightProjection === null) {
    return {
      areaWeightViewModel,
      runtimeState,
      radiusScaleProjection: null,
    };
  }

  return {
    areaWeightViewModel,
    runtimeState,
    radiusScaleProjection: projectHomeDashboardLiveCryptoBubbleRadiusScales(areaWeightProjection),
  };
}
