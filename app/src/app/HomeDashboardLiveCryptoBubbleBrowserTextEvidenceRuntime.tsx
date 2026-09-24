import { HomeDashboardLiveCryptoBubbleTextEvidenceRuntime } from './HomeDashboardLiveCryptoBubbleTextEvidenceRuntime';
import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from './homeDashboardLiveCryptoBubbleBrowserWallClock';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

export interface HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntimeProps {
  readonly options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions;
}

/**
 * Browser composition edge for the truthful Home Live Crypto Bubble textual
 * evidence path. It injects only the released Gate358 wall-clock sources into
 * the released Gate357 runtime component while keeping runtime policy/options
 * caller-owned.
 */
export function HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime({
  options,
}: HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntimeProps) {
  return (
    <HomeDashboardLiveCryptoBubbleTextEvidenceRuntime
      readObservedAt={readHomeDashboardLiveCryptoBubbleBrowserObservedAt}
      readEvaluationTimeMs={readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs}
      options={options}
    />
  );
}
