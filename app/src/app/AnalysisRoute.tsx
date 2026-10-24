import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { JOURNAL_CHANGED_EVENT } from './AppShell';
import { loadTradeDiscipline } from '../application/discipline';
import { loadTradeReview, type TradeReviewResult } from '../application/journal/loadTradeReview';
import { DEFAULT_JOURNAL_HISTORY_LIMIT } from '../application/journal/historyQuery';
import { addTradeContractSize } from '../application/trades';
import type { EcbReferenceRatesPort } from '../application/currency/ecbRates';
import { readVisualPnlPeriodChoice, writeVisualPnlPeriodChoice } from '../application/visual-pnl';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeId } from '../domain/trades';
import { Button, PageHeader, Segmented, Sheet } from '../design-system/primitives';
import { Icon } from '../design-system/icons/Icon';
import { TradeDetails, reviewTimestamp } from '../features/journal/TradeDetails';
import './tradeReview.css';
import { AnalysisHistoryWorkspace } from './AnalysisHistoryWorkspace';
import { AnalysisHandoffContext, parseAnalysisHandoff } from './analysisHandoff';
import { ReviewTradeLink } from './ReviewTradeLink';
import { TradePicture } from '../features/journal/TradePicture';
import { ResultsDashboard } from '../features/results/ResultsDashboard';
import { DisciplineOverview } from '../features/discipline/DisciplineOverview';
import { PATTERNS_INTRO, PATTERNS_SHORT_INTRO, PatternsPanel } from '../features/patterns/PatternsPanel';

type State = { readonly key: string | null; readonly result: TradeReviewResult | null; readonly error: boolean };
type TradeEntry = Extract<TradeReviewResult, { kind: 'trade' }>['entry'];
/** The last trade picture loaded for one selection (its counter n); a refresh of that selection keeps it mounted so an open hint sheet survives. */
type Shown = { readonly n: number; readonly entry: TradeEntry } | null;

type AnalysisView = 'results' | 'discipline' | 'patterns' | 'chart';
/** The four parts of Analysis (D220); "Results" has no address of its own. */
const VIEW_OPTIONS = [
  { value: 'results', label: 'Results' }, { value: 'discipline', label: 'Discipline' },
  { value: 'patterns', label: 'Patterns' }, { value: 'chart', label: 'Chart' },
] as const;
const PATTERNS_TITLE = 'kairos-analysis-patterns-title';
/** The keys "Your results" keeps from the address: the period's own (D198). */
const PERIOD_KEYS = ['period', 'at', 'first', 'last'] as const;
const TITLE = 'kairos-review-title';
/** A stable default clock, as in GoalsRoute. */
const wallClock = (): string => new Date().toISOString();

/** "Chart" for its own address, a trade link or a Library handoff; "Discipline" or "Patterns" for theirs; otherwise "Results" (D197, D220). */
function analysisView(params: URLSearchParams): AnalysisView {
  if (params.get('view') === 'chart' || params.get('trade') !== null || parseAnalysisHandoff(params) !== null) return 'chart';
  const view = params.get('view');
  return view === 'discipline' || view === 'patterns' ? view : 'results';
}

export interface AnalysisRouteProps {
  readonly load?: (id: string | null) => Promise<TradeReviewResult>;
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string; tests inject a fixed one. */
  readonly now?: () => string;
  /** The bank-rates port for missing rates fetched on their own (D201); the route passes it, null fetches nothing. */
  readonly rates?: EcbReferenceRatesPort | null;
}

/** The Patterns page's longer explanation, behind "How this works", as its page header has it. */
function PatternsHowItWorks() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Icon name="info" size={16} />How this works</Button>
    <Sheet open={open} title="How this works" onClose={() => setOpen(false)}><p>{PATTERNS_INTRO.real}</p></Sheet>
  </>;
}

/** The strategy the trader chose for the shown trade, for its share card (P28); null without one or when the read fails. */
function useTradeStrategyName(db: KairosDatabase, tradeId: TradeId | null): string | null {
  const [found, setFound] = useState<{ readonly id: TradeId; readonly name: string | null } | null>(null);
  useEffect(() => {
    if (tradeId === null) return;
    let active = true;
    void loadTradeDiscipline(db, [tradeId]).then(result => {
      if (active) setFound({ id: tradeId, name: result.ok ? result.records.get(tradeId)?.strategy?.name ?? null : null });
    }, () => { if (active) setFound({ id: tradeId, name: null }); });
    return () => { active = false; };
  }, [db, tradeId]);
  return found !== null && found.id === tradeId ? found.name : null;
}

/** "Your results" (U5) and the chart with the trade review: route selection and async read lifecycle only; all saved facts come from their owners. */
export function AnalysisRoute({ load = loadTradeReview, db = kairosDatabase, now = wallClock, rates = null }: AnalysisRouteProps) {
  const [params, setParams] = useSearchParams();
  const view = analysisView(params);
  const selectedId = params.get('trade');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ key: selectedId, result: null, error: false });
  // Changes on every selectedId change, so A → another → A is a new selection even for the same trade id.
  const [selection, setSelection] = useState({ id: selectedId, n: 0 });
  if (selection.id !== selectedId) setSelection({ id: selectedId, n: selection.n + 1 });
  const selectionN = selection.id === selectedId ? selection.n : selection.n + 1;
  const [shown, setShown] = useState<Shown>(null);
  const focusedFor = useRef<number | null>(null);
  /** The heading took focus once in this visit (the first settled state of either part). */
  const visitFocused = useRef(false);
  /** A press on the switch: the part it opens leaves focus on the pressed option (D177, N10). */
  const switching = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  // U11: after a point value is added, the trade is read again and its recorded result takes focus once.
  const [focusReviewResult, setFocusReviewResult] = useState(false);
  const reviewResultFocused = useCallback(() => setFocusReviewResult(false), []);
  const addContractSize = { save: (input: Parameters<typeof addTradeContractSize>[1]) => addTradeContractSize(db, input), onSaved: () => { setFocusReviewResult(true); refresh(); } };
  const current = state.key === selectedId ? state : null;
  const loading = view === 'chart' && (current === null || (current.result === null && !current.error));

  useEffect(() => {
    if (view !== 'chart') return;
    let active = true;
    setState({ key: selectedId, result: null, error: false });
    void load(selectedId).then(result => {
      if (!active) return;
      setState({ key: selectedId, result, error: false });
      setShown(result.kind === 'trade' ? { n: selectionN, entry: result.entry } : null);
    }).catch(() => {
      if (!active) return;
      setState({ key: selectedId, result: null, error: true });
      setShown(null);
    });
    return () => { active = false; };
  }, [load, selectedId, selectionN, revision, view]);

  useEffect(() => {
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    // D229: and when another tab saves.
    window.addEventListener(JOURNAL_CHANGED_EVENT, refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); window.removeEventListener(JOURNAL_CHANGED_EVENT, refresh); };
  }, [refresh]);

  // In the chart part the heading takes focus once per selection after its first load, and again whenever focus was lost
  // to the page (a removed "Try again"). A refresh never takes focus from an open sheet, and a switch press never moves it.
  useEffect(() => {
    if (view !== 'chart' || loading) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    // A switch press never moves focus, even where the press left it on the page (Safari does not focus a tapped button).
    if (switching.current) {
      switching.current = false;
      focusedFor.current = selectionN;
      visitFocused.current = true;
      return;
    }
    if (focusedFor.current === selectionN && !lost) return;
    focusedFor.current = selectionN;
    visitFocused.current = true;
    document.getElementById(TITLE)?.focus();
  }, [selectionN, loading, view]);

  // "Your results": the heading takes focus after the dashboard's first settled state, once per visit; the dashboard places focus after its own retries.
  const resultsFirstLoad = useCallback(() => {
    if (switching.current) { switching.current = false; visitFocused.current = true; return; }
    if (visitFocused.current) return;
    visitFocused.current = true;
    focusedFor.current = selectionN;
    document.getElementById(TITLE)?.focus();
  }, [selectionN]);

  function changeView(next: AnalysisView): void {
    if (next === view) return;
    switching.current = true;
    if (next === 'chart') {
      const kept = new URLSearchParams(params);
      kept.set('view', 'chart');
      setParams(kept);
      return;
    }
    const kept = new URLSearchParams();
    for (const key of PERIOD_KEYS) { const value = params.get(key); if (value !== null) kept.set(key, value); }
    if (next !== 'results') kept.set('view', next);
    setParams(kept);
  }

  // Discipline and Patterns, opened at their own address: the heading takes focus once per visit, as "Your results" does
  // after its first load; a switch press leaves focus on the pressed option (D177).
  useEffect(() => {
    if (view !== 'discipline' && view !== 'patterns') return;
    if (switching.current) { switching.current = false; visitFocused.current = true; return; }
    if (visitFocused.current) return;
    visitFocused.current = true;
    document.getElementById(TITLE)?.focus();
  }, [view]);

  const result = current?.result;
  const selectedEntry = result?.kind === 'trade' ? result.entry : null;
  const pictureEntry = selectedEntry ?? (shown !== null && shown.n === selectionN && loading ? shown.entry : null);
  const savedTradePending = selectedId !== null && loading;
  const strategyName = useTradeStrategyName(db, pictureEntry?.trade.id ?? null);
  const handoff = parseAnalysisHandoff(params);
  return <section className="kairos-route kairos-review" aria-labelledby={TITLE} aria-busy={loading || undefined}>
    <PageHeader eyebrow="Your results and charts" title="Analysis" titleId={TITLE}
      action={<Button variant="secondary" size="sm" onClick={refresh} disabled={view === 'chart' && loading}>Refresh</Button>} />
    <Segmented label="Analysis view" options={VIEW_OPTIONS} value={view} onChange={changeView} />
    {view === 'results' ? <ResultsDashboard db={db} scope="real" now={now}
      choice={readVisualPnlPeriodChoice(params)} onChoiceChange={choice => setParams(writeVisualPnlPeriodChoice(choice, params))}
      renderTradeLink={id => <ReviewTradeLink id={id} />} refreshRevision={revision} onFirstLoad={resultsFirstLoad} rates={rates} />
    : view === 'discipline' ? <DisciplineOverview db={db} now={now} refreshRevision={revision} />
    : view === 'patterns' ? <section className="kairos-analysis-patterns kairos-patterns" aria-labelledby={PATTERNS_TITLE}>
      <h2 id={PATTERNS_TITLE} tabIndex={-1}>Patterns</h2>
      <p>{PATTERNS_SHORT_INTRO.real}</p>
      <PatternsHowItWorks />
      <PatternsPanel db={db} scope="real" now={now} level={3} headingId={PATTERNS_TITLE} refreshRevision={revision} />
    </section> : <>
    {pictureEntry ? <TradePicture key={pictureEntry.trade.id} entry={pictureEntry} variant="full" strategyName={strategyName} /> : null}
    <AnalysisHandoffContext.Provider value={handoff}>
    <AnalysisHistoryWorkspace entry={selectedEntry} savedTradePending={savedTradePending} />
    </AnalysisHandoffContext.Provider>
    <nav className="kairos-review__navigation" aria-label="Trade review navigation">{selectedId !== null ? <Link to="/analysis?view=chart">Choose another trade</Link> : null}<Link to="/journal">Back to Journal</Link></nav>
    {loading ? <p role="status" className="kairos-review__card">Loading your saved trade…</p> : current?.error ? <div role="alert" className="kairos-review__card"><p>Could not load this view. Your saved trades have not changed.</p><button type="button" onClick={refresh}>Try again</button></div> : result?.kind === 'missing' ? <div className="kairos-review__card"><h2>Trade not found</h2><p>This trade is not available on this device. Choose another saved trade to continue.</p></div> : result?.kind === 'selection' ? <section className="kairos-review__card" aria-label="Choose a saved trade">
      <h2>Choose a saved trade</h2>
      {result.entries.length === 0 ? <><p>No saved trades yet.</p><Link to="/journal">Log your first trade</Link></> : <><p className="kairos-review__note">Your latest {DEFAULT_JOURNAL_HISTORY_LIMIT} trades, newest first. You can also open a trade from the Journal or Your Trades.</p><label className="kairos-review__picker"><span>Saved trade</span><select value="" onChange={event => { if (event.target.value) setParams({ trade: event.target.value }); }}><option value="">Select a trade</option>{result.entries.map(({ trade }) => <option key={trade.id} value={trade.id}>{trade.symbol} · {trade.side} · {trade.status} · {reviewTimestamp(trade.openedAt ?? trade.updatedAt)}</option>)}</select></label></>}
    </section> : result?.kind === 'trade' ? <TradeDetails entry={result.entry} addContractSize={addContractSize} focusResult={focusReviewResult} onResultFocused={reviewResultFocused} /> : null}
    </>}
  </section>;
}
