import { useId, type ReactNode } from 'react';
import type { VisualPnlResultCandleUnit, VisualPnlResultCandlesProjection, VisualPnlUnitCandlesProjection } from '../../application/visual-pnl';
import { Icon } from '../../design-system/icons/Icon';
import { ResultText } from '../../design-system/primitives';
import { dayLabel, monthLabel, shortDayLabel } from './ResultsCalendar';
import './results.css';

type Unavailable = Extract<VisualPnlResultCandlesProjection, { available: false }>['reason'];
type Marks = Extract<VisualPnlUnitCandlesProjection, { available: true }>['marks'];

function unavailableMessage(reason: Unavailable): string {
  if (reason === 'no-result-days') return 'Your total appears after your first closed trade.';
  if (reason === 'mixed-currencies') return "The total can't be drawn because your trades use more than one currency.";
  if (reason === 'unavailable-result-day') return "The total can't be drawn because at least one day has no result. Look for · on the calendar.";
  return 'The total could not be worked out. Your stored trades were not changed.';
}

const DIRECTION_ICONS = { up: 'result-up', down: 'result-down', even: 'result-flat' } as const;
const RESULT_CANDLES_WIDTH = 360;
const RESULT_CANDLES_HEIGHT = 176;
/** The right strip holds the value labels, like the trade picture's price labels; the bottom strip holds the dates. */
const PAD = { left: 4, right: 58, top: 10, bottom: 26 } as const;
const PLOT_WIDTH = RESULT_CANDLES_WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = RESULT_CANDLES_HEIGHT - PAD.top - PAD.bottom;
const STEPS = 1000;
/** A value label nearer than this to one already drawn is left out: 9-unit text would overlap. */
const RESULT_CANDLES_LABEL_GAP = 10;
/** Up to this many candles, every candle gets its date; more get the first, middle and last. */
const RESULT_CANDLES_ALL_DATES = 7;
/** A value label longer than this is squeezed to fit the right strip. */
const RESULT_CANDLES_LABEL_MAX_CHARS = 10;

/** Step counts to pixels only: 0 is the bottom of the plot, STEPS the top. */
const y = (step: number): number => PAD.top + ((STEPS - step) / STEPS) * PLOT_HEIGHT;

/** The words of a unit: its name, a candle's long and short date, and the table's first column. */
const UNIT_WORDS: Readonly<Record<VisualPnlResultCandleUnit, Readonly<{ one: string; many: string; long: (dayKey: string) => string; short: (dayKey: string) => string; column: string }>>> = Object.freeze({
  day: { one: 'day', many: 'days', long: dayLabel, short: shortDayLabel, column: 'Day' },
  week: { one: 'week', many: 'weeks', long: (dayKey: string) => `the week of ${dayLabel(dayKey)}`, short: shortDayLabel, column: 'Week' },
  month: { one: 'month', many: 'months', long: (dayKey: string) => monthLabel(dayKey.slice(0, 7)), short: (dayKey: string) => { const [month, year] = monthLabel(dayKey.slice(0, 7)).split(' '); return `${month!.slice(0, 3)} ${year}`; }, column: 'Month' },
});

function countsText(candles: readonly { readonly direction: 'up' | 'down' | 'even' }[], unit: VisualPnlResultCandleUnit): string {
  const words = UNIT_WORDS[unit];
  const count = (direction: 'up' | 'down' | 'even') => candles.filter((candle) => candle.direction === direction).length;
  return ([['up', count('up')], ['down', count('down')], ['even', count('even')]] as const)
    .filter(([, n]) => n > 0)
    .map(([direction, n]) => `${n} ${n === 1 ? words.one : words.many} ${direction}`)
    .join(', ');
}

export interface ResultsCandlesProps {
  /** The day picture (P13.A3), or the candles per day, week or month (U5, D205). */
  readonly projection: VisualPnlResultCandlesProjection | VisualPnlUnitCandlesProjection;
  readonly eyebrow?: string;
  /** Default "Total result so far"; the picture's name starts with it. */
  readonly title?: string;
  /** Default the projection's unit, else 'day'. */
  readonly unit?: VisualPnlResultCandleUnit;
  /** Given: each candle and each row of the numbers opens that candle's trades. */
  readonly onSelectCandle?: (index: number) => void;
  /** The words of the biggest dip (describeBiggestDip), drawn beside its mark. */
  readonly dip?: string | null;
  /** Default the projection's marks. */
  readonly marks?: Marks;
  /** Shown under the heading, e.g. the unit switch. */
  readonly controls?: ReactNode;
  /** Shown under the picture, e.g. "It starts at 0 on 1 September 2026." */
  readonly note?: string | null;
}

/** Your total as one candle per day, week or month with results, with the exact numbers one tap away. Presentational only. */
export function ResultsCandles({ projection, eyebrow = 'Your results over time', title = 'Total result so far', unit: unitProp, onSelectCandle, dip = null, marks: marksProp, controls = null, note = null }: ResultsCandlesProps) {
  const titleId = useId();
  const heading = <div>
    <p className="kairos-journal__eyebrow kairos-results__eyebrow">{eyebrow}</p>
    <h3 id={titleId} tabIndex={-1}>{title}</h3>
  </div>;
  if (!projection.available) {
    return <section className="kairos-results-candles" aria-labelledby={titleId}>
      <div className="kairos-results-candles__heading">{heading}</div>
      {controls}
      <p className="kairos-results-candles__state">{unavailableMessage(projection.reason)}</p>
    </section>;
  }
  const unit = unitProp ?? ('unit' in projection ? projection.unit : 'day');
  const words = UNIT_WORDS[unit];
  const unitCount = 'unitCount' in projection ? projection.unitCount : projection.resultDays;
  const marks = marksProp ?? ('marks' in projection ? projection.marks : []);
  const { candles, currency, total, totalOutcome, resultDays, zeroStep, highest, highestStep, lowest, lowestStep } = projection;
  const n = candles.length;
  const first = candles[0], last = candles[n - 1];
  const slot = PLOT_WIDTH / n;
  const bodyWidth = Math.min(16, Math.max(Math.min(2, slot), slot * 0.6));
  const span = n === 1
    ? `One candle, ${words.long(first.dayKey)}: `
    : n === unitCount
      ? `One candle per ${words.one}${unit === 'day' ? '' : ' with results'}, from ${words.long(first.dayKey)} to ${words.long(last.dayKey)}: `
      : `The last ${n} ${words.many} as candles, from ${words.long(first.dayKey)} to ${words.long(last.dayKey)}: `;
  const high = marks.find((mark) => mark.key === 'dip-high');
  const low = marks.find((mark) => mark.key === 'dip-low');
  const dipDrawn = dip !== null && high?.step != null && low?.step != null && low.candleIndex !== null && (high.atStart || high.candleIndex !== null);
  const dipHidden = dip !== null && high !== undefined && low !== undefined && !dipDrawn;
  const label = `${title}: ${total} ${currency} after ${resultDays} ${resultDays === 1 ? 'day' : 'days'} with results. ${span}${countsText(candles, unit)}.${dipDrawn ? ` Biggest dip ${dip}.` : ''}`;
  const zeroY = y(zeroStep);
  const centre = (index: number) => PAD.left + slot * (index + 0.5);
  // Highest, then lowest, each left out when it would crowd a label already drawn (so 0 is never repeated).
  const drawnY = [zeroY];
  const values: { key: 'highest' | 'lowest'; amount: string; y: number }[] = [];
  for (const [key, amount, step] of [['highest', highest, highestStep], ['lowest', lowest, lowestStep]] as const) {
    const at = y(step);
    if (drawnY.some((other) => Math.abs(other - at) < RESULT_CANDLES_LABEL_GAP)) continue;
    drawnY.push(at);
    values.push({ key, amount, y: at });
  }
  const dated = n <= RESULT_CANDLES_ALL_DATES
    ? candles.map((candle, index) => ({ dayKey: candle.dayKey, x: centre(index), anchor: 'middle' as const }))
    : [
      { dayKey: first.dayKey, x: PAD.left, anchor: 'start' as const },
      { dayKey: candles[Math.floor((n - 1) / 2)].dayKey, x: centre(Math.floor((n - 1) / 2)), anchor: 'middle' as const },
      { dayKey: last.dayKey, x: PAD.left + PLOT_WIDTH, anchor: 'end' as const },
    ];
  const dipMark = dipDrawn ? (() => {
    const highY = y(high!.step!), lowY = y(low!.step!);
    const fromX = high!.atStart ? PAD.left : centre(high!.candleIndex!);
    const lowX = centre(low!.candleIndex!);
    const bracketX = Math.min(lowX + bodyWidth / 2 + 3, PAD.left + PLOT_WIDTH - 1);
    const textX = bracketX + 3;
    const anchor = textX > PAD.left + PLOT_WIDTH - 60 ? 'end' as const : 'start' as const;
    return <g className="kairos-results-candles__dip">
      <line data-mark="dip-high" data-candle-index={high!.atStart ? undefined : high!.candleIndex!} data-at-start={high!.atStart || undefined} x1={fromX} x2={lowX} y1={highY} y2={highY} />
      <path data-mark="dip-low" data-candle-index={low!.candleIndex!} d={`M${bracketX - 2},${highY} H${bracketX} V${lowY} H${bracketX - 2}`} />
      <text className="kairos-results-candles__dip-label" x={anchor === 'end' ? bracketX - 4 : textX} y={(highY + lowY) / 2 + 3} textAnchor={anchor}>Biggest dip {dip}</text>
    </g>;
  })() : null;

  return <section className="kairos-results-candles" aria-labelledby={titleId} data-outcome={totalOutcome} data-unit={unit}>
    <div className="kairos-results-candles__heading">
      {heading}
      <strong><ResultText outcome={totalOutcome} label={totalOutcome === 'profit' ? 'Profit' : totalOutcome === 'loss' ? 'Loss' : 'Break-even'} amount={total} currency={currency} showLabel={false} /></strong>
    </div>
    {controls}
    <svg className="kairos-results-candles__picture" role="img" aria-label={label} viewBox={`0 0 ${RESULT_CANDLES_WIDTH} ${RESULT_CANDLES_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
      <rect className="kairos-results-candles__background" x="0" y="0" width={RESULT_CANDLES_WIDTH} height={RESULT_CANDLES_HEIGHT} rx="8" />
      <line className="kairos-results-candles__zero" x1={PAD.left} x2={PAD.left + PLOT_WIDTH} y1={zeroY} y2={zeroY} />
      <text className="kairos-results-candles__zero-label" x={PAD.left + PLOT_WIDTH + 4} y={zeroY + 3}>0</text>
      {values.map((value) => <text key={value.key} className="kairos-results-candles__value" data-value={value.key} x={PAD.left + PLOT_WIDTH + 4} y={value.y + 3}
        {...(value.amount.length > RESULT_CANDLES_LABEL_MAX_CHARS ? { textLength: PAD.right - 6, lengthAdjust: 'spacingAndGlyphs' } : {})}>{value.amount}</text>)}
      <g className="kairos-results-candles__candles">
        {candles.map((candle, index) => {
          const x = centre(index);
          const yHigh = y(candle.highStep), yLow = y(candle.lowStep);
          let top = y(Math.max(candle.openStep, candle.closeStep));
          let height = y(Math.min(candle.openStep, candle.closeStep)) - top;
          if (height < 2) {
            const middle = (y(candle.openStep) + y(candle.closeStep)) / 2;
            top = middle - 1;
            height = 2;
          }
          return <g key={candle.dayKey} className={`kairos-results-candles__candle kairos-results-candles__candle--${candle.direction}`} data-candle-day={candle.dayKey} data-direction={candle.direction}
            onClick={onSelectCandle ? () => onSelectCandle(index) : undefined}>
            {onSelectCandle ? <rect className="kairos-results-candles__hit" data-candle-hit="" x={PAD.left + slot * index} y={PAD.top} width={slot} height={PLOT_HEIGHT} /> : null}
            <line x1={x} x2={x} y1={yHigh} y2={yLow} />
            <rect x={x - bodyWidth / 2} y={top} width={bodyWidth} height={height} />
            {candle.direction === 'up' ? <polygon data-mark="up" points={`${x - 2.5},${yHigh - 2} ${x + 2.5},${yHigh - 2} ${x},${yHigh - 6}`} /> : null}
            {candle.direction === 'down' ? <polygon data-mark="down" points={`${x - 2.5},${yLow + 2} ${x + 2.5},${yLow + 2} ${x},${yLow + 6}`} /> : null}
          </g>;
        })}
      </g>
      {dipMark}
      {dated.map((date) => <text key={date.dayKey} className="kairos-results-candles__date" data-date-for={date.dayKey} x={date.x} y={RESULT_CANDLES_HEIGHT - 8} textAnchor={date.anchor}>{words.short(date.dayKey)}</text>)}
    </svg>
    {note ? <p className="kairos-results-candles__state">{note}</p> : null}
    {dipHidden ? <p className="kairos-results-candles__state">Biggest dip {dip} (before the candles shown)</p> : null}
    <p className="kairos-results-candles__state">One candle per {words.one} with results. It starts at your total before that {words.one} and ends at your total after it; the thin line shows the highest and lowest it reached that {words.one}. <Icon name="result-up" size={16} /> up · <Icon name="result-down" size={16} /> down · no mark: no change.</p>
    {unitCount > n ? <p className="kairos-results-candles__state">Showing your last {n} {words.many} with results. The total above counts all {unitCount}.</p> : null}
    <details className="kairos-results-candles__numbers">
      <summary>Show the numbers</summary>
      <table>
        <caption>Your total so far for each {words.one}, in {currency}</caption>
        <thead><tr><th scope="col">{words.column}</th><th scope="col">Start</th><th scope="col">Highest</th><th scope="col">Lowest</th><th scope="col">End</th></tr></thead>
        <tbody>
          {candles.map((candle, index) => <tr key={candle.dayKey} data-candle-row={candle.dayKey}>
            <th scope="row"><Icon name={DIRECTION_ICONS[candle.direction]} size={16} /> {onSelectCandle
              ? <button type="button" className="kairos-results-candles__row-button" onClick={() => onSelectCandle(index)}>See the trades of {words.long(candle.dayKey)}</button>
              : words.long(candle.dayKey)}</th>
            <td>{candle.open}</td><td>{candle.high}</td><td>{candle.low}</td><td>{candle.close}</td>
          </tr>)}
        </tbody>
      </table>
    </details>
    <p className="kairos-results-candles__state">Only closed trades count. This is not your account balance.</p>
  </section>;
}
