import type { HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';

interface HomeDashboardLiveCryptoBubblePixelRadiusTextEvidenceProps {
  readonly projection: HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult;
}

/**
 * Pure React evidence presenter for released caller-bounded CSS-pixel radii.
 * It consumes Gate375 projection output only; bounds selection, projection
 * arithmetic, layout, rendering, styling, route wiring and runtime stay outside.
 */
export function HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence({
  projection,
}: HomeDashboardLiveCryptoBubblePixelRadiusTextEvidenceProps) {
  return (
    <section
      aria-label="Live Crypto Bubble pixel radius evidence"
      data-pixel-radius-projection-status={projection.ok ? 'available' : 'failed'}
    >
      {!projection.ok ? (
        <div>
          <p>Pixel radius projection status: {projection.reason}</p>
          {'entryIndex' in projection ? <p>Entry index: {projection.entryIndex}</p> : null}
          {'policyValidation' in projection ? (
            <p>Policy validation: {projection.policyValidation.reason}</p>
          ) : null}
          {projection.reason === 'radius-scale-projection-invalid' ? (
            <p>Radius-scale projection status: {projection.radiusScaleProjection.reason}</p>
          ) : null}
        </div>
      ) : (
        <ol>
          {projection.entries.map((entry, index) => {
            const instrument =
              entry.radiusScaleEntry.areaWeightEntry.presentationEntry.metricInput.instrument;
            return (
              <li key={`${instrument.venue}:${instrument.symbol}:${index}`}>
                <strong>{instrument.symbol}</strong>
                <dl>
                  <div>
                    <dt>Venue</dt>
                    <dd>{instrument.venue}</dd>
                  </div>
                  <div>
                    <dt>CSS pixel radius</dt>
                    <dd>{entry.radiusCssPixels ?? 'missing'}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
