import type { VisualPnlMonthGridDay, VisualPnlMonthGridProjection } from '../../application/visual-pnl';
import './journalResults.css';

interface ResultsCalendarProps {
  readonly grid: VisualPnlMonthGridProjection;
  readonly selectedDayKey: string | null;
  readonly canShowNextMonth: boolean;
  readonly onSelectDay: (dayKey: string) => void;
  readonly onPreviousMonth: () => void;
  readonly onNextMonth: () => void;
}

// English names in code, not Intl, so every device shows the same words.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']] as const;

/** "3 September 2026" for a `YYYY-MM-DD` key. */
export function dayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** "September 2026" for a `YYYY-MM` key. */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function mark(result: VisualPnlMonthGridDay['result']): string {
  if (result === 'profit') return '▲';
  if (result === 'loss') return '▼';
  if (result === 'breakeven') return '—';
  return '·';
}

function unavailableWhy(reason: string): string {
  if (reason === 'mixed-currencies') return 'trades in different currencies';
  if (reason === 'unavailable-trade-outcome') return 'a trade has no result yet';
  if (reason === 'missing-currency-evidence') return 'a trade has no currency';
  return 'it could not be worked out';
}

const OUTCOME_LABEL = { profit: 'Profit', loss: 'Loss', breakeven: 'Break-even' } as const;

function dayAriaLabel(day: VisualPnlMonthGridDay): string {
  const summary = day.summary!;
  const trades = `${summary.tradeCount} ${summary.tradeCount === 1 ? 'trade' : 'trades'}`;
  const today = day.isToday ? ', today' : '';
  if (summary.available) return `${dayLabel(day.dayKey)}: ${OUTCOME_LABEL[summary.outcome]}, ${summary.total} ${summary.currency}${today}, ${trades}`;
  return `${dayLabel(day.dayKey)}: Result unavailable, ${unavailableWhy(summary.reason)}${today}, ${trades}`;
}

/** The month calendar heatmap: presentational only, from a projected month grid. */
export function ResultsCalendar({ grid, selectedDayKey, canShowNextMonth, onSelectDay, onPreviousMonth, onNextMonth }: ResultsCalendarProps) {
  const cells: (VisualPnlMonthGridDay | null)[] = [...Array.from({ length: grid.leadingEmptyCells }, () => null), ...grid.days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const hasResults = grid.days.some(day => day.summary !== null);

  return <div className="kairos-results-calendar-block">
    <div className="kairos-results-calendar__bar">
      <button type="button" className="kairos-results-calendar__nav" aria-label="Previous month" onClick={onPreviousMonth}>‹</button>
      <h3>{monthLabel(grid.monthKey)}</h3>
      <button type="button" className="kairos-results-calendar__nav" aria-label="Next month" disabled={!canShowNextMonth} onClick={onNextMonth}>›</button>
    </div>
    <table className="kairos-results-calendar">
      <thead><tr>{WEEKDAYS.map(([short, long]) => <th key={short} scope="col" abbr={long}>{short}</th>)}</tr></thead>
      <tbody>
        {weeks.map((week, weekIndex) => <tr key={weekIndex}>
          {week.map((day, dayIndex) => day === null
            ? <td key={`empty-${dayIndex}`} className="kairos-results-calendar__empty" />
            : <td key={day.dayKey} data-day-key={day.dayKey} data-day-result={day.result} data-day-strength={day.strength ?? undefined} data-day-today={day.isToday || undefined}>
              {day.summary ? <button type="button" aria-pressed={selectedDayKey === day.dayKey} aria-label={dayAriaLabel(day)} onClick={() => onSelectDay(day.dayKey)}>
                <span>{day.dayOfMonth}</span>
                <span className="kairos-results-calendar__mark" aria-hidden="true">{mark(day.result)}</span>
              </button> : <span className="kairos-results-calendar__number">{day.dayOfMonth}</span>}
            </td>)}
        </tr>)}
      </tbody>
    </table>
    <p className="kairos-results-calendar__legend">▲ Profit · ▼ Loss · — Break-even · · Not available. Stronger colour means a bigger result in this month.</p>
    {grid.scale.kind === 'none' && grid.scale.reason === 'mixed-currencies' ? <p className="kairos-results-calendar__legend">Colour strength is off this month because your days use different currencies.</p> : null}
    {!hasResults ? <p className="kairos-results-calendar__legend">No closed trades in {monthLabel(grid.monthKey)}.</p> : null}
  </div>;
}
