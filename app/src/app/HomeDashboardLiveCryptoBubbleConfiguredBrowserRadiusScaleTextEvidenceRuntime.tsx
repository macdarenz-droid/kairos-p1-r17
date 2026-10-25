import { HomeDashboardGlassBubbleMap } from './HomeDashboardGlassBubbleMap';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel } from './useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel';

export interface HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntimeProps {
  readonly configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration;
  /** Passed to the map's "Try again". */
  readonly onRetry?: () => void;
}

/**
 * Home's Live Market: the configured browser radius-scale hook gets the caller's configuration, and its model goes once
 * to the glass map. T-061a (D273): the hidden "Market data details" list, redrawn every 5 s, is gone.
 */
export function HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime({
  configuration,
  onRetry,
}: HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntimeProps) {
  const model = useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(configuration);
  return <HomeDashboardGlassBubbleMap model={model} onRetry={onRetry} />;
}
