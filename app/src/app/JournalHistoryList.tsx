import { JOURNAL_HISTORY_SOURCES, type JournalHistoryEntry, type JournalHistoryScope } from '../application/journal';
import { saveTradeDiscipline } from '../application/discipline';
import { Button } from '../design-system/primitives';
import { TradeChecklistControl } from '../features/discipline/TradeChecklistControl';
import { TradeReviewControl } from '../features/discipline/TradeReviewControl';
import { useTradeDisciplineCards } from '../features/discipline/useTradeDisciplineCards';
import type { TradeSource, TradeStatus } from '../domain/trades';
import { TradePicture } from '../features/journal/TradePicture';
import { ReviewTradeLink } from './ReviewTradeLink';
import { JournalOpenTradeUpdate } from './JournalOpenTradeUpdate';
import { JournalDraftTradeActivation } from './JournalDraftTradeActivation';
import { JournalTradeDeleteControl } from './JournalTradeDeleteControl';
import type { KairosDatabase } from '../data/database';
import { updateTradeExecution } from '../application/trades';
import { EntriesAndExitsEditor } from '../features/journal/EntriesAndExitsEditor';

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
  /** P12.A1 paging: another page of older trades can be loaded. */
  readonly hasOlder?: boolean;
  readonly isLoadingOlder?: boolean;
  readonly olderFailed?: boolean;
  readonly onShowOlder?: () => void;
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

export function JournalHistoryList({ entries, isLoading, errorMessage, statusFilter, onStatusFilterChange, db, onTradeUpdated, updateNotice, onTradeDeleted, onTradeOpened, allowedSources = ['manual'], hasOlder = false, isLoadingOlder = false, olderFailed = false, onShowOlder }: JournalHistoryListProps) {
  const discipline = useTradeDisciplineCards(db, entries.map(entry => entry.trade.id));
  // Journal passes the real sources, Practice the paper one; the discipline writer needs the page's scope.
  const scope: JournalHistoryScope = allowedSources.some(source => (JOURNAL_HISTORY_SOURCES.practice as readonly TradeSource[]).includes(source)) ? 'practice' : 'real';
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
                {db && (entry.trade.status === 'draft' || entry.trade.status === 'open') && allowedSources.includes(entry.trade.source)
                  ? discipline.state.kind === 'ready'
                    ? <TradeChecklistControl symbol={entry.trade.symbol} tradeId={entry.trade.id} scope={scope} items={discipline.state.lists.checklist} record={discipline.state.records.get(entry.trade.id) ?? null} save={input => saveTradeDiscipline(db, input)} onSaved={discipline.remember} />
                    : discipline.state.kind === 'failed' ? <Button variant="secondary" size="sm" disabled>Before you trade: could not load</Button> : null
                  : null}
                {db && entry.trade.status === 'closed' && allowedSources.includes(entry.trade.source)
                  ? discipline.state.kind === 'ready'
                    ? <TradeReviewControl symbol={entry.trade.symbol} tradeId={entry.trade.id} scope={scope} reviewItems={discipline.state.lists.review} mistakeItems={discipline.state.lists.mistakes} record={discipline.state.records.get(entry.trade.id) ?? null} save={input => saveTradeDiscipline(db, input)} onSaved={discipline.remember} />
                    : discipline.state.kind === 'failed' ? <Button variant="secondary" size="sm" disabled>After the trade: could not load</Button> : null
                  : null}
                {db && onTradeUpdated ? <JournalOpenTradeUpdate entry={entry} db={db} onCommitted={onTradeUpdated} allowedSources={allowedSources} /> : null}
                {db && onTradeUpdated && allowedSources.includes(entry.trade.source) ? <EntriesAndExitsEditor entry={entry} save={input => updateTradeExecution(db, { ...input, allowedSources })} onSaved={onTradeUpdated} /> : null}
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
      {!isLoading && !errorMessage && entries.length > 0 && hasOlder && onShowOlder ? (
        <button type="button" className="kairos-history__older" onClick={onShowOlder} disabled={isLoadingOlder}>
          {isLoadingOlder ? 'Loading older trades…' : 'Show older trades'}
        </button>
      ) : null}
      {olderFailed ? <p className="kairos-history__state kairos-history__state--error" role="alert">Kairos could not load older trades. Your stored trades were not changed.</p> : null}
    </section>
  );
}
