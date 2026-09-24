import type { VisualPnlDailySummaryProjection } from '../application/visual-pnl';

interface VisualPnlCalendarProps {
  readonly projection: VisualPnlDailySummaryProjection;
}

function dayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-');
  return `${day}/${month}/${year}`;
}

function outcomeLabel(outcome: 'profit' | 'loss' | 'breakeven'): string {
  if (outcome === 'profit') return 'Profit';
  if (outcome === 'loss') return 'Loss';
  return 'Break-even';
}

function outcomeMark(outcome: 'profit' | 'loss' | 'breakeven'): string {
  if (outcome === 'profit') return '▲';
  if (outcome === 'loss') return '▼';
  return '—';
}

function unavailableLabel(reason: string): string {
  if (reason === 'mixed-currencies') return 'Mixed currencies';
  if (reason === 'unavailable-trade-outcome') return 'Result unavailable';
  if (reason === 'missing-currency-evidence') return 'Currency unavailable';
  if (reason === 'no-trades') return 'No comparable trades';
  return 'Result unavailable';
}

/**
 * Accessible first Visual P&L calendar surface.
 *
 * This component presents only P13.7/P13.8 authoritative daily summaries.
 * It performs no financial arithmetic, FX, day grouping, database access, or
 * timezone selection.
 */
export function VisualPnlCalendar({ projection }: VisualPnlCalendarProps) {
  return (
    <section className="kairos-pnl-calendar" aria-labelledby="kairos-pnl-calendar-title">
      <div className="kairos-pnl-calendar__heading">
        <div>
          <p className="kairos-journal__eyebrow">Visual P&amp;L</p>
          <h2 id="kairos-pnl-calendar-title">Daily results</h2>
        </div>
        <span className="kairos-pnl-calendar__count">{projection.days.length} days</span>
      </div>

      {projection.days.length === 0 ? (
        <p className="kairos-pnl-calendar__state">No closed-trade daily results to show yet.</p>
      ) : (
        <ol className="kairos-pnl-calendar__grid" aria-label="Daily profit and loss results">
          {projection.days.map((day) => {
            const { summary } = day;
            const kind = summary.available ? summary.outcome : 'unavailable';
            const label = summary.available ? outcomeLabel(summary.outcome) : unavailableLabel(summary.reason);
            const mark = summary.available ? outcomeMark(summary.outcome) : '·';
            const amount = summary.available ? `${summary.total} ${summary.currency}` : 'Not available';

            return (
              <li
                className={`kairos-pnl-day kairos-pnl-day--${kind}`}
                data-day-outcome={kind}
                key={day.dayKey}
              >
                <time dateTime={day.dayKey}>{dayLabel(day.dayKey)}</time>
                <span className="kairos-pnl-day__result">
                  <span className="kairos-pnl-day__mark" aria-hidden="true">{mark}</span>
                  <span>{label}</span>
                </span>
                <strong>{amount}</strong>
                <small>{summary.tradeCount} {summary.tradeCount === 1 ? 'trade' : 'trades'}</small>
              </li>
            );
          })}
        </ol>
      )}

      {projection.blockedTrades.length > 0 ? (
        <p className="kairos-pnl-calendar__notice">
          {projection.blockedTrades.length} {projection.blockedTrades.length === 1 ? 'trade is' : 'trades are'} not assigned to a daily result.
        </p>
      ) : null}
    </section>
  );
}
