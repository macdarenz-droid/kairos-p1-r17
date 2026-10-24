import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadTradedMarkets } from '../application/setup/tradedMarkets';
import { Link, Navigate, useInRouterContext, useSearchParams } from 'react-router';
import { JOURNAL_CHANGED_EVENT } from './AppShell';
import { LOG_TRADE_ADDRESS } from '../features/setup/GettingStartedCard';
import { BackupReminderCard } from '../features/backup/BackupReminderCard';
import { askToKeepDataOnce } from '../application/setup/deviceKeeping';
import { JournalHistoryList } from './JournalHistoryList';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { MarketType as TradeMarket, TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { TradeForm } from '../features/journal/TradeForm';
import { Card, PageHeader, useToast } from '../design-system/primitives';
import { CoachCard } from '../features/discipline/CoachCard';
import { useJournalHistoryPages } from '../features/journal/useJournalHistoryPages';
import { useArrivedNotice } from '../features/journal/tradeAddress';

interface JournalRouteProps {
  readonly db?: KairosDatabase;
  /** What a trade's page said when it sent you here (a delete, D264): shown in the list, with focus on its heading. */
  readonly arrivedNotice?: string;
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
 * D258: the old log address `/journal?log=1` (an app shortcut installed before, a bookmark) opens the log page in its
 * place, before the Journal reads anything.
 */
export function JournalRoute(props: JournalRouteProps) {
  return useInRouterContext() ? <JournalAddress {...props} /> : <JournalPage {...props} />;
}

function JournalAddress(props: JournalRouteProps) {
  const [params] = useSearchParams();
  const arrivedNotice = useArrivedNotice();
  return params.get('log') === '1' ? <Navigate to={LOG_TRADE_ADDRESS} replace /> : <JournalPage {...props} arrivedNotice={arrivedNotice} />;
}

function JournalPage({ db = kairosDatabase, now, arrivedNotice }: JournalRouteProps) {
  // What a trade's page said when it sent you here (a delete); a new save here replaces it.
  const [listNotice, setListNotice] = useState(arrivedNotice ?? '');
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [journalRevision, setJournalRevision] = useState(0);
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

      <BackupReminderCard db={db} now={now ?? wallClock} />
      <TradeForm db={db} kind="journal" defaultMarket={firstMarket} onSaved={async () => { keepMyData(); setListNotice(''); await pages.refresh(); setJournalRevision(current => current + 1); }} />

      <Card className="kairos-journal__results-link">
        <h2>Your results</h2>
        <p>Your calendar, your numbers and their pictures are in Analysis. <JournalLink to="/analysis">Open your results</JournalLink></p>
      </Card>
      <CoachCard db={db} scope="real" now={now ?? wallClock} refreshRevision={journalRevision} disciplineRevision={0} />

      <JournalHistoryList
        scope="real"
        notice={listNotice}
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
        focusOnArrival={arrivedNotice !== undefined}
      />
    </section>
  );
}
