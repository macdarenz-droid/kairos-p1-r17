import type { VisualPnlResultLineProjection } from '../../application/visual-pnl';
import { dayLabel } from './ResultsCalendar';
import './journalResults.css';

type Unavailable = Extract<VisualPnlResultLineProjection, { available: false }>['reason'];

function unavailableMessage(reason: Unavailable): string {
  if (reason === 'no-result-days') return 'Your total appears after your first closed trade.';
  if (reason === 'mixed-currencies') return "The total can't be drawn because your trades use more than one currency.";
  if (reason === 'unavailable-result-day') return "The total can't be drawn because at least one day has no result. Look for · on the calendar.";
  return 'The total could not be worked out. Your stored trades were not changed.';
}

const MARKS = { profit: '▲', loss: '▼', breakeven: '—' } as const;

/** The total result so far as a line from zero, day by day, with the exact numbers one tap away. Presentational only. */
export function ResultsLine({ line, eyebrow = 'Your results over time' }: { readonly line: VisualPnlResultLineProjection; readonly eyebrow?: string }) {
  const heading = <div>
    <p className="kairos-journal__eyebrow">{eyebrow}</p>
    <h3 id="kairos-results-line-title">Total result so far</h3>
  </div>;
  if (!line.available) {
    return <section className="kairos-results-line" aria-labelledby="kairos-results-line-title">
      <div className="kairos-results-line__heading">{heading}</div>
      <p className="kairos-results-line__state">{unavailableMessage(line.reason)}</p>
    </section>;
  }
  const { currency, latest, points, zeroYStep } = line;
  const first = points[0], days = points.length;
  const zeroY = 1000 - zeroYStep;
  const polyline = [`0,${zeroY}`, ...points.map(point => `${point.xStep},${1000 - point.yStep}`)].join(' ');
  const label = `Total result so far: ${latest.cumulativeAmount} ${currency} after ${days} ${days === 1 ? 'day' : 'days'} with results, from ${dayLabel(first.dayKey)} to ${dayLabel(latest.dayKey)}.`;
  return <section className="kairos-results-line" aria-labelledby="kairos-results-line-title" data-outcome={line.latestOutcome}>
    <div className="kairos-results-line__heading">
      {heading}
      <strong><span aria-hidden="true">{MARKS[line.latestOutcome]}</span> {latest.cumulativeAmount} {currency}</strong>
    </div>
    <svg className="kairos-results-line__picture" role="img" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={label}>
      <line className="kairos-results-line__zero" x1="0" x2="1000" y1={zeroY} y2={zeroY} vectorEffect="non-scaling-stroke" />
      <polyline className="kairos-results-line__path" points={polyline} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="kairos-results-line__ends"><span>{dayLabel(first.dayKey)}</span><span>{dayLabel(latest.dayKey)}</span></div>
    <details className="kairos-results-line__numbers">
      <summary>Show the numbers</summary>
      <ol>{points.map(point => <li key={point.dayKey}><span>{dayLabel(point.dayKey)}</span> <strong>{point.cumulativeAmount} {currency}</strong></li>)}</ol>
    </details>
    <p className="kairos-results-line__state">Only closed trades count. This is not your account balance.</p>
  </section>;
}
