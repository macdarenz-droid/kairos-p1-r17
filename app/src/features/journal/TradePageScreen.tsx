import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { saveTradeDiscipline } from '../../application/discipline';
import { checkSavedTradeStrategy } from '../../application/discipline/strategyCheck';
import { describePlanAndWhatHappened } from '../../application/coach/coachWords';
import { describeNewsNearTrade } from '../../application/economic-calendar/calendarWords';
import { getJournalHistoryEntry, JOURNAL_HISTORY_SOURCES, type JournalHistoryEntry, type JournalHistoryScope } from '../../application/journal';
import { addTradeContractSize, updateTradeExecution } from '../../application/trades';
import { projectTradePlanVsExecution } from '../../application/trades/planVsExecution';
import { JOURNAL_CHANGED_EVENT, kairosDatabase, type KairosDatabase } from '../../data/database';
import { tradeJournalAt, type TradeRecord, type TradeSource } from '../../domain/trades';
import { Button, Card, ErrorState, PageHeader } from '../../design-system/primitives';
import { TradeChecklistControl } from '../discipline/TradeChecklistControl';
import { TradeReviewControl } from '../discipline/TradeReviewControl';
import { TradeStrategyControl } from '../discipline/TradeStrategyControl';
import { useTradeDisciplineCards } from '../discipline/useTradeDisciplineCards';
import { useNewsNearTrades } from '../economic-calendar/useNewsNearTrades';
import { EntriesAndExitsEditor } from './EntriesAndExitsEditor';
import { JournalDraftTradeActivation } from './JournalDraftTradeActivation';
import { JournalOpenTradeUpdate } from './JournalOpenTradeUpdate';
import { JournalTradeDeleteControl } from './JournalTradeDeleteControl';
import { reviewTimestamp, TradeEntriesAndExits, TradeFees, TradeOverview, TradePlan, TradeResult } from './TradeDetails';
import { tradeReviewHref } from './tradeAddress';
import { TradePicture } from './TradePicture';
import './tradePageScreen.css';

const TITLE = 'kairos-trade-page-title';

/** Navigation state the list reads after a delete here: the notice to show, with focus on the list's heading (D264). */
const TRADE_DELETED_STATE = 'kairos.trade-deleted';

/**
 * For the Journal and Practice lists: the notice a trade's page sent with you (after a delete), read once on arrival.
 * The address's entry then forgets it, so going Back to the list later never shows it again.
 */
export function useArrivedNotice(): string | undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const sent = (location.state as Readonly<Record<string, unknown>> | null)?.[TRADE_DELETED_STATE];
  const [arrived] = useState(typeof sent === 'string' ? sent : undefined);
  useEffect(() => {
    if (typeof sent === 'string') navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [sent]); // eslint-disable-line react-hooks/exhaustive-deps
  return arrived;
}

/**
 * Which trades each page may change, as on the list's cards: the Journal its own sources; Practice its paper trades, and
 * the checklist, review and strategy of Replay trades too (their entries and exits come from past candles).
 */
const PAGE_SCOPES: Readonly<Record<JournalHistoryScope, Readonly<{ list: string; listName: string; allowed: readonly TradeSource[]; discipline: readonly TradeSource[] }>>> = {
  real: { list: '/journal', listName: 'your journal', allowed: JOURNAL_HISTORY_SOURCES.real, discipline: JOURNAL_HISTORY_SOURCES.real },
  practice: { list: '/practice', listName: 'Practice', allowed: ['paper'], discipline: ['paper', 'replay'] },
};

type Read =
  | Readonly<{ kind: 'reading'; id: string }>
  | Readonly<{ kind: 'shown'; id: string; entry: JournalHistoryEntry }>
  | Readonly<{ kind: 'missing'; id: string }>
  | Readonly<{ kind: 'failed'; id: string }>;

/** A plain notice, or the prompt after "Update trade" closed the trade: "Trade closed. How did it go?" (U12, D245). */
type Notice = string | Readonly<{ kind: 'closed' }>;

const sideWord = (side: TradeRecord['side']): string => (side === 'long' ? 'Long' : 'Short');
const STATUS_WORDS: Readonly<Record<TradeRecord['status'], string>> = { draft: 'Planned', open: 'Open', closed: 'Closed', cancelled: 'Cancelled' };

/** The line under the heading: the trade's status and its Journal date (D259), opened or planned. */
function describeWhen(trade: TradeRecord): string {
  const when = reviewTimestamp(tradeJournalAt(trade));
  if (trade.status === 'draft') return `Planned ${when}`;
  return `${STATUS_WORDS[trade.status]} · ${trade.openedAt ? 'opened' : 'planned'} ${when}`;
}

/**
 * U15 (D260): one trade's own page, at `/journal/trades/:id` or `/practice/trades/:id`. Top to bottom: the picture, the
 * result, plan and what happened, the details, plan, entries and exits and fees, the checklist, review and strategy,
 * big news near it, and what changes it. It reads the trade again when you come back to the app, when another tab
 * saves, and after each change here. A trade of the other kind, or one that isn't saved, shows "This trade isn't in
 * your journal." The shell moves focus to the heading on arrival (D179).
 */
export function TradePageScreen({ db = kairosDatabase, scope }: { readonly db?: KairosDatabase; readonly scope: JournalHistoryScope }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const page = PAGE_SCOPES[scope];
  const [read, setRead] = useState<Read>({ kind: 'reading', id });
  const current: Read = read.id === id ? read : { kind: 'reading', id };
  const request = useRef(0);
  const load = useCallback(async (): Promise<void> => {
    const n = ++request.current;
    const found = await getJournalHistoryEntry(db, id).then(entry => entry, () => undefined);
    if (n !== request.current) return;
    setRead(found === undefined ? { kind: 'failed', id }
      : found !== null && (JOURNAL_HISTORY_SOURCES[scope] as readonly TradeSource[]).includes(found.trade.source) ? { kind: 'shown', id, entry: found }
      : { kind: 'missing', id });
  }, [db, id, scope]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const again = () => { void load(); };
    const visible = () => { if (!document.hidden) again(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', visible);
    // D229: and when another tab saves.
    window.addEventListener(JOURNAL_CHANGED_EVENT, again);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', visible); window.removeEventListener(JOURNAL_CHANGED_EVENT, again); };
  }, [load]);

  const entry = current.kind === 'shown' ? current.entry : null;
  const discipline = useTradeDisciplineCards(db, entry ? [entry.trade.id] : []);
  const news = useNewsNearTrades(db, entry ? [entry.trade] : []);

  // A notice after a change here takes focus when the change's own control went away (its form closed).
  const [notice, setNotice] = useState<Notice | null>(null);
  const [changes, setChanges] = useState(0);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const reviewNowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (notice === null) return;
    const active = document.activeElement;
    if (active === null || active === document.body) (reviewNowRef.current ?? noticeRef.current)?.focus();
  }, [notice, changes]);
  const changed = async (next: Notice): Promise<void> => { await load(); setNotice(next); setChanges(count => count + 1); };
  // "Review it now" opens the review; the prompt goes once that sheet closes, so focus has somewhere to return to.
  const [reviewRequested, setReviewRequested] = useState(false);
  const [focusResult, setFocusResult] = useState(false);
  const resultFocused = useCallback(() => setFocusResult(false), []);

  // "Try again" goes away when the read works: focus goes to the heading, or to the new "Try again" when it fails again.
  const retried = useRef(false);
  const retry = () => { retried.current = true; setRead({ kind: 'reading', id }); void load(); };
  useEffect(() => {
    if (!retried.current || current.kind === 'reading') return;
    retried.current = false;
    if (current.kind === 'failed') document.querySelector<HTMLElement>('.kairos-trade-page__failed button')?.focus();
    else document.getElementById(TITLE)?.focus();
  }, [current.kind]);

  if (current.kind === 'reading') return <section className="kairos-route kairos-journal kairos-trade-page" aria-busy="true"><p role="status">Loading your trade…</p></section>;
  if (current.kind === 'failed') return <section className="kairos-route kairos-journal kairos-trade-page" aria-labelledby={TITLE}>
    <PageHeader title="Your trade" titleId={TITLE} />
    <ErrorState className="kairos-trade-page__failed" message="Kairos could not read this trade. Your saved trades were not changed." onRetry={retry} />
  </section>;
  if (current.kind === 'missing' || entry === null) return <section className="kairos-route kairos-journal kairos-trade-page" aria-labelledby={TITLE}>
    <PageHeader title="This trade isn't in your journal." titleId={TITLE} />
    <p>It may have been deleted, or it belongs to {scope === 'practice' ? 'your Journal' : 'Practice'}. <Link to={page.list}>Go to {page.listName}</Link></p>
  </section>;

  const { trade } = entry;
  const ready = discipline.state.kind === 'ready' && discipline.state.ids.has(trade.id) ? discipline.state : null;
  const record = ready?.records.get(trade.id) ?? null;
  const disciplineAllowed = page.discipline.includes(trade.source);
  const remember = (saved: Parameters<typeof discipline.remember>[0]) => discipline.remember(saved);
  const planLines = trade.status === 'closed' ? describePlanAndWhatHappened(projectTradePlanVsExecution(trade, entry.plans, entry.metrics)) : [];
  const newsLines = describeNewsNearTrade(news.get(trade.id) ?? []);
  const prompt = typeof notice === 'object' && notice !== null ? notice : null;
  const reviewable = trade.status === 'closed' && disciplineAllowed;
  const failedLabel = (half: string) => discipline.state.kind === 'failed' ? <Button variant="secondary" size="sm" disabled>{half}: could not load</Button> : null;

  return <section className="kairos-route kairos-journal kairos-trade-page" aria-labelledby={TITLE}>
    <PageHeader eyebrow={scope === 'practice' ? 'Practice trade' : 'Your trade'} title={`${trade.symbol} · ${sideWord(trade.side)}`} titleId={TITLE} intro={describeWhen(trade)} />
    {typeof notice === 'string' ? <p ref={noticeRef} tabIndex={-1} className="kairos-trade-page__notice" role="status">{notice}</p> : null}
    {prompt ? <div className="kairos-trade-page__notice">
      <p ref={noticeRef} tabIndex={-1} role="status">Trade closed. How did it go?</p>
      {reviewable ? <Button ref={reviewNowRef} variant="secondary" size="sm" onClick={() => setReviewRequested(true)}>Review it now</Button> : null}
    </div> : null}

    <TradePicture key={trade.id} entry={entry} variant="full" strategyName={record?.strategy?.name ?? null} />
    <p className="kairos-trade-page__chart"><Link to={tradeReviewHref(trade.id)}>See it on the market chart</Link></p>

    <div className="kairos-review kairos-review__detail" data-review-trade-id={trade.id}>
      <TradeResult entry={entry} focusResult={focusResult} onResultFocused={resultFocused}
        addContractSize={{ save: input => addTradeContractSize(db, input), onSaved: async () => { await load(); setFocusResult(true); } }} />
      {planLines.length > 0 ? <section className="kairos-review__card" aria-label="Plan and what happened">
        <h2>Plan and what happened</h2>
        {planLines.map(line => <p key={line}>{line}</p>)}
      </section> : null}
      <TradeOverview trade={trade} heading="details" />
      <TradePlan plans={entry.plans} />
      <TradeEntriesAndExits executions={entry.executions} />
      <TradeFees executions={entry.executions} fees={entry.fees} />
    </div>

    {disciplineAllowed ? <Card as="section" className="kairos-trade-page__part" aria-labelledby="kairos-trade-page-discipline">
      <h2 id="kairos-trade-page-discipline">Before and after the trade</h2>
      {trade.status === 'draft' || trade.status === 'open'
        ? ready ? <TradeChecklistControl symbol={trade.symbol} tradeId={trade.id} scope={scope} items={ready.lists.checklist} record={record} save={input => saveTradeDiscipline(db, input)} onSaved={remember} /> : failedLabel('Before you trade')
        : null}
      {trade.status === 'closed'
        ? ready ? <TradeReviewControl symbol={trade.symbol} tradeId={trade.id} scope={scope} reviewItems={ready.lists.review} mistakeItems={ready.lists.mistakes} record={record} save={input => saveTradeDiscipline(db, input)} onSaved={remember}
          openRequested={reviewRequested} onOpenRequestHandled={() => setReviewRequested(false)} onRequestedSheetClosed={() => setNotice(null)} /> : failedLabel('After the trade')
        : null}
      {ready ? <TradeStrategyControl symbol={trade.symbol} tradeId={trade.id} scope={scope} strategies={ready.strategies} record={record}
        check={checkSavedTradeStrategy(trade, entry.plans, record)} save={input => saveTradeDiscipline(db, input)} onSaved={remember} /> : null}
    </Card> : null}

    {newsLines.length > 0 ? <Card as="section" className="kairos-trade-page__part" aria-labelledby="kairos-trade-page-news">
      <h2 id="kairos-trade-page-news">Big news near this trade</h2>
      {newsLines.map((line, index) => <p key={index}>{line}</p>)}
    </Card> : null}

    <Card as="section" className="kairos-trade-page__part kairos-trade-page__actions" aria-labelledby="kairos-trade-page-actions">
      <h2 id="kairos-trade-page-actions">Change this trade</h2>
      <JournalOpenTradeUpdate entry={entry} db={db} allowedSources={page.allowed}
        onCommitted={closed => changed(closed ? { kind: 'closed' } : 'Trade updated. Your saved details are on this page.')} />
      {page.allowed.includes(trade.source) ? <EntriesAndExitsEditor entry={entry} save={input => updateTradeExecution(db, { ...input, allowedSources: page.allowed })}
        onSaved={() => changed('Trade updated. Your saved details are on this page.')} /> : null}
      <JournalDraftTradeActivation entry={entry} db={db} allowedSources={page.allowed} onOpened={next => changed(next)} />
      <JournalTradeDeleteControl entry={entry} db={db}
        onDeleted={async deleted => { navigate(page.list, { state: { [TRADE_DELETED_STATE]: deleted } }); }} />
    </Card>
  </section>;
}
