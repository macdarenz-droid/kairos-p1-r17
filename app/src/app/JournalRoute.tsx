import { useCallback, useEffect, useRef, useState } from 'react';
import { JOURNAL_HISTORY_SOURCES, listJournalHistory, type JournalHistoryEntry } from '../application/journal';
import { JournalHistoryList } from './JournalHistoryList';
import { JournalDailyResults } from './JournalDailyResults';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { TradeForm } from '../features/journal/TradeForm';

interface JournalRouteProps {
  readonly db?: KairosDatabase;
}

export function JournalRoute({ db = kairosDatabase }: JournalRouteProps) {
  const [history, setHistory] = useState<readonly JournalHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState('');
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [journalRevision, setJournalRevision] = useState(0);
  const historyRequestSequence = useRef(0);

  const refreshHistory = useCallback(async (): Promise<void> => {
    const requestSequence = ++historyRequestSequence.current;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const entries = await listJournalHistory(db, historyStatus === '' ? {} : { status: historyStatus });
      if (requestSequence !== historyRequestSequence.current) return;
      setHistory(entries);
    } catch {
      if (requestSequence !== historyRequestSequence.current) return;
      setHistoryError('Kairos could not load your saved trade history. Your stored trades were not changed.');
    } finally {
      if (requestSequence === historyRequestSequence.current) setIsHistoryLoading(false);
    }
  }, [db, historyStatus]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  return (
    <section className="kairos-route kairos-journal" aria-labelledby="kairos-journal-title">
      <div className="kairos-journal__heading">
        <div>
          <p className="kairos-journal__eyebrow">Manual trade</p>
          <h1 id="kairos-journal-title">Journal</h1>
        </div>
        <span className="kairos-journal__badge">Local-first</span>
      </div>
      <p className="kairos-journal__intro">Log the trade facts you know now. Plan numbers are optional and can be left blank.</p>

      <TradeForm db={db} kind="journal" onSaved={async () => { await refreshHistory(); setJournalRevision(current => current + 1); }} />

      <JournalDailyResults db={db} refreshRevision={journalRevision} />

      <JournalHistoryList
        db={db}
        allowedSources={JOURNAL_HISTORY_SOURCES.real}
        updateNotice={updateNotice}
        onTradeUpdated={async () => { await refreshHistory(); setJournalRevision(current => current + 1); setUpdateNotice('Trade updated. Your saved details are below.'); }}
        onTradeDeleted={async notice => { await refreshHistory(); setJournalRevision(current => current + 1); setUpdateNotice(notice); }}
        onTradeOpened={async notice => { await refreshHistory(); setJournalRevision(current => current + 1); setUpdateNotice(notice); }}
        entries={history}
        isLoading={isHistoryLoading}
        errorMessage={historyError}
        statusFilter={historyStatus}
        onStatusFilterChange={setHistoryStatus}
      />
    </section>
  );
}
