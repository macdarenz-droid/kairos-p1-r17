import { useCallback, useEffect, useRef, useState } from 'react';
import { listJournalHistory, type JournalHistoryEntry } from '../application/journal';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import { TradeForm } from '../features/journal/TradeForm';
import { JournalHistoryList } from './JournalHistoryList';
import './journalRoute.css';
import './practiceRoute.css';

interface PracticeRouteProps {
  readonly db?: KairosDatabase;
}

/** Practice: paper trades recorded through P29.1 and listed through the P29.2 practice scope; nothing here reaches the journal's real results. */
export function PracticeRoute({ db = kairosDatabase }: PracticeRouteProps) {
  const [history, setHistory] = useState<readonly JournalHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [listNotice, setListNotice] = useState('');
  const historyRequestSequence = useRef(0);

  const refreshHistory = useCallback(async (): Promise<void> => {
    const requestSequence = ++historyRequestSequence.current;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const entries = await listJournalHistory(db, historyStatus === '' ? { scope: 'practice' } : { scope: 'practice', status: historyStatus });
      if (requestSequence !== historyRequestSequence.current) return;
      setHistory(entries);
    } catch {
      if (requestSequence !== historyRequestSequence.current) return;
      setHistoryError('Kairos could not load your practice trades. Your stored trades were not changed.');
    } finally {
      if (requestSequence === historyRequestSequence.current) setIsHistoryLoading(false);
    }
  }, [db, historyStatus]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  return (
    <section className="kairos-route kairos-journal kairos-practice" aria-labelledby="kairos-practice-title" data-practice-status={isHistoryLoading ? 'loading' : historyError ? 'error' : 'ready'} data-practice-count={history.length}>
      <div className="kairos-journal__heading">
        <div>
          <p className="kairos-journal__eyebrow">Practice trades</p>
          <h1 id="kairos-practice-title">Practice</h1>
        </div>
        <span className="kairos-journal__badge kairos-practice__badge">Practice only</span>
      </div>
      <p className="kairos-journal__intro">Rehearse a trade with the same facts you would log for real. Practice trades are kept apart: they never count in your journal history, daily results, goals or Home.</p>

      <TradeForm db={db} kind="practice" onSaved={async () => { setListNotice(''); await refreshHistory(); }} />

      <JournalHistoryList db={db} updateNotice={listNotice} onTradeDeleted={async notice => { await refreshHistory(); setListNotice(notice); }} onTradeUpdated={async () => { await refreshHistory(); setListNotice('Practice trade updated. Your saved details are below.'); }} onTradeOpened={async notice => { await refreshHistory(); setListNotice(notice); }} allowedSources={['paper']} entries={history} isLoading={isHistoryLoading} errorMessage={historyError} statusFilter={historyStatus} onStatusFilterChange={setHistoryStatus} />
    </section>
  );
}
