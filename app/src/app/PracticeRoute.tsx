import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EcbReferenceRatesPort } from '../application/currency/ecbRates';
import { practicePlanDraft, readPracticePlanStart } from '../application/practice/practicePlanStart';
import { readVisualPnlPeriodChoice, writeVisualPnlPeriodChoice } from '../application/visual-pnl';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { hasJournalFilters, NO_JOURNAL_FILTERS, readJournalFilters, writeJournalFilters, type JournalFilters } from '../application/journal';
import { JournalFilterBar, useJournalTimeZone } from '../features/journal/JournalFilterBar';
import { TradeCopyArrival } from '../features/journal/TradeCopy';
import { TradeForm } from '../features/journal/TradeForm';
import { useJournalHistoryPages } from '../features/journal/useJournalHistoryPages';
import { CoachCard } from '../features/discipline/CoachCard';
import { PracticeMoneyCard } from '../features/practice/PracticeMoneyCard';
import { ResultsDashboard } from '../features/results/ResultsDashboard';
import { JournalHistoryList } from './JournalHistoryList';
import { ReviewTradeLink } from './ReviewTradeLink';
import { SCROLL_CLAIMED_EVENT } from './AppShell';
import { useArrivedNotice } from '../features/journal/tradeAddress';
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
const PLAN_KEYS = ['direction', 'entry', 'stop', 'quantity'] as const;

/** Practice: paper trades, saved with the Journal's form and listed and pictured with the practice scope; nothing here reaches the Journal's real results, goals, discipline score or Home. */
export function PracticeRoute({ db = kairosDatabase, now, rates = null }: PracticeRouteProps) {
  const clock = now ?? wallClock;
  const arrivedNotice = useArrivedNotice();
  // What a trade's page said when it sent you here (a delete); a new save here replaces it.
  const [listNotice, setListNotice] = useState(arrivedNotice ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  // D262: the list's filters live in the address; a change replaces its entry (no Back step per change).
  const filters = readJournalFilters(searchParams, 'practice');
  const changeFilters = (next: JournalFilters) => setSearchParams(current => writeJournalFilters(next, current), { replace: true });
  const timeZone = useJournalTimeZone(db);
  const pages = useJournalHistoryPages(db, 'practice', filters, timeZone);
  const planStart = readPracticePlanStart(searchParams);
  const [practiceRevision, setPracticeRevision] = useState(0);
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

      {/* D264: a trade's Duplicate lands here with its copy; the form is further down, so it stays in view. */}
      <TradeCopyArrival db={db} scope="practice" firstFieldId="kairos-practice-symbol" onFocused={() => window.dispatchEvent(new Event(SCROLL_CLAIMED_EVENT))}>
        {copied => <TradeForm db={db} kind="practice" allDetails={copied !== undefined} initialDraft={copied ?? (planStart ? practicePlanDraft(planStart) : undefined)} onSaved={async () => { if (planStart) { const kept = new URLSearchParams(searchParams); for (const key of PLAN_KEYS) kept.delete(key); setSearchParams(kept, { replace: true }); } setListNotice(''); await pages.refresh(); changed(); }} />}
      </TradeCopyArrival>

      <ResultsDashboard db={db} scope="practice" now={clock}
        choice={readVisualPnlPeriodChoice(searchParams)} onChoiceChange={choice => setSearchParams(writeVisualPnlPeriodChoice(choice, searchParams))}
        renderTradeLink={id => <ReviewTradeLink id={id} scope="practice" />} refreshRevision={practiceRevision} glow={false} live={false} rates={rates} />
      <CoachCard db={db} scope="practice" now={clock} refreshRevision={practiceRevision} disciplineRevision={0} />

      <JournalHistoryList scope="practice" notice={listNotice} entries={pages.entries} isLoading={pages.isLoading} errorMessage={pages.failed ? 'Kairos could not load your practice trades. Your stored trades were not changed.' : null} hasOlder={pages.hasOlder} isLoadingOlder={pages.isLoadingOlder} olderFailed={pages.olderFailed} onShowOlder={pages.showOlder} onRetry={pages.refresh} statusFilter={filters.status ?? ''} onStatusFilterChange={status => changeFilters({ ...filters, status: status === '' ? null : status })} focusOnArrival={arrivedNotice !== undefined}
        filterBar={<JournalFilterBar db={db} scope="practice" filters={filters} onChange={changeFilters} timeZone={timeZone} refreshRevision={practiceRevision} />}
        filtered={hasJournalFilters({ ...filters, status: null })} onClearFilters={() => changeFilters(NO_JOURNAL_FILTERS)} />
    </section>
  );
}
