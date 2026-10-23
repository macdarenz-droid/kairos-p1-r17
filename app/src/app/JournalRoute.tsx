import { useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { JOURNAL_HISTORY_SOURCES } from '../application/journal';
import { JournalHistoryList } from './JournalHistoryList';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { TradeForm } from '../features/journal/TradeForm';
import { Card, PageHeader } from '../design-system/primitives';
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

export function JournalRoute({ db = kairosDatabase, now }: JournalRouteProps) {
  const [updateNotice, setUpdateNotice] = useState('');
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [journalRevision, setJournalRevision] = useState(0);
  const [disciplineRevision, setDisciplineRevision] = useState(0);
  const pages = useJournalHistoryPages(db, 'real', historyStatus);

  return (
    <section className="kairos-route kairos-journal" aria-labelledby="kairos-journal-title">
      <PageHeader eyebrow="Manual trade" title="Journal" titleId="kairos-journal-title" intro="Log what you know now; plan numbers are optional."
        action={<span className="kairos-journal__badge">Saved on this device</span>} />

      <TradeForm db={db} kind="journal" onSaved={async () => { await pages.refresh(); setJournalRevision(current => current + 1); }} />

      <Card className="kairos-journal__results-link">
        <h2>Your results</h2>
        <p>Your calendar, your numbers and their pictures are in Analysis. <JournalLink to="/analysis">Open your results</JournalLink></p>
      </Card>
      <CoachCard db={db} scope="real" now={now ?? wallClock} refreshRevision={journalRevision} disciplineRevision={disciplineRevision} />

      <JournalHistoryList
        db={db}
        allowedSources={JOURNAL_HISTORY_SOURCES.real}
        updateNotice={updateNotice}
        onTradeUpdated={async () => { await pages.refresh(); setJournalRevision(current => current + 1); setUpdateNotice('Trade updated. Your saved details are below.'); }}
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
