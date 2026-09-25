import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { loadTradeReview, type TradeReviewResult } from '../application/journal/loadTradeReview';
import { DEFAULT_JOURNAL_HISTORY_LIMIT } from '../application/journal/historyQuery';
import { TradeReviewDetails, reviewTimestamp } from './TradeReviewDetails';
import './tradeReview.css';
import { AnalysisHistoryWorkspace } from './AnalysisHistoryWorkspace';
import { AnalysisHandoffContext, parseAnalysisHandoff } from './analysisHandoff';
import { TradePicture } from '../features/journal/TradePicture';

type State = { readonly key: string | null; readonly result: TradeReviewResult | null; readonly error: boolean };
type TradeEntry = Extract<TradeReviewResult, { kind: 'trade' }>['entry'];
/** The last trade picture loaded for one selection (its counter n); a refresh of that selection keeps it mounted so an open hint sheet survives. */
type Shown = { readonly n: number; readonly entry: TradeEntry } | null;

/** Route selection and async read lifecycle only; all saved facts come from P12. */
export function AnalysisRoute({ load = loadTradeReview }: { readonly load?: (id: string | null) => Promise<TradeReviewResult> }) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('trade');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ key: selectedId, result: null, error: false });
  // Changes on every selectedId change, so A → another → A is a new selection even for the same trade id.
  const [selection, setSelection] = useState({ id: selectedId, n: 0 });
  if (selection.id !== selectedId) setSelection({ id: selectedId, n: selection.n + 1 });
  const selectionN = selection.id === selectedId ? selection.n : selection.n + 1;
  const [shown, setShown] = useState<Shown>(null);
  const focusedFor = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const current = state.key === selectedId ? state : null;
  const loading = current === null || (current.result === null && !current.error);

  useEffect(() => {
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
  }, [load, selectedId, selectionN, revision]);

  useEffect(() => {
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);

  // The heading takes focus once per selection after its first load, and again whenever focus was lost to the page
  // (a removed "Try again"). A refresh never takes focus from an open sheet.
  useEffect(() => {
    if (loading) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (focusedFor.current === selectionN && !lost) return;
    focusedFor.current = selectionN;
    heading.current?.focus();
  }, [selectionN, loading]);

  const result = current?.result;
  const selectedEntry = result?.kind === 'trade' ? result.entry : null;
  const pictureEntry = selectedEntry ?? (shown !== null && shown.n === selectionN && loading ? shown.entry : null);
  const savedTradePending = selectedId !== null && loading;
  const handoff = parseAnalysisHandoff(params);
  return <section className="kairos-route kairos-review" aria-labelledby="kairos-review-title" aria-busy={loading || undefined}>
    <header className="kairos-review__heading"><div><p className="kairos-review__eyebrow">Charts & trade review</p><h1 id="kairos-review-title" tabIndex={-1} ref={heading}>Analysis</h1></div><button type="button" onClick={refresh} disabled={loading}>Refresh</button></header>
    {pictureEntry ? <TradePicture key={pictureEntry.trade.id} entry={pictureEntry} variant="full" /> : null}
    <AnalysisHandoffContext.Provider value={handoff}>
    <AnalysisHistoryWorkspace entry={selectedEntry} savedTradePending={savedTradePending} />
    </AnalysisHandoffContext.Provider>
    <nav className="kairos-review__navigation" aria-label="Trade review navigation">{selectedId !== null ? <Link to="/analysis">Choose another trade</Link> : null}<Link to="/journal">Back to Journal</Link></nav>
    {loading ? <p role="status" className="kairos-review__card">Loading your saved trade…</p> : current?.error ? <div role="alert" className="kairos-review__card"><p>Could not load this view. Your saved trades have not changed.</p><button type="button" onClick={refresh}>Try again</button></div> : result?.kind === 'missing' ? <div className="kairos-review__card"><h2>Trade not found</h2><p>This trade is not available on this device. Choose another saved trade to continue.</p></div> : result?.kind === 'selection' ? <section className="kairos-review__card" aria-label="Choose a saved trade">
      <h2>Choose a saved trade</h2>
      {result.entries.length === 0 ? <><p>No saved trades yet.</p><Link to="/journal">Log your first trade</Link></> : <><p className="kairos-review__note">Review the latest {DEFAULT_JOURNAL_HISTORY_LIMIT} updated trades. You can also open a trade from Journal or Your Trades.</p><label className="kairos-review__picker"><span>Saved trade</span><select value="" onChange={event => { if (event.target.value) setParams({ trade: event.target.value }); }}><option value="">Select a trade</option>{result.entries.map(({ trade }) => <option key={trade.id} value={trade.id}>{trade.symbol} · {trade.side} · {trade.status} · {reviewTimestamp(trade.openedAt ?? trade.updatedAt)}</option>)}</select></label></>}
    </section> : result?.kind === 'trade' ? <TradeReviewDetails entry={result.entry} /> : null}
  </section>;
}
