import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EcbReferenceRatesPort } from '../application/currency/ecbRates';
import { practicePlanDraft, readPracticePlanStart } from '../application/practice/practicePlanStart';
import { readVisualPnlPeriodChoice, writeVisualPnlPeriodChoice } from '../application/visual-pnl';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import { TradeForm } from '../features/journal/TradeForm';
import { useJournalHistoryPages } from '../features/journal/useJournalHistoryPages';
import { CoachCard } from '../features/discipline/CoachCard';
import { PracticeMoneyCard } from '../features/practice/PracticeMoneyCard';
import { ResultsDashboard } from '../features/results/ResultsDashboard';
import { JournalHistoryList, type HistoryNotice } from './JournalHistoryList';
import { ReviewTradeLink } from './ReviewTradeLink';
import { useArrivedNotice } from '../features/journal/TradePageScreen';
import './journalRoute.css';
import './practiceRoute.css';
import { PageHeader } from '../design-system/primitives';

interface PracticeRouteProps {
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string, for the results and the coach; tests inject a fixed one. */
  readonly now?: () => string;
  /** The bank-rates port for rates fetched on their own (D201); null until the composition root passes it (T-051f). */
  readonly rates?: EcbReferenceRatesPort | null;
}

/** A stable default clock, as in GoalsRoute. */
const wallClock = (): string => new Date().toISOString();
/** The calculator plan's keys (practicePlanStart.ts); saving its trade removes only these, so the chosen period stays. */
const PLAN_KEYS = ['side', 'entry', 'stop', 'quantity'] as const;

/** Practice: paper trades, saved with the Journal's form and listed and pictured with the practice scope; nothing here reaches the Journal's real results, goals, discipline score or Home. */
export function PracticeRoute({ db = kairosDatabase, now, rates = null }: PracticeRouteProps) {
  const clock = now ?? wallClock;
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const arrivedNotice = useArrivedNotice();
  const [listNotice, setListNotice] = useState<HistoryNotice>(arrivedNotice ?? '');
  const pages = useJournalHistoryPages(db, 'practice', historyStatus);
  const [searchParams, setSearchParams] = useSearchParams();
  const planStart = readPracticePlanStart(searchParams);
  const [practiceRevision, setPracticeRevision] = useState(0);
  const [disciplineRevision, setDisciplineRevision] = useState(0);
  const changed = () => setPracticeRevision(value => value + 1);

  return (
    <section className="kairos-route kairos-journal kairos-practice" aria-labelledby="kairos-practice-title" data-practice-status={pages.isLoading ? 'loading' : pages.failed ? 'error' : 'ready'} data-practice-count={pages.entries.length}>
      <PageHeader eyebrow="Practice trades" title="Practice" titleId="kairos-practice-title"
        action={<span className="kairos-journal__badge kairos-practice__badge">Practice only</span>} />
      <p className="kairos-journal__intro">Practise with pretend money before real money is at risk. Practice trades stay apart: they never count in your Journal results, goals, discipline score or Home.</p>

      <PracticeMoneyCard db={db} refreshRevision={practiceRevision} />

      <p className="kairos-practice__calculator-link">Not sure how much to buy? <Link to="/library/calculators">Work it out in the calculators</Link>.</p>
      <p className="kairos-practice__replay-link">Practise on real past prices: <Link to="/practice/replay">Replay the past, one candle at a time</Link>.</p>
      <p className="kairos-practice__patterns-link">See what repeats in your practice trades: <Link to="/practice/patterns">Your practice patterns</Link>.</p>
      {planStart ? <p className="kairos-practice__plan-note">From the calculator: {planStart.side === 'long' ? 'buy' : 'sell'} up to {planStart.quantity}, entry {planStart.entryPrice}, stop {planStart.stopPrice}. It is filled in under Trade plan. Add the symbol, the market and the rest, then save.</p> : null}

      <TradeForm db={db} kind="practice" initialDraft={planStart ? practicePlanDraft(planStart) : undefined} onSaved={async () => { if (planStart) { const kept = new URLSearchParams(searchParams); for (const key of PLAN_KEYS) kept.delete(key); setSearchParams(kept, { replace: true }); } setListNotice(''); await pages.refresh(); changed(); }} />

      <ResultsDashboard db={db} scope="practice" now={clock}
        choice={readVisualPnlPeriodChoice(searchParams)} onChoiceChange={choice => setSearchParams(writeVisualPnlPeriodChoice(choice, searchParams))}
        renderTradeLink={id => <ReviewTradeLink id={id} scope="practice" />} refreshRevision={practiceRevision + disciplineRevision} glow={false} live={false} rates={rates} />
      <CoachCard db={db} scope="practice" now={clock} refreshRevision={practiceRevision} disciplineRevision={disciplineRevision} />

      <JournalHistoryList db={db} updateNotice={listNotice} onTradeDeleted={async notice => { await pages.refresh(); changed(); setListNotice(notice); }} onTradeUpdated={async closedTradeId => { await pages.refresh(); changed(); setListNotice(closedTradeId ? { kind: 'closed', tradeId: closedTradeId } : 'Practice trade updated. Your saved details are below.'); }} onTradeOpened={async notice => { await pages.refresh(); changed(); setListNotice(notice); }} onDisciplineSaved={() => setDisciplineRevision(value => value + 1)} allowedSources={['paper']} disciplineSources={['paper', 'replay']} focusHeadingOnArrival={arrivedNotice !== undefined} entries={pages.entries} isLoading={pages.isLoading} errorMessage={pages.failed ? 'Kairos could not load your practice trades. Your stored trades were not changed.' : null} hasOlder={pages.hasOlder} isLoadingOlder={pages.isLoadingOlder} olderFailed={pages.olderFailed} onShowOlder={pages.showOlder} onRetry={pages.refresh} statusFilter={historyStatus} onStatusFilterChange={setHistoryStatus} />
    </section>
  );
}
