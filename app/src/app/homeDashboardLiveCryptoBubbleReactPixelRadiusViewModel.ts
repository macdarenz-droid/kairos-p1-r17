import {
  projectHomeDashboardLiveCryptoBubblePixelRadii,
  type HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult,
} from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';
import type {
  HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
} from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type {
  HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel,
} from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';

export interface HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  readonly radiusScaleViewModel: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
  readonly runtimeState: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel['runtimeState'];
  readonly pixelRadiusProjection: HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult | null;
}

/**
 * Pure app-level composition from the released React radius-scale view model to
 * the released caller-bounded pixel-radius projection. It preserves runtime and
 * normalized-radius evidence by reference and owns no React state or defaults.
 */
export function projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
  radiusScaleViewModel: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel,
  policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
): HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel {
  const runtimeState = radiusScaleViewModel.runtimeState;
  const radiusScaleProjection = radiusScaleViewModel.radiusScaleProjection;

  if (radiusScaleProjection === null) {
    return {
      radiusScaleViewModel,
      runtimeState,
      pixelRadiusProjection: null,
    };
  }

  return {
    radiusScaleViewModel,
    runtimeState,
    pixelRadiusProjection: projectHomeDashboardLiveCryptoBubblePixelRadii(
      radiusScaleProjection,
      policy,
    ),
  };
}
