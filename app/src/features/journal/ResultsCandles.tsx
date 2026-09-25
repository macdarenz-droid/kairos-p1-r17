import { useId } from 'react';
import type { VisualPnlResultCandlesProjection } from '../../application/visual-pnl';
import { dayLabel } from './ResultsCalendar';
import './journalResults.css';

type Unavailable = Extract<VisualPnlResultCandlesProjection, { available: false }>['reason'];

function unavailableMessage(reason: Unavailable): string {
  if (reason === 'no-result-days') return 'Your total appears after your first closed trade.';
  if (reason === 'mixed-currencies') return "The total can't be drawn because your trades use more than one currency.";
  if (reason === 'unavailable-result-day') return "The total can't be drawn because at least one day has no result. Look for · on the calendar.";
  return 'The total could not be worked out. Your stored trades were not changed.';
}

const TOTAL_MARKS = { profit: '▲', loss: '▼', breakeven: '—' } as const;
const DAY_MARKS = { up: '▲', down: '▼', even: '—' } as const;
const RESULT_CANDLES_WIDTH = 360;
const RESULT_CANDLES_HEIGHT = 160;
const PAD = { left: 4, right: 24, top: 10, bottom: 10 } as const;
const PLOT_WIDTH = RESULT_CANDLES_WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = RESULT_CANDLES_HEIGHT - PAD.top - PAD.bottom;
const STEPS = 1000;

/** Step counts to pixels only: 0 is the bottom of the plot, STEPS the top. */
const y = (step: number): number => PAD.top + ((STEPS - step) / STEPS) * PLOT_HEIGHT;

function countsText(candles: readonly { readonly direction: 'up' | 'down' | 'even' }[]): string {
  const count = (direction: 'up' | 'down' | 'even') => candles.filter((candle) => candle.direction === direction).length;
  return ([['up', count('up')], ['down', count('down')], ['even', count('even')]] as const)
    .filter(([, n]) => n > 0)
    .map(([direction, n]) => `${n} ${n === 1 ? 'day' : 'days'} ${direction}`)
    .join(', ');
}

/** The total result so far as one candle per day with results, with the exact numbers one tap away. Presentational only. */
export function ResultsCandles({ projection, eyebrow = 'Your results over time' }: { readonly projection: VisualPnlResultCandlesProjection; readonly eyebrow?: string }) {
  const titleId = useId();
  const heading = <div>
    <p className="kairos-journal__eyebrow">{eyebrow}</p>
    <h3 id={titleId}>Total result so far</h3>
  </div>;
  if (!projection.available) {
    return <section className="kairos-results-candles" aria-labelledby={titleId}>
      <div className="kairos-results-candles__heading">{heading}</div>
      <p className="kairos-results-candles__state">{unavailableMessage(projection.reason)}</p>
    </section>;
  }
  const { candles, currency, total, totalOutcome, resultDays, zeroStep } = projection;
  const n = candles.length;
  const first = candles[0], last = candles[n - 1];
  const slot = PLOT_WIDTH / n;
  const bodyWidth = Math.min(16, Math.max(Math.min(2, slot), slot * 0.6));
  const span = n === 1
    ? `One candle, ${dayLabel(first.dayKey)}: `
    : n === resultDays
      ? `One candle per day, from ${dayLabel(first.dayKey)} to ${dayLabel(last.dayKey)}: `
      : `The last ${n} days as candles, from ${dayLabel(first.dayKey)} to ${dayLabel(last.dayKey)}: `;
  const label = `Total result so far: ${total} ${currency} after ${resultDays} ${resultDays === 1 ? 'day' : 'days'} with results. ${span}${countsText(candles)}.`;
  const zeroY = y(zeroStep);

  return <section className="kairos-results-candles" aria-labelledby={titleId} data-outcome={totalOutcome}>
    <div className="kairos-results-candles__heading">
      {heading}
      <strong><span aria-hidden="true">{TOTAL_MARKS[totalOutcome]}</span> {total} {currency}</strong>
    </div>
    <svg className="kairos-results-candles__picture" role="img" aria-label={label} viewBox={`0 0 ${RESULT_CANDLES_WIDTH} ${RESULT_CANDLES_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
      <rect className="kairos-results-candles__background" x="0" y="0" width={RESULT_CANDLES_WIDTH} height={RESULT_CANDLES_HEIGHT} rx="8" />
      <line className="kairos-results-candles__zero" x1={PAD.left} x2={PAD.left + PLOT_WIDTH} y1={zeroY} y2={zeroY} />
      <text className="kairos-results-candles__zero-label" x={PAD.left + PLOT_WIDTH + 4} y={zeroY + 3}>0</text>
      <g className="kairos-results-candles__candles">
        {candles.map((candle, index) => {
          const x = PAD.left + slot * (index + 0.5);
          const yHigh = y(candle.highStep), yLow = y(candle.lowStep);
          let top = y(Math.max(candle.openStep, candle.closeStep));
          let height = y(Math.min(candle.openStep, candle.closeStep)) - top;
          if (height < 2) {
            const middle = (y(candle.openStep) + y(candle.closeStep)) / 2;
            top = middle - 1;
            height = 2;
          }
          return <g key={candle.dayKey} className={`kairos-results-candles__candle kairos-results-candles__candle--${candle.direction}`} data-candle-day={candle.dayKey} data-direction={candle.direction}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} />
            <rect x={x - bodyWidth / 2} y={top} width={bodyWidth} height={height} />
            {candle.direction === 'up' ? <polygon data-mark="up" points={`${x - 2.5},${yHigh - 2} ${x + 2.5},${yHigh - 2} ${x},${yHigh - 6}`} /> : null}
            {candle.direction === 'down' ? <polygon data-mark="down" points={`${x - 2.5},${yLow + 2} ${x + 2.5},${yLow + 2} ${x},${yLow + 6}`} /> : null}
          </g>;
        })}
      </g>
    </svg>
    <div className="kairos-results-candles__axis">
      <span>{dayLabel(first.dayKey)}</span>
      {n > 1 ? <span>{dayLabel(last.dayKey)}</span> : null}
    </div>
    <p className="kairos-results-candles__state">One candle per day with results. It starts at your total before that day and ends at your total after it; the thin line shows the highest and lowest it reached that day. ▲ up · ▼ down · no mark: no change.</p>
    {resultDays > n ? <p className="kairos-results-candles__state">Showing your last {n} days with results. The total above counts all {resultDays}.</p> : null}
    <details className="kairos-results-candles__numbers">
      <summary>Show the numbers</summary>
      <table>
        <caption>Your total so far for each day, in {currency}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Start</th><th scope="col">Highest</th><th scope="col">Lowest</th><th scope="col">End</th></tr></thead>
        <tbody>
          {candles.map((candle) => <tr key={candle.dayKey}>
            <th scope="row"><span aria-hidden="true">{DAY_MARKS[candle.direction]}</span> {dayLabel(candle.dayKey)}</th>
            <td>{candle.open}</td><td>{candle.high}</td><td>{candle.low}</td><td>{candle.close}</td>
          </tr>)}
        </tbody>
      </table>
    </details>
    <p className="kairos-results-candles__state">Only closed trades count. This is not your account balance.</p>
  </section>;
}
