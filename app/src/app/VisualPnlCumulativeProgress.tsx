import type { VisualPnlCumulativeRealizedPnlProjection } from '../application/visual-pnl';

interface VisualPnlCumulativeProgressProps {
  readonly projection: VisualPnlCumulativeRealizedPnlProjection;
}

function unavailableMessage(reason: Extract<VisualPnlCumulativeRealizedPnlProjection, { available: false }>['reason']): string {
  if (reason === 'no-result-days') return 'No realized results to show yet.';
  if (reason === 'mixed-currencies') return 'Cumulative progress is unavailable for mixed currencies.';
  if (reason === 'unavailable-result-day') return 'Cumulative progress is unavailable because a daily result is unavailable.';
  return 'Cumulative progress is unavailable because a result could not be calculated.';
}

/**
 * Presentation-only P13 cumulative realized-P&L progress surface.
 *
 * Exact authoritative P13.18 DecimalString values are rendered directly.
 * No financial value is converted to binary floating point for chart geometry.
 * A richer scaled chart belongs behind a future explicit chart/scale owner.
 */
export function VisualPnlCumulativeProgress({ projection }: VisualPnlCumulativeProgressProps) {
  if (!projection.available) {
    return (
      <section className="kairos-pnl-progress" aria-labelledby="kairos-pnl-progress-title">
        <p className="kairos-pnl-performance-summary__label">Realized progress</p>
        <h3 id="kairos-pnl-progress-title">Cumulative realized P&amp;L</h3>
        <p className="kairos-pnl-progress__state">{unavailableMessage(projection.reason)}</p>
      </section>
    );
  }

  const latest = projection.points.at(-1);

  return (
    <section className="kairos-pnl-progress" aria-labelledby="kairos-pnl-progress-title">
      <div className="kairos-pnl-progress__heading">
        <div>
          <p className="kairos-pnl-performance-summary__label">Realized progress</p>
          <h3 id="kairos-pnl-progress-title">Cumulative realized P&amp;L</h3>
        </div>
        {latest ? <strong>{latest.cumulativeAmount} {projection.currency}</strong> : null}
      </div>

      {projection.points.length === 0 ? (
        <p className="kairos-pnl-progress__state">No realized results to show yet.</p>
      ) : (
        <ol className="kairos-pnl-progress__values" aria-label="Cumulative realized profit and loss progress">
          {projection.points.map((point) => (
            <li key={point.dayKey}>
              <span className="kairos-pnl-progress__marker" aria-hidden="true">•</span>
              <time dateTime={point.dayKey}>{point.dayKey}</time>
              <strong>{point.cumulativeAmount} {projection.currency}</strong>
            </li>
          ))}
        </ol>
      )}

      <p className="kairos-pnl-progress__notice">Realized results only. This is not account equity.</p>
    </section>
  );
}
