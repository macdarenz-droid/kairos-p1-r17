import type { HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from './homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';

interface HomeDashboardLiveCryptoBubbleTextEvidenceProps {
  readonly model: HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel;
}

/**
 * First truthful React presentation boundary for Home Live Crypto Bubble data.
 * It exposes only released semantic/metric evidence. Bubble geometry, styling,
 * route wiring, market/runtime ownership, and all calculations remain outside.
 */
export function HomeDashboardLiveCryptoBubbleTextEvidence({
  model,
}: HomeDashboardLiveCryptoBubbleTextEvidenceProps) {
  const { runtimeState, areaWeightProjection } = model;

  return (
    <section
      aria-label="Live Crypto Bubble market evidence"
      data-runtime-status={runtimeState.status}
      data-runtime-error={runtimeState.lastError === null ? 'none' : 'present'}
    >
      <dl>
        <div>
          <dt>Runtime status</dt>
          <dd>{runtimeState.status}</dd>
        </div>
      </dl>

      {areaWeightProjection === null ? (
        <p data-projection-status="none">No market observation</p>
      ) : !areaWeightProjection.ok ? (
        <div data-projection-status="failed">
          <p>Projection status: {areaWeightProjection.reason}</p>
          {'entryIndex' in areaWeightProjection ? (
            <p>Entry index: {areaWeightProjection.entryIndex}</p>
          ) : null}
        </div>
      ) : (
        <ol data-projection-status="available">
          {areaWeightProjection.entries.map((entry, index) => {
            const presentationEntry = entry.presentationEntry;
            const metricInput = presentationEntry.metricInput;
            return (
              <li key={`${metricInput.instrument.venue}:${metricInput.instrument.symbol}:${index}`}>
                <strong>{metricInput.instrument.symbol}</strong>
                <dl>
                  <div>
                    <dt>Availability</dt>
                    <dd>{presentationEntry.availability}</dd>
                  </div>
                  <div>
                    <dt>Freshness</dt>
                    <dd>{presentationEntry.freshnessState}</dd>
                  </div>
                  <div>
                    <dt>Movement</dt>
                    <dd>{presentationEntry.movementSemantic ?? 'missing'}</dd>
                  </div>
                  <div>
                    <dt>24h quote volume</dt>
                    <dd>{metricInput.quoteVolume24h ?? 'missing'}</dd>
                  </div>
                  <div>
                    <dt>24h movement percent</dt>
                    <dd>{metricInput.movementPercent24h ?? 'missing'}</dd>
                  </div>
                  <div>
                    <dt>Area weight</dt>
                    <dd>{entry.areaWeight ?? 'missing'}</dd>
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
