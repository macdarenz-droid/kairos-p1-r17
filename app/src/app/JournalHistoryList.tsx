import type { JournalHistoryEntry } from '../application/journal';
import type { TradeSource, TradeStatus } from '../domain/trades';
import { TradePicture } from '../features/journal/TradePicture';
import { ReviewTradeLink } from './ReviewTradeLink';
import { JournalOpenTradeUpdate } from './JournalOpenTradeUpdate';
import { JournalDraftTradeActivation } from './JournalDraftTradeActivation';
import { JournalTradeDeleteControl } from './JournalTradeDeleteControl';
import type { KairosDatabase } from '../data/database';

interface JournalHistoryListProps {
  readonly entries: readonly JournalHistoryEntry[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly statusFilter: TradeStatus | '';
  readonly onStatusFilterChange: (status: TradeStatus | '') => void;
  readonly db?: KairosDatabase;
  readonly onTradeUpdated?: () => Promise<void>;
  readonly updateNotice?: string;
  /** P30.2: mounts the confirmed delete control on each card; receives the notice to show after the store changed. */
  readonly onTradeDeleted?: (notice: string) => Promise<void>;
  /** P31.2: mounts the draft activation control on manual draft cards; receives the notice to show after the draft became open. */
  readonly onTradeOpened?: (notice: string) => Promise<void>;
  /** P35.2: which trade sources the update and activation controls may touch. Defaults to `['manual']`, so the Journal is unchanged; the Practice route names `['paper']`. */
  readonly allowedSources?: readonly TradeSource[];
}

function statusLabel(status: JournalHistoryEntry['trade']['status']): string {
  if (status === 'draft') return 'Draft';
  if (status === 'open') return 'Open';
  if (status === 'closed') return 'Closed';
  return 'Cancelled';
}

function sideLabel(side: JournalHistoryEntry['trade']['side']): string {
  return side === 'long' ? 'Long' : 'Short';
}

function visualPnlAmount(entry: JournalHistoryEntry): string {
  const { visualPnl } = entry;
  if (visualPnl.amount === null) return 'Not available';
  return visualPnl.currency ? `${visualPnl.amount} ${visualPnl.currency}` : visualPnl.amount;
}

function money(value: string | null | undefined, currency: string | null | undefined): string {
  return value == null ? 'Not available' : currency ? `${value} ${currency}` : value;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function JournalHistoryList({ entries, isLoading, errorMessage, statusFilter, onStatusFilterChange, db, onTradeUpdated, updateNotice, onTradeDeleted, onTradeOpened, allowedSources = ['manual'] }: JournalHistoryListProps) {
  return (
    <section className="kairos-history" aria-labelledby="kairos-history-title" aria-busy={isLoading || undefined}>
      <div className="kairos-history__heading">
        <div>
          <p className="kairos-journal__eyebrow">Saved locally</p>
          <h2 id="kairos-history-title">Trade history</h2>
        </div>
        <span className="kairos-history__count">{entries.length} shown</span>
      </div>

      <div className="kairos-history__controls">
        <label className="kairos-field kairos-history__filter" htmlFor="kairos-history-status-filter">
          <span>Show trades</span>
          <select
            id="kairos-history-status-filter"
            name="historyStatusFilter"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as TradeStatus | '')}
          >
            <option value="">All trades</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      {errorMessage ? <p className="kairos-history__state kairos-history__state--error" role="alert">{errorMessage}</p> : null}
      {updateNotice ? <p className="kairos-history__state" role="status">{updateNotice}</p> : null}
      {isLoading ? <p className="kairos-history__state" aria-live="polite">Loading trade history…</p> : null}
      {!isLoading && !errorMessage && entries.length === 0 ? (
        <p className="kairos-history__state">
          {statusFilter === '' ? 'No saved trades yet. Your first saved trade will appear here.' : `No ${statusLabel(statusFilter).toLowerCase()} trades found.`}
        </p>
      ) : null}

      {!isLoading && !errorMessage && entries.length > 0 ? (
        <ol className="kairos-history__list">
          {entries.map((entry) => {
            const timestamp = entry.trade.closedAt ?? entry.trade.openedAt ?? entry.trade.updatedAt;
            return (
              <li className="kairos-history-card" key={entry.trade.id}>
                <div className="kairos-history-card__topline">
                  <strong>{entry.trade.symbol}</strong>
                  <span>{sideLabel(entry.trade.side)}</span>
                  <span>{statusLabel(entry.trade.status)}</span>
                </div>
                <time dateTime={timestamp}>{formatTimestamp(timestamp)}</time>
                <ReviewTradeLink id={entry.trade.id} className="kairos-history-card__review" />
                {db && onTradeUpdated ? <JournalOpenTradeUpdate entry={entry} db={db} onCommitted={onTradeUpdated} allowedSources={allowedSources} /> : null}
                {db && onTradeOpened ? <JournalDraftTradeActivation entry={entry} db={db} onOpened={onTradeOpened} allowedSources={allowedSources} /> : null}
                {db && onTradeDeleted ? <JournalTradeDeleteControl entry={entry} db={db} onDeleted={onTradeDeleted} /> : null}
                <div className={`kairos-history-card__outcome kairos-history-card__outcome--${entry.visualPnl.outcome}`} data-outcome={entry.visualPnl.outcome}>
                  <span className="kairos-history-card__outcome-mark" aria-hidden="true">{entry.visualPnl.outcome === 'profit' ? '▲' : entry.visualPnl.outcome === 'loss' ? '▼' : entry.visualPnl.outcome === 'breakeven' ? '—' : '·'}</span>
                  <span>{entry.visualPnl.label}</span>
                  <strong>{visualPnlAmount(entry)}</strong>
                </div>
                <TradePicture entry={entry} variant="thumbnail" />
                <dl className="kairos-history-card__facts">
                  <div><dt>Entries and exits</dt><dd>{entry.executions.length}</dd></div>
                  <div><dt>Fees</dt><dd>{entry.fees.length}</dd></div>
                  <div><dt>Result before fees</dt><dd>{money(entry.metrics?.grossPnl, entry.trade.grossPnlCurrency)}</dd></div>
                  <div><dt>Result after fees</dt><dd>{entry.metrics?.netPnl != null && entry.metrics.netPnlCurrency ? money(entry.metrics.netPnl, entry.metrics.netPnlCurrency) : entry.metrics?.netPnl ?? 'Not available'}</dd></div>
                </dl>
                {entry.fees.length > 0 && entry.metrics?.grossPnl != null && entry.metrics.netPnl == null ? <p className="kairos-history-card__notice">
                  {entry.trade.grossPnlCurrency ? 'Result after fees needs fees in the same currency as your recorded prices. Kairos does not convert currencies.' : 'The price currency is not recorded, so fees cannot be taken off yet.'}
                </p> : null}
                {entry.metricsError ? <p className="kairos-history-card__notice">Some results are not available for this trade.</p> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
