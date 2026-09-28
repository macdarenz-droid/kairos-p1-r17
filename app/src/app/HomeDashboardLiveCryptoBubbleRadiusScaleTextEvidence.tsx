import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';

interface HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidenceProps {
  readonly model: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
}

/**
 * Pure React evidence presenter for released normalized Bubble radius scales.
 * It consumes the released view model only; runtime ownership, arithmetic,
 * pixel geometry, layout, styling, route wiring and persistence stay outside.
 */
export function HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence({
  model,
}: HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidenceProps) {
  const { runtimeState, radiusScaleProjection } = model;

  return (
    <section
      aria-label="Live Crypto Bubble normalized radius evidence"
      data-runtime-status={runtimeState.status}
      data-runtime-error={runtimeState.lastError === null ? 'none' : 'present'}
    >
      <dl>
        <div>
          <dt>Runtime status</dt>
          <dd>{runtimeState.status}</dd>
        </div>
      </dl>

      {radiusScaleProjection === null ? (
        <p data-radius-projection-status="none">No radius-scale observation</p>
      ) : !radiusScaleProjection.ok ? (
        <div data-radius-projection-status="failed">
          <p>Radius projection status: {radiusScaleProjection.reason}</p>
          {'entryIndex' in radiusScaleProjection ? (
            <p>Entry index: {radiusScaleProjection.entryIndex}</p>
          ) : null}
        </div>
      ) : (
        <ol data-radius-projection-status="available">
          {radiusScaleProjection.entries.map((entry, index) => {
            const instrument = entry.areaWeightEntry.presentationEntry.metricInput.instrument;
            return (
              <li key={`${instrument.venue}:${instrument.symbol}:${index}`}>
                <strong>{instrument.symbol}</strong>
                <dl>
                  <div>
                    <dt>Venue</dt>
                    <dd>{instrument.venue}</dd>
                  </div>
                  <div>
                    <dt>Normalized radius scale</dt>
                    <dd>{entry.radiusScale ?? 'missing'}</dd>
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
