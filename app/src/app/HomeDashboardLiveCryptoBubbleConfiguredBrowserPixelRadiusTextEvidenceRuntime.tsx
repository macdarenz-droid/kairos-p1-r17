import { HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence } from './HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence';
import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel } from './useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel';

export interface HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntimeProps {
  readonly configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration;
  readonly policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy;
}

/**
 * Thin configured browser pixel-radius textual-evidence composition edge.
 * It delegates the exact caller-owned configuration and pixel-radius policy to
 * the released configured browser hook, then presents only released projection
 * truth. A missing projection remains explicitly unavailable rather than being
 * replaced with invented radius data.
 */
export function HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntime({
  configuration,
  policy,
}: HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntimeProps) {
  const model = useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel(
    configuration,
    policy,
  );

  if (model.pixelRadiusProjection === null) {
    return (
      <section
        aria-label="Live Crypto Bubble pixel radius evidence"
        data-pixel-radius-projection-status="unavailable"
      >
        <p>Pixel radius projection status: unavailable</p>
      </section>
    );
  }

  return (
    <HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence
      projection={model.pixelRadiusProjection}
    />
  );
}
