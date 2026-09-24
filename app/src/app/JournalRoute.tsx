import { useState } from 'react';
import { JOURNAL_HISTORY_SOURCES } from '../application/journal';
import { JournalHistoryList } from './JournalHistoryList';
import { JournalDailyResults } from './JournalDailyResults';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { TradeForm } from '../features/journal/TradeForm';
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
  const pages = useJournalHistoryPages(db, 'real', historyStatus);

  return (
    <section className="kairos-route kairos-journal" aria-labelledby="kairos-journal-title">
      <div className="kairos-journal__heading">
        <div>
          <p className="kairos-journal__eyebrow">Manual trade</p>
          <h1 id="kairos-journal-title">Journal</h1>
        </div>
        <span className="kairos-journal__badge">Saved on this device</span>
      </div>
      <p className="kairos-journal__intro">Log the trade facts you know now. Plan numbers are optional and can be left blank.</p>

      <TradeForm db={db} kind="journal" onSaved={async () => { await pages.refresh(); setJournalRevision(current => current + 1); }} />

      <JournalDailyResults db={db} refreshRevision={journalRevision} now={now} />

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
      />
    </section>
  );
}
