import { useState } from 'react';
import { JOURNAL_HISTORY_SOURCES } from '../application/journal';
import { JournalHistoryList } from './JournalHistoryList';
import { JournalDailyResults } from './JournalDailyResults';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { TradeForm } from '../features/journal/TradeForm';
import { PageHeader } from '../design-system/primitives';
import { useJournalHistoryPages } from '../features/journal/useJournalHistoryPages';

interface JournalRouteProps {
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string, for Daily results; tests inject a fixed one. */
  readonly now?: () => string;
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

      <JournalDailyResults db={db} refreshRevision={journalRevision} now={now} disciplineRevision={disciplineRevision} />

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
        statusFilter={historyStatus}
        onStatusFilterChange={setHistoryStatus}
        onDisciplineSaved={() => setDisciplineRevision(value => value + 1)}
      />
    </section>
  );
}
