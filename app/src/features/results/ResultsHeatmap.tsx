import { useId } from 'react';
import { describeHeatmapCell, describeHeatmapLeftOut } from '../../application/performance/periodWords';
import { VISUAL_PNL_HOUR_BLOCK_NAMES, VISUAL_PNL_HOURS_PER_BLOCK, VISUAL_PNL_WEEKDAY_NAMES, type VisualPnlHeatmapCell, type VisualPnlWeekdayTimeHeatmap } from '../../application/visual-pnl';
import { CellResult, ColourKey } from './ResultsCalendar';
import './results.css';

/** "00", "04", … "20": the first hour of each block. */
const BLOCK_HOURS = VISUAL_PNL_HOUR_BLOCK_NAMES.map((_, block) => String(block * VISUAL_PNL_HOURS_PER_BLOCK).padStart(2, '0'));

export interface ResultsHeatmapProps {
  readonly heatmap: VisualPnlWeekdayTimeHeatmap;
  readonly timeZone: string;
  /** The open cell, as "weekday-block", for aria-pressed. */
  readonly selectedKey: string | null;
  readonly onSelectCell: (cell: VisualPnlHeatmapCell) => void;
}

/** U5 (D206): "When you trade", your results by weekday and 4-hour block of opening. Presentational only. */
export function ResultsHeatmap({ heatmap, timeZone, selectedKey, onSelectCell }: ResultsHeatmapProps) {
  const titleId = useId();
  return <section className="kairos-results-heatmap" aria-labelledby={titleId}>
    <h3 id={titleId} tabIndex={-1}>When you trade</h3>
    <p className="kairos-results-calendar__legend">Your results by the day and time you opened each trade, in {timeZone}.</p>
    <table className="kairos-results-heatmap__table">
      <thead><tr><td />{BLOCK_HOURS.map((hours, block) => <th key={hours} scope="col" abbr={VISUAL_PNL_HOUR_BLOCK_NAMES[block]}>{hours}</th>)}</tr></thead>
      <tbody>
        {heatmap.rows.map(row => <tr key={row.weekday}>
          <th scope="row" abbr={VISUAL_PNL_WEEKDAY_NAMES[row.weekday]}>{VISUAL_PNL_WEEKDAY_NAMES[row.weekday]!.slice(0, 3)}</th>
          {row.cells.map(cell => {
            const key = `${cell.weekday}-${cell.block}`;
            if (cell.summary === null) return <td key={key} className="kairos-results-heatmap__cell" />;
            return <td key={key} className="kairos-results-heatmap__cell" data-heatmap-cell={key} data-cell-result={cell.summary.available ? cell.summary.outcome : 'unavailable'} data-cell-strength={cell.strength ?? undefined}>
              <button type="button" aria-pressed={selectedKey === key} aria-label={describeHeatmapCell(cell)} onClick={() => onSelectCell(cell)}>
                <CellResult summary={cell.summary} />
              </button>
            </td>;
          })}
        </tr>)}
      </tbody>
    </table>
    <ColourKey className="kairos-results-heatmap__key" />
    <p className="kairos-results-calendar__legend">The small number is how many trades opened then. Stronger colour means a bigger result.{heatmap.scale.kind === 'one-currency' ? ` Amounts in ${heatmap.scale.currency}.` : ''}</p>
    {heatmap.scale.kind === 'none' && heatmap.scale.reason === 'mixed-currencies' ? <p className="kairos-results-calendar__legend">Your trades use different currencies, so colour strength is off: each amount is in its own currency. Tap a cell to see it.</p> : null}
    {heatmap.leftOut.length > 0 ? <p className="kairos-results-calendar__legend">{describeHeatmapLeftOut(heatmap.leftOut.length)}</p> : null}
  </section>;
}
