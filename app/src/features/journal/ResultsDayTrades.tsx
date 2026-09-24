import type { ReactNode } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import { dayLabel } from './ResultsCalendar';

export type ResultsDayTradesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly entries: readonly JournalHistoryEntry[] };

interface ResultsDayTradesProps {
  readonly dayKey: string;
  readonly timeZone: string;
  readonly state: ResultsDayTradesState;
  readonly renderTradeLink: (id: string) => ReactNode;
  readonly onClose: () => void;
}

function amount(entry: JournalHistoryEntry): string {
  const { visualPnl } = entry;
  if (visualPnl.amount === null) return 'Not available';
  return visualPnl.currency ? `${visualPnl.amount} ${visualPnl.currency}` : visualPnl.amount;
}

function outcomeMark(outcome: JournalHistoryEntry['visualPnl']['outcome']): string {
  return outcome === 'profit' ? '▲' : outcome === 'loss' ? '▼' : outcome === 'breakeven' ? '—' : '·';
}

/** The closed trades of one calendar day, under the month calendar. */
export function ResultsDayTrades({ dayKey, timeZone, state, renderTradeLink, onClose }: ResultsDayTradesProps) {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
  return <div className="kairos-results-day-trades">
    <div className="kairos-results-day-trades__heading">
      <h3>Trades closed on {dayLabel(dayKey)}</h3>
      <button type="button" className="kairos-results-day-trades__close" onClick={onClose}>Close</button>
    </div>
    {state.kind === 'loading' ? <p className="kairos-pnl-calendar__notice">Loading this day's trades…</p> : null}
    {state.kind === 'error' ? <p className="kairos-pnl-calendar__notice" role="alert">Kairos could not load this day's trades. Your stored trades were not changed.</p> : null}
    {state.kind === 'ready' ? <ul className="kairos-results-day-trades__list">
      {state.entries.map(entry => <li key={entry.trade.id} data-outcome={entry.visualPnl.outcome}>
        <strong>{entry.trade.symbol}</strong>
        <span>{entry.trade.side === 'long' ? 'Long' : 'Short'}</span>
        <span><span aria-hidden="true">{outcomeMark(entry.visualPnl.outcome)}</span> {entry.visualPnl.label} {amount(entry)}</span>
        {entry.trade.closedAt ? <time dateTime={entry.trade.closedAt}>{time.format(new Date(entry.trade.closedAt))}</time> : null}
        {renderTradeLink(entry.trade.id)}
      </li>)}
    </ul> : null}
  </div>;
}
