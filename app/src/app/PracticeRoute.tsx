import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { practicePlanDraft, readPracticePlanStart } from '../application/practice/practicePlanStart';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import { TradeForm } from '../features/journal/TradeForm';
import { useJournalHistoryPages } from '../features/journal/useJournalHistoryPages';
import { PracticeMoneyCard } from '../features/practice/PracticeMoneyCard';
import { JournalDailyResults } from './JournalDailyResults';
import { JournalHistoryList } from './JournalHistoryList';
import './journalRoute.css';
import './practiceRoute.css';

interface PracticeRouteProps {
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string, for Daily results; tests inject a fixed one. */
  readonly now?: () => string;
}

/** Practice: paper trades, saved with the Journal's form and listed and pictured with the practice scope; nothing here reaches the Journal's real results, goals, discipline score or Home. */
export function PracticeRoute({ db = kairosDatabase, now }: PracticeRouteProps) {
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [listNotice, setListNotice] = useState('');
  const pages = useJournalHistoryPages(db, 'practice', historyStatus);
  const [searchParams, setSearchParams] = useSearchParams();
  const planStart = readPracticePlanStart(searchParams);
  const [practiceRevision, setPracticeRevision] = useState(0);
  const [disciplineRevision, setDisciplineRevision] = useState(0);
  const changed = () => setPracticeRevision(value => value + 1);

  return (
    <section className="kairos-route kairos-journal kairos-practice" aria-labelledby="kairos-practice-title" data-practice-status={pages.isLoading ? 'loading' : pages.failed ? 'error' : 'ready'} data-practice-count={pages.entries.length}>
      <div className="kairos-journal__heading">
        <div>
          <p className="kairos-journal__eyebrow">Practice trades</p>
          <h1 id="kairos-practice-title">Practice</h1>
        </div>
        <span className="kairos-journal__badge kairos-practice__badge">Practice only</span>
      </div>
      <p className="kairos-journal__intro">Practise with pretend money before real money is at risk. Practice trades stay apart: they never count in your Journal results, goals, discipline score or Home.</p>

      <PracticeMoneyCard db={db} refreshRevision={practiceRevision} />

      <p className="kairos-practice__calculator-link">Not sure how much to buy? <Link to="/library/calculators">Work it out in the calculators</Link>.</p>
      <p className="kairos-practice__replay-link">Practise on real past prices: <Link to="/practice/replay">Replay the past, one candle at a time</Link>.</p>
      <p className="kairos-practice__patterns-link">See what repeats in your practice trades: <Link to="/practice/patterns">Your practice patterns</Link>.</p>
      {planStart ? <p className="kairos-practice__plan-note">From the calculator: {planStart.side === 'long' ? 'buy' : 'sell'} up to {planStart.quantity}, entry {planStart.entryPrice}, stop {planStart.stopPrice}. It is filled in under Trade plan. Add the symbol, the market and the rest, then save.</p> : null}

      <TradeForm db={db} kind="practice" initialDraft={planStart ? practicePlanDraft(planStart) : undefined} onSaved={async () => { if (planStart) setSearchParams(new URLSearchParams(), { replace: true }); setListNotice(''); await pages.refresh(); changed(); }} />

      <JournalDailyResults db={db} scope="practice" refreshRevision={practiceRevision} now={now} disciplineRevision={disciplineRevision} />

      <JournalHistoryList db={db} updateNotice={listNotice} onTradeDeleted={async notice => { await pages.refresh(); changed(); setListNotice(notice); }} onTradeUpdated={async () => { await pages.refresh(); changed(); setListNotice('Practice trade updated. Your saved details are below.'); }} onTradeOpened={async notice => { await pages.refresh(); changed(); setListNotice(notice); }} onDisciplineSaved={() => setDisciplineRevision(value => value + 1)} allowedSources={['paper']} disciplineSources={['paper', 'replay']} entries={pages.entries} isLoading={pages.isLoading} errorMessage={pages.failed ? 'Kairos could not load your practice trades. Your stored trades were not changed.' : null} hasOlder={pages.hasOlder} isLoadingOlder={pages.isLoadingOlder} olderFailed={pages.olderFailed} onShowOlder={pages.showOlder} statusFilter={historyStatus} onStatusFilterChange={setHistoryStatus} />
    </section>
  );
}
