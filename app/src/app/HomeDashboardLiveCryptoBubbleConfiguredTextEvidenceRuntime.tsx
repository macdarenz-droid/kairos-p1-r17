import { HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime } from './HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime';
import {
  composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions,
  type HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration,
} from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

export interface HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntimeProps {
  readonly configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration;
}

/**
 * Thin configured browser-runtime composition edge. It binds the exact
 * caller-owned product configuration through the released Gate360 options
 * composer into the released Gate359 browser textual-evidence runtime.
 */
export function HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntime({
  configuration,
}: HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntimeProps) {
  const options = composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions(configuration);

  return <HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime options={options} />;
}
