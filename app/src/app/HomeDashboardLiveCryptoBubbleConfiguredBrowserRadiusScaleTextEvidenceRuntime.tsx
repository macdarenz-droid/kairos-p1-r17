import { HomeDashboardGlassBubbleMap } from './HomeDashboardGlassBubbleMap';
import { HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence } from './HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel } from './useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel';

export interface HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntimeProps {
  readonly visual?: boolean;
  readonly configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration;
}

/**
 * Thin configured browser radius-scale textual-evidence composition edge.
 * It delegates the exact caller-owned configuration to the released configured
 * browser radius-scale hook, then presents the exact released model once. The approved visual amendment
 * optionally delegates the same model to the glass consumer, without a second
 * acquisition hook or any geometry/material ownership here.
 */
export function HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime({
  configuration,
  visual = false,
}: HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntimeProps) {
  const model = useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(configuration);

  const evidence = <HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence model={model} />;
  return visual ? (
    <>
      <HomeDashboardGlassBubbleMap model={model} />
      <details hidden><summary>Market data details</summary>{evidence}</details>
    </>
  ) : evidence;
}
