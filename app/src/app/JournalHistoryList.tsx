import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import type { JournalHistoryEntry, JournalHistoryScope } from '../application/journal';
import { describeTimesRisked, projectTradeTimesRisked, signedText } from '../application/performance/tradeRisk';
import { Button, EmptyState, ErrorState, Field, ResultText, Select, Skeleton } from '../design-system/primitives';
import { tradeJournalAt, type TradeStatus } from '../domain/trades';
import { TradePicture } from '../features/journal/TradePicture';
import { tradePageHref } from '../features/journal/tradeAddress';
import { SCROLL_CLAIMED_EVENT } from './AppShell';

interface JournalHistoryListProps {
  readonly entries: readonly JournalHistoryEntry[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly statusFilter: TradeStatus | '';
  readonly onStatusFilterChange: (status: TradeStatus | '') => void;
  /** "Try again" after a failed load: loads the list again. */
  readonly onRetry?: () => void;
  /** Which trade pages the rows open: the Journal's (the default) or Practice's (D260). */
  readonly scope?: JournalHistoryScope;
  /** A notice for the list, such as what a trade's page said after a delete (D264). */
  readonly notice?: string;
  /** P12.A1 paging: another page of older trades can be loaded. */
  readonly hasOlder?: boolean;
  readonly isLoadingOlder?: boolean;
  readonly olderFailed?: boolean;
  readonly onShowOlder?: () => void;
  /**
   * U15 (D264): the list was opened after a trade's page deleted that trade. Its notice (else its heading) takes focus
   * on arrival, so the notice is read out: a live region that is already there when it appears is not announced.
   */
  readonly focusOnArrival?: boolean;
  /** U15 (D262): the search, filters and totals above the list. */
  readonly filterBar?: ReactNode;
  /** U15 (D266): under the list's heading: "Download as a spreadsheet". */
  readonly tools?: ReactNode;
  /** A filter other than the status is set: an empty list says no trade matches, with "Clear filters". */
  readonly filtered?: boolean;
  readonly onClearFilters?: () => void;
}

const STATUS_FILTERS = [
  { value: '', label: 'All trades' }, { value: 'draft', label: 'Planned' }, { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' }, { value: 'cancelled', label: 'Cancelled' },
] as const;

function statusLabel(status: TradeStatus): string {
  if (status === 'draft') return 'Planned';
  if (status === 'open') return 'Open';
  if (status === 'closed') return 'Closed';
  return 'Cancelled';
}

const sideLabel = (side: JournalHistoryEntry['trade']['side']): string => (side === 'long' ? 'Long' : 'Short');

function journalDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

/** × what you risked for a row, from its owner; null when it can't be worked out (never 0). */
function timesRisked(entry: JournalHistoryEntry): string | null {
  const ratio = projectTradeTimesRisked(entry);
  return ratio.available ? describeTimesRisked(ratio.value) : null;
}

/**
 * The row's one name (D261), which holds every word the row shows: "BTCUSDT long, closed, opened 24 Oct 2026, profit
 * +10 USDT, +2× what you risked"; "SOLUSDT short, planned 1 Oct 2026"; "…, from replay, …". A trade that isn't closed
 * has no result yet, so it says only what it is.
 */
function rowName(entry: JournalHistoryEntry, times: string | null): string {
  const { trade, visualPnl } = entry;
  const date = journalDate(tradeJournalAt(trade));
  const parts = [`${trade.symbol} ${trade.side}`];
  if (trade.source === 'replay') parts.push('from replay');
  if (trade.status === 'draft') parts.push(`planned ${date}`);
  else parts.push(statusLabel(trade.status).toLowerCase(), `${trade.openedAt ? 'opened' : 'planned'} ${date}`);
  if (trade.status === 'closed') {
    parts.push(visualPnl.amount === null || visualPnl.outcome === 'unavailable'
      ? 'result not available'
      : `${visualPnl.label.toLowerCase()} ${signedText(visualPnl.amount)}${visualPnl.currency ? ` ${visualPnl.currency}` : ''}`);
    if (times !== null) parts.push(times);
  }
  return parts.join(', ');
}

/** SPA navigation inside the app, a plain link outside a router (the list renders outside one in some tests). */
function RowLink({ to, label, children }: { readonly to: string; readonly label: string; readonly children: ReactNode }) {
  return useInRouterContext()
    ? <Link to={to} className="kairos-history-card__link" aria-label={label}>{children}</Link>
    : <a href={to} className="kairos-history-card__link" aria-label={label}>{children}</a>;
}

/**
 * U15 (D261): the Journal's and Practice's list, one short row per trade, newest first (D259). A row is one link to the
 * trade's page (D260), where everything that changes a trade lives: one tab stop per trade.
 */
export function JournalHistoryList({ entries, isLoading, errorMessage, statusFilter, onStatusFilterChange, onRetry, scope = 'real', notice, hasOlder = false, isLoadingOlder = false, olderFailed = false, onShowOlder, focusOnArrival = false, filterBar, tools, filtered = false, onClearFilters }: JournalHistoryListProps) {
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  // Before the shell moves focus to the page's own heading (D179; a screen's effects run before the shell's), and the
  // shell stops reaching for the page's old place, so what took focus stays in view.
  useEffect(() => {
    if (!focusOnArrival) return;
    (noticeRef.current ?? heading.current)?.focus();
    window.dispatchEvent(new Event(SCROLL_CLAIMED_EVENT));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // "Try again" unmounts its own error box, so focus would fall to the page (WCAG 2.4.3). When it had focus, focus goes
  // to what the retry settles on: the heading or the first new row after it works, the new "Try again" when it fails.
  // `tapped` is the "Try again" itself: React may run the effect for the screen the tap was made on after the tap, and that
  // run, which would focus the tapped button, is skipped.
  const refocus = useRef<{ readonly kind: 'load'; readonly tapped: Element } | { readonly kind: 'older'; readonly shown: number; readonly tapped: Element } | null>(null);
  const tappedRetry = (): Element | null => { const active = document.activeElement; return active?.closest('.kairos-error-state') != null ? active : null; };
  const retryLoad = onRetry === undefined ? undefined : () => { const tapped = tappedRetry(); refocus.current = tapped ? { kind: 'load', tapped } : null; onRetry(); };
  const retryOlder = onShowOlder === undefined ? undefined : () => { const tapped = tappedRetry(); refocus.current = tapped ? { kind: 'older', shown: entries.length, tapped } : null; onShowOlder(); };

  useEffect(() => {
    const target = refocus.current;
    if (target === null || (target.kind === 'load' ? isLoading : isLoadingOlder)) return;
    const root = section.current;
    if (root === null) return;
    const firstFocusable = (element: Element | null | undefined) => element?.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])');
    const next = target.kind === 'load'
      ? (errorMessage ? firstFocusable(root.querySelector('.kairos-history__load-error')) : heading.current)
      : (olderFailed
        ? firstFocusable(root.querySelector('.kairos-history__older-error'))
        : firstFocusable(root.querySelectorAll('.kairos-history-card')[target.shown]) ?? root.querySelector<HTMLElement>('.kairos-history__older:not([disabled])')) ?? heading.current;
    if (next === target.tapped) return;
    refocus.current = null;
    next?.focus();
  }, [isLoading, isLoadingOlder, errorMessage, olderFailed, entries.length]);

  return (
    <section ref={section} className="kairos-history" aria-labelledby="kairos-history-title" aria-busy={isLoading || undefined}>
      <div className="kairos-history__heading">
        <div>
          <p className="kairos-journal__eyebrow">Saved locally</p>
          <h2 id="kairos-history-title" ref={heading} tabIndex={-1}>Trade history</h2>
        </div>
        <span className="kairos-history__count">{entries.length} shown</span>
      </div>
      {tools}

      {filterBar}
      <div className="kairos-history__controls">
        <Field label="Show trades" id="kairos-history-status-filter" className="kairos-history__filter">
          {control => <Select {...control} name="historyStatusFilter" value={statusFilter} options={STATUS_FILTERS}
            onChange={(event) => onStatusFilterChange(event.target.value as TradeStatus | '')} />}
        </Field>
      </div>

      {errorMessage ? <ErrorState className="kairos-history__load-error" message={errorMessage} onRetry={retryLoad} /> : null}
      {notice ? <p ref={noticeRef} tabIndex={-1} className="kairos-history__state" role="status">{notice}</p> : null}
      {isLoading ? <Skeleton label="Loading trade history…" live={false} /> : null}
      {!isLoading && !errorMessage && entries.length === 0 ? (
        filtered && onClearFilters
          // Its "Clear filters" goes once the list fills: focus moves to the list's heading, never the page.
          ? <EmptyState icon="journal" headingLevel={3} title="No trades match these filters."
            action={<Button variant="secondary" size="sm" onClick={() => { onClearFilters(); heading.current?.focus(); }}>Clear filters</Button>} />
          : statusFilter === ''
          ? <EmptyState icon="journal" headingLevel={3} title="No saved trades yet" message="Your first saved trade will appear here." />
          : <EmptyState icon="journal" headingLevel={3} title={`No ${statusLabel(statusFilter).toLowerCase()} trades found.`}
            action={<Button variant="secondary" size="sm" onClick={() => { onStatusFilterChange(''); heading.current?.focus(); }}>Show all trades</Button>} />
      ) : null}

      {!isLoading && !errorMessage && entries.length > 0 ? (
        <ol className="kairos-history__list">
          {entries.map(entry => {
            const { trade, visualPnl } = entry;
            const journalAt = tradeJournalAt(trade);
            const times = trade.status === 'closed' ? timesRisked(entry) : null;
            return (
              <li className="kairos-history-card" key={trade.id} data-trade-id={trade.id}>
                <RowLink to={tradePageHref(trade.id, scope)} label={rowName(entry, times)}>
                  <TradePicture entry={entry} variant="row" />
                  <span className="kairos-history-card__main">
                    <span className="kairos-history-card__topline">
                      <strong>{trade.symbol}</strong>
                      <span>{sideLabel(trade.side)}</span>
                      {trade.status !== 'closed' ? <span className="kairos-history-card__status">{statusLabel(trade.status)}</span> : null}
                      {trade.source === 'replay' ? <span className="kairos-history-card__source">From replay</span> : null}
                    </span>
                    <time dateTime={journalAt}>{journalDate(journalAt)}</time>
                  </span>
                  {trade.status === 'closed' ? <span className="kairos-history-card__result">
                    <ResultText outcome={visualPnl.outcome} label={visualPnl.label} amount={visualPnl.amount} currency={visualPnl.currency} showLabel={visualPnl.outcome === 'unavailable'}
                      className={`kairos-history-card__outcome kairos-history-card__outcome--${visualPnl.outcome}`} />
                    {times !== null ? <span className="kairos-history-card__times">{times}</span> : null}
                  </span> : null}
                </RowLink>
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
      {olderFailed ? <ErrorState className="kairos-history__older-error" message="Kairos could not load older trades. Your stored trades were not changed." onRetry={retryOlder} /> : null}
    </section>
  );
}
