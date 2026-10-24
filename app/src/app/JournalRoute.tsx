import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadTradedMarkets } from '../application/setup/tradedMarkets';
import { Link, useInRouterContext, useSearchParams } from 'react-router';
import { JOURNAL_CHANGED_EVENT, SCROLL_CLAIMED_EVENT } from './AppShell';
import { BackupReminderCard } from '../features/backup/BackupReminderCard';
import { askToKeepDataOnce } from '../application/setup/deviceKeeping';
import { JOURNAL_HISTORY_SOURCES } from '../application/journal';
import { JournalHistoryList, type HistoryNotice } from './JournalHistoryList';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { MarketType as TradeMarket, TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { TradeForm } from '../features/journal/TradeForm';
import { Card, PageHeader, useToast } from '../design-system/primitives';
import { CoachCard } from '../features/discipline/CoachCard';
import { useJournalHistoryPages } from '../features/journal/useJournalHistoryPages';

interface JournalRouteProps {
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string, for the coach card; tests inject a fixed one. */
  readonly now?: () => string;
}

/** A stable default clock, as in GoalsRoute. */
const wallClock = (): string => new Date().toISOString();

/** SPA navigation inside the app, a plain link outside a router (JournalRoute renders outside one in tests). */
function JournalLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/**
 * D225: `/journal?log=1` (the "+ Log trade" button, the app shortcut, Getting started) brings the trade form into
 * view and focuses its first field, then takes `log` out of the address so Back does not do it again.
 */
function LogAddress() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('log') === '1';
  useEffect(() => {
    if (!asked) return;
    const symbol = document.getElementById('kairos-trade-symbol');
    if (symbol !== null) {
      window.dispatchEvent(new Event(SCROLL_CLAIMED_EVENT));
      symbol.scrollIntoView({ block: 'start' });
      symbol.focus({ preventScroll: true });
    }
    const kept = new URLSearchParams(params);
    kept.delete('log');
    setParams(kept, { replace: true });
  }, [asked, params, setParams]);
  return null;
}

export function JournalRoute({ db = kairosDatabase, now }: JournalRouteProps) {
  const [updateNotice, setUpdateNotice] = useState<HistoryNotice>('');
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [journalRevision, setJournalRevision] = useState(0);
  const [disciplineRevision, setDisciplineRevision] = useState(0);
  const inRouter = useInRouterContext();
  // D223: the trade form starts on the first market the trader trades (none saved: blank, as before).
  const [firstMarket, setFirstMarket] = useState<TradeMarket | null>(null);
  useEffect(() => {
    let ignore = false;
    loadTradedMarkets(db).then(markets => { if (!ignore) setFirstMarket(markets?.[0] ?? null); }, () => undefined);
    return () => { ignore = true; };
  }, [db]);
  const pages = useJournalHistoryPages(db, 'real', historyStatus);
  // D229: another tab saved; the list (and the coach card) read again.
  const { refresh: refreshPages } = pages;
  useEffect(() => {
    const changed = () => { void refreshPages(); setJournalRevision(current => current + 1); };
    window.addEventListener(JOURNAL_CHANGED_EVENT, changed);
    return () => window.removeEventListener(JOURNAL_CHANGED_EVENT, changed);
  }, [refreshPages]);
  const toast = useToast();
  // D228: "Keep my data" is asked once, after a trade is saved here (never in Practice); one ask at a time.
  const asking = useRef(false);
  const keepMyData = () => {
    if (asking.current) return;
    asking.current = true;
    void askToKeepDataOnce(db, undefined, { now: now ?? wallClock }).then(result => {
      if (result === 'kept') toast.show({ message: 'Kairos will keep your journal on this device.' });
    }).finally(() => { asking.current = false; });
  };

  return (
    <section className="kairos-route kairos-journal" aria-labelledby="kairos-journal-title">
      <PageHeader eyebrow="Manual trade" title="Journal" titleId="kairos-journal-title" intro="Log what you know now; plan numbers are optional."
        action={<span className="kairos-journal__badge">Saved on this device</span>} />

      {inRouter ? <LogAddress /> : null}
      <BackupReminderCard db={db} now={now ?? wallClock} />
      <TradeForm db={db} kind="journal" defaultMarket={firstMarket} onSaved={async () => { keepMyData(); await pages.refresh(); setJournalRevision(current => current + 1); }} />

      <Card className="kairos-journal__results-link">
        <h2>Your results</h2>
        <p>Your calendar, your numbers and their pictures are in Analysis. <JournalLink to="/analysis">Open your results</JournalLink></p>
      </Card>
      <CoachCard db={db} scope="real" now={now ?? wallClock} refreshRevision={journalRevision} disciplineRevision={disciplineRevision} />

      <JournalHistoryList
        db={db}
        allowedSources={JOURNAL_HISTORY_SOURCES.real}
        updateNotice={updateNotice}
        onTradeUpdated={async closedTradeId => { await pages.refresh(); setJournalRevision(current => current + 1); setUpdateNotice(closedTradeId ? { kind: 'closed', tradeId: closedTradeId } : 'Trade updated. Your saved details are below.'); }}
        onTradeDeleted={async notice => { await pages.refresh(); setJournalRevision(current => current + 1); setUpdateNotice(notice); }}
        onTradeOpened={async notice => { await pages.refresh(); setJournalRevision(current => current + 1); setUpdateNotice(notice); }}
        entries={pages.entries}
        isLoading={pages.isLoading}
        errorMessage={pages.failed ? 'Kairos could not load your saved trade history. Your stored trades were not changed.' : null}
        hasOlder={pages.hasOlder}
        isLoadingOlder={pages.isLoadingOlder}
        olderFailed={pages.olderFailed}
        onShowOlder={pages.showOlder}
        onRetry={pages.refresh}
        statusFilter={historyStatus}
        onStatusFilterChange={setHistoryStatus}
        onDisciplineSaved={() => setDisciplineRevision(value => value + 1)}
      />
    </section>
  );
}
