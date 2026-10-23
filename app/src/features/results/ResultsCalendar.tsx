import { describeUnavailableWhy } from '../../application/performance/periodWords';
import { describeVisualPnlCompactAmount, type VisualPnlAggregationSummary, type VisualPnlMonthGridDay, type VisualPnlMonthGridProjection, type VisualPnlMonthTotals, type VisualPnlMonthWeek } from '../../application/visual-pnl';
import { Icon } from '../../design-system/icons/Icon';
import { ResultText } from '../../design-system/primitives';
import './results.css';

interface ResultsCalendarProps {
  readonly grid: VisualPnlMonthGridProjection;
  readonly selectedDayKey: string | null;
  readonly canShowNextMonth: boolean;
  /** U5: false at the first month the results period allows (default true). */
  readonly canShowPreviousMonth?: boolean;
  /** U5: shown under the legend, e.g. "Days outside September 2026 are dimmed." */
  readonly outsideNote?: string | null;
  readonly onSelectDay: (dayKey: string) => void;
  readonly onPreviousMonth: () => void;
  readonly onNextMonth: () => void;
  /** U5 (D204): the week and month totals. Given (the dashboard), the calendar has a week column and a month total. */
  readonly totals?: VisualPnlMonthTotals | null;
  /** The open week (its fromDayKey), or the month, for aria-pressed. */
  readonly selectedWeekKey?: string | null;
  readonly monthSelected?: boolean;
  readonly onSelectWeek?: (week: VisualPnlMonthWeek) => void;
  readonly onSelectMonth?: () => void;
}

// English names in code, not Intl, so every device shows the same words.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']] as const;

/** "3 September 2026" for a `YYYY-MM-DD` key. */
export function dayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** "3 Sep" for a YYYY-MM-DD key: the day and the first three letters of the month. */
export function shortDayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1].slice(0, 3)}`;
}

/** "September 2026" for a `YYYY-MM` key. */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

const unavailableWhy = describeUnavailableWhy;

const OUTCOME_LABEL = { profit: 'Profit', loss: 'Loss', breakeven: 'Break-even' } as const;

const tradesWord = (count: number) => `${count} ${count === 1 ? 'trade' : 'trades'}`;

function dayAriaLabel(day: VisualPnlMonthGridDay): string {
  const summary = day.summary!;
  const trades = tradesWord(summary.tradeCount);
  const today = day.isToday ? ', today' : '';
  if (summary.available) return `${dayLabel(day.dayKey)}: ${OUTCOME_LABEL[summary.outcome]}, ${summary.total} ${summary.currency}${today}, ${trades}`;
  return `${dayLabel(day.dayKey)}: Result unavailable, ${unavailableWhy(summary.reason)}${today}, ${trades}`;
}

/** "1 – 6 September 2026", or "20 September 2026" for one day; a week never leaves its month (D204). */
function weekDays(week: VisualPnlMonthWeek): string {
  const first = week.dayKeys[0]!;
  const last = week.dayKeys[week.dayKeys.length - 1]!;
  return first === last ? dayLabel(first) : `${dayLabel(first).split(' ')[0]} – ${dayLabel(last)}`;
}

function weekAriaLabel(week: VisualPnlMonthWeek): string {
  const summary = week.summary!;
  const what = summary.available ? `${OUTCOME_LABEL[summary.outcome]}, ${summary.total} ${summary.currency}` : `Result unavailable, ${unavailableWhy(summary.reason)}`;
  return `Week of ${weekDays(week)}: ${what}, ${tradesWord(summary.tradeCount)}`;
}

/** What a cell shows: the short amount (the exact one is in the button's name), or the "not available" shape. Shared by the heatmap (T-051j). */
export function CellResult({ summary }: { readonly summary: VisualPnlAggregationSummary }) {
  const short = summary.available ? describeVisualPnlCompactAmount(summary.total) : null;
  return <>
    {short !== null
      ? <span className="kairos-results-calendar__amount" data-cell-amount="" data-cell-length={short.length <= 5 ? undefined : short.length <= 7 ? String(short.length) : 'long'}>{short}</span>
      : <span className="kairos-results-calendar__amount"><Icon name="result-unknown" size={16} /></span>}
    <span className="kairos-results-calendar__count" data-cell-count="">{summary.tradeCount}</span>
  </>;
}

function MonthTotal({ monthKey, summary, pressed, onSelect }: { readonly monthKey: string; readonly summary: VisualPnlAggregationSummary; readonly pressed: boolean; readonly onSelect?: () => void }) {
  const name = `${monthLabel(monthKey).split(' ')[0]} total`;
  const trades = tradesWord(summary.tradeCount);
  const spoken = summary.available ? `${name}: ${OUTCOME_LABEL[summary.outcome]}, ${summary.total} ${summary.currency}, ${trades}` : `${name}: Result unavailable, ${unavailableWhy(summary.reason)}, ${trades}`;
  return <button type="button" className="kairos-results-calendar__month-total" aria-pressed={pressed} aria-label={spoken} onClick={onSelect}>
    {summary.available
      ? <ResultText outcome={summary.outcome} label={name} amount={summary.total} currency={summary.currency} />
      : <ResultText outcome="unavailable" label={`${name}: not available, ${unavailableWhy(summary.reason)}`} amount={null} />}
    <span> · {trades}</span>
  </button>;
}

function WeekCell({ week, pressed, onSelect }: { readonly week: VisualPnlMonthWeek | undefined; readonly pressed: boolean; readonly onSelect?: (week: VisualPnlMonthWeek) => void }) {
  if (week === undefined || week.summary === null || week.fromDayKey === null) return <td className="kairos-results-calendar__week" />;
  const result = week.summary.available ? week.summary.outcome : 'unavailable';
  return <td className="kairos-results-calendar__week" data-week-key={week.fromDayKey} data-week-result={result} data-week-strength={week.strength ?? undefined}>
    <button type="button" aria-pressed={pressed} aria-label={weekAriaLabel(week)} onClick={() => onSelect?.(week)}>
      <CellResult summary={week.summary} />
    </button>
  </td>;
}

/** The four colours of a result cell with their shapes and words. Shared by the heatmap (T-051j). */
export function ColourKey({ className = 'kairos-results-calendar__key' }: { readonly className?: string }) {
  return <p className={`kairos-results-calendar__legend ${className}`}>
    <span data-key="profit"><span className="kairos-results-calendar__swatch" /><Icon name="result-up" size={16} /> Profit</span> <span data-key="loss"><span className="kairos-results-calendar__swatch" /><Icon name="result-down" size={16} /> Loss</span> <span data-key="breakeven"><span className="kairos-results-calendar__swatch" /><Icon name="result-flat" size={16} /> Break-even</span> <span data-key="unavailable"><span className="kairos-results-calendar__swatch" /><Icon name="result-unknown" size={16} /> Not available</span>
  </p>;
}

/** The month calendar heatmap: presentational only, from a projected month grid (and, in the dashboard, its week and month totals). */
export function ResultsCalendar({ grid, selectedDayKey, canShowNextMonth, canShowPreviousMonth = true, outsideNote = null, onSelectDay, onPreviousMonth, onNextMonth, totals = null, selectedWeekKey = null, monthSelected = false, onSelectWeek, onSelectMonth }: ResultsCalendarProps) {
  const cells: (VisualPnlMonthGridDay | null)[] = [...Array.from({ length: grid.leadingEmptyCells }, () => null), ...grid.days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const hasResults = grid.days.some(day => day.summary !== null);

  return <div className="kairos-results-calendar-block">
    {canShowPreviousMonth || canShowNextMonth ? <div className="kairos-results-calendar__bar">
      <button type="button" className="kairos-results-calendar__nav" aria-label="Previous month" disabled={!canShowPreviousMonth} onClick={onPreviousMonth}>‹</button>
      <h3 tabIndex={-1}>{monthLabel(grid.monthKey)}</h3>
      <button type="button" className="kairos-results-calendar__nav" aria-label="Next month" disabled={!canShowNextMonth} onClick={onNextMonth}>›</button>
    </div> : <div className="kairos-results-calendar__bar"><h3 tabIndex={-1}>{monthLabel(grid.monthKey)}</h3></div>}
    <table className="kairos-results-calendar" data-week-column={totals !== null || undefined}>
      <thead><tr>{WEEKDAYS.map(([short, long]) => <th key={short} scope="col" abbr={long}>{short}</th>)}{totals !== null ? <th scope="col" abbr="Week total">Week</th> : null}</tr></thead>
      <tbody>
        {weeks.map((week, weekIndex) => <tr key={weekIndex}>
          {week.map((day, dayIndex) => day === null
            ? <td key={`empty-${dayIndex}`} className="kairos-results-calendar__empty" />
            : <td key={day.dayKey} data-day-key={day.dayKey} data-day-result={day.result} data-day-strength={day.strength ?? undefined} data-day-today={day.isToday || undefined} data-day-outside={day.inPeriod === false || undefined}>
              {day.summary && day.inPeriod !== false ? <button type="button" aria-pressed={selectedDayKey === day.dayKey} aria-label={dayAriaLabel(day)} onClick={() => onSelectDay(day.dayKey)}>
                <span className="kairos-results-calendar__day">{day.dayOfMonth}</span>
                <CellResult summary={day.summary} />
              </button> : <span className="kairos-results-calendar__number">{day.dayOfMonth}</span>}
            </td>)}
          {totals !== null ? <WeekCell week={totals.weeks[weekIndex]} pressed={selectedWeekKey !== null && selectedWeekKey === totals.weeks[weekIndex]?.fromDayKey} onSelect={onSelectWeek} /> : null}
        </tr>)}
      </tbody>
    </table>
    {totals?.month ? <MonthTotal monthKey={grid.monthKey} summary={totals.month} pressed={monthSelected} onSelect={onSelectMonth} /> : null}
    <ColourKey />
    <p className="kairos-results-calendar__legend">{totals !== null ? 'The small number is how many trades closed that day, or that week in the Week column.' : 'The small number is how many trades closed that day.'} Stronger colour means a bigger result in this month.</p>
    {grid.scale.kind === 'one-currency' ? <p className="kairos-results-calendar__legend">Amounts in {grid.scale.currency}.</p> : null}
    {grid.scale.kind === 'none' && grid.scale.reason === 'mixed-currencies'
      ? <p className="kairos-results-calendar__legend">{totals !== null
        ? 'Your days use different currencies, so colour strength is off: each amount is in its own day\'s currency. Tap a day to see it.'
        : 'Colour strength is off this month because your days use different currencies.'}</p>
      : null}
    {!hasResults ? <p className="kairos-results-calendar__legend">No closed trades in {monthLabel(grid.monthKey)}.</p> : null}
    {outsideNote ? <p className="kairos-results-calendar__legend">{outsideNote}</p> : null}
  </div>;
}
