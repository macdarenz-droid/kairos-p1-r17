import { useEffect, useRef, useState } from 'react';
import type { EstimatedMarketReference, TimeAssistedTradeSnapshot } from '../application/market-reference';
import { OANDA_FOREX_VENUE, type MarketDataInstrument } from '../services/market-data/marketDataTypes';
import { useAnalysisHandoff } from './analysisHandoff';
import { ConfirmDialog } from '../design-system/primitives';
import { analysisSavedTimeAssistedSnapshotPorts, savedTimeAssistedSnapshotToSnapshot, type AnalysisSavedTimeAssistedSnapshotPorts, type AnalysisSavedTimeAssistedSnapshotSummary } from './analysisSavedTimeAssistedSnapshotRoundTrip';
import type { AnalysisTimeAssistedMarkerSessionPresentation } from './analysisTimeAssistedMarkerSession';
import type { AnalysisTimeAssistedWindowRange, AnalysisTimeAssistedWindowResult } from './analysisTimeAssistedWindowSession';

export interface AnalysisTimeAssistedSnapshotControlsProps {
  /** The exact selected market; null hides the controls. */
  readonly instrument: MarketDataInstrument | null;
  /** The released P23 list/load/delete ports (the production database by default); the controls make no other persistence call and no network call. */
  readonly saved?: AnalysisSavedTimeAssistedSnapshotPorts;
  /** Receives every loaded snapshot to show as chart markers. */
  readonly onSnapshot?: (snapshot: TimeAssistedTradeSnapshot | null) => void;
  /** The chart marker state reported by the time-assisted marker session, if a chart carries them. */
  readonly markers?: AnalysisTimeAssistedMarkerSessionPresentation | null;
  /** Scrolls the chart to the trade interval; the result is shown beside the estimates. */
  readonly onShowWindow?: (range: AnalysisTimeAssistedWindowRange) => AnalysisTimeAssistedWindowResult;
  readonly window?: AnalysisTimeAssistedWindowResult | null;
  /** The clock for an open trade's window end (tests inject a fixed one); defaults to the wall clock. */
  readonly windowNow?: () => number;
}

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ready'; readonly result: TimeAssistedTradeSnapshot; readonly openedAtUtc: string; readonly closedAtUtc: string | null };

type SavedStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly id: string; readonly savedAt: string }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'deleted'; readonly id: string }
  | { readonly kind: 'error'; readonly reason: string };

const savedErrorText = (reason: string): string => {
  switch (reason) {
    case 'saved-time-assisted-snapshot-not-found': return 'That saved estimate no longer exists.';
    case 'saved-time-assisted-snapshot-load-failed': return 'The saved estimate could not be read.';
    case 'saved-time-assisted-snapshot-delete-failed': return 'The saved estimate could not be deleted. It is still saved.';
    default: return 'Saved estimates are unavailable right now.';
  }
};

/** "10 Sep 02:13" in this device's time, as the trade form's times are typed. */
const localWhen = (iso: string): string => {
  const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('hour')}:${part('minute')}`;
};
const savedMessage = (status: SavedStatus, listed: number): string => {
  switch (status.kind) {
    case 'loading': return 'Opening the saved estimate…';
    case 'loaded': return `Opened the estimate saved ${localWhen(status.savedAt)}. Its prices are as they were then.`;
    case 'deleting': return 'Deleting the saved estimate…';
    case 'deleted': return 'Deleted the saved estimate. What is shown is unchanged.';
    case 'error': return status.reason;
    default: return listed === 0 ? 'No saved estimates for this market.' : `${listed === 1 ? '1 saved estimate' : `${listed} saved estimates`} for this market.`;
  }
};
const savedOption = (item: AnalysisSavedTimeAssistedSnapshotSummary): string => `${item.label === undefined ? '' : `${item.label} · `}${item.side === 'long' ? 'Long' : 'Short'} · opened ${localWhen(item.openedAtUtc)}${item.closedAtUtc === null ? ' · still open' : ''} · saved ${localWhen(item.savedAt)}`;
const seconds = (ms: number): string => `${Math.round(ms / 1000)}s`;
const duration = (ms: number): string => {
  const total = Math.round(ms / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', s || (!h && !m) ? `${s}s` : ''].filter(Boolean).join(' ');
};
/** U10: a forex chart's words name OANDA and say why a minute can have no candle. */
const forexUnavailableText = (reason: Extract<EstimatedMarketReference, { kind: 'unavailable' }>['reason']): string | null => {
  switch (reason) {
    case 'no-candle': return 'No candle at that minute. Forex is closed at weekends, and a quiet minute can have none.';
    case 'candle-mismatch': return 'OANDA gave a candle for a different minute, so nothing is estimated.';
    case 'http-error': return "OANDA didn't give a candle for that time. Try again later.";
    default: return null;
  }
};
const unavailableText = (reason: Extract<EstimatedMarketReference, { kind: 'unavailable' }>['reason'], forex: boolean): string => {
  const forexWords = forex ? forexUnavailableText(reason) : null;
  if (forexWords !== null) return forexWords;
  switch (reason) {
    case 'future-instant': return "That time hadn't happened yet, so there is no market price for it.";
    case 'invalid-instant': return 'That time could not be read.';
    case 'no-candle': return 'There is no market price for that minute.';
    case 'candle-mismatch': return 'Binance gave a price for a different minute, so nothing is estimated.';
    case 'http-error': return 'Binance refused the request.';
    case 'transport-failed': case 'cancelled': return "The prices didn't arrive. Check your connection.";
    default: return "Binance's answer couldn't be read.";
  }
};

const windowText = (result: AnalysisTimeAssistedWindowResult): string => {
  switch (result.kind) {
    case 'shown': return result.visible === null ? 'Showing the trade on the chart…' : `The chart now shows ${localWhen(new Date(result.visible.fromMs).toISOString())} to ${localWhen(new Date(result.visible.toMs).toISOString())}.`;
    case 'pending-chart': return 'The chart is not live yet; try again once candles are connected.';
    case 'unsupported': return "This chart can't move to those times.";
    case 'invalid-range': return "The trade's times couldn't be shown on the chart.";
  }
};

const markerText = (markers: AnalysisTimeAssistedMarkerSessionPresentation): string => {
  switch (markers.kind) {
    case 'pending-series': return 'The estimates are marked on the chart once it is live.';
    case 'cleared': return 'Nothing is marked on the chart.';
    default: return markers.markerCount === 0 ? 'Nothing is marked on the chart.' : `${markers.markerCount === 1 ? '1 estimate is' : `${markers.markerCount} estimates are`} marked on the chart, on their minutes' candles${markers.unplaced.length ? ` (${markers.unplaced.join(' and ')} not placed)` : ''}.`;
  }
};

function Estimate({ label, estimate, forex = false }: { readonly label: string; readonly estimate: EstimatedMarketReference; readonly forex?: boolean }) {
  if (estimate.kind === 'unavailable') return <div className="kairos-time-assisted__estimate" data-estimate={label.toLowerCase()} data-estimate-kind="unavailable"><strong>{label}</strong><p>{unavailableText(estimate.reason, forex)}</p></div>;
  const { candle } = estimate;
  return <div className="kairos-time-assisted__estimate" data-estimate={label.toLowerCase()} data-estimate-kind="candle-range" data-candle-open-time={candle.openTime} data-candle-low={candle.low} data-candle-high={candle.high}>
    <strong>{label}</strong>
    <p>Estimated from the market's 1-minute candle at {localWhen(candle.openTime)}, {seconds(estimate.gapMs)} into that minute. Not the price you got.</p>
    <dl>
      <div><dt>Lowest – highest</dt><dd>{candle.low} – {candle.high}</dd></div>
      <div><dt>First price</dt><dd>{candle.open}</dd></div>
      <div><dt>Last price</dt><dd>{candle.close}</dd></div>
    </dl>
  </div>;
}

const sideWord = (snapshot: TimeAssistedTradeSnapshot): string => (snapshot.side === 'long' ? 'Long' : 'Short');

/**
 * U14 (D12, D257): your saved trades estimated from time, for the selected market: list, load (drawn on the chart, with
 * "Show on chart") and delete. New ones are no longer made here; the trade form's "See the market price at that minute"
 * checks a price at a minute instead. No journal access and no network call.
 */
export function AnalysisTimeAssistedSnapshotControls({ instrument, saved = analysisSavedTimeAssistedSnapshotPorts, onSnapshot, markers = null, onShowWindow, window: windowResult = null, windowNow }: AnalysisTimeAssistedSnapshotControlsProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [savedList, setSavedList] = useState<readonly AnalysisSavedTimeAssistedSnapshotSummary[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [savedStatus, setSavedStatus] = useState<SavedStatus>({ kind: 'idle' });
  // "Delete estimate" asks first (D178); the saved estimate is removed only on "Delete for good".
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  const marketKey = instrument === null ? null : `${instrument.venue}|${instrument.symbol}`;
  const handoff = useAnalysisHandoff();
  const handoffOpened = useRef(false);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  // Set when a finished delete reloads the list: if nothing is left to select, focus moves from the disabled button to the heading.
  const focusAfterDelete = useRef(false);
  useEffect(() => { setStatus({ kind: 'idle' }); }, [marketKey]);
  useEffect(() => {
    if (instrument === null) { setSavedList([]); setSelectedSavedId(''); setSavedStatus({ kind: 'idle' }); return; }
    let cancelled = false;
    saved.list(instrument).then(
      summaries => { if (!cancelled) { setSavedList(summaries); setSelectedSavedId(current => (summaries.some(item => item.id === current) ? current : summaries[0]?.id ?? '')); if (handoff?.open?.kind === 'snapshot' && !handoffOpened.current && summaries.some(item => item.id === handoff.open!.id)) { handoffOpened.current = true; setSelectedSavedId(handoff.open.id); setOpenRequest(handoff.open.id); } } },
      () => { if (!cancelled) setSavedStatus({ kind: 'error', reason: savedErrorText('unavailable') }); },
    );
    return () => { cancelled = true; };
    // The list follows the exact market and every completed delete.
  }, [saved, marketKey, listRevision]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusAfterDelete.current) return;
    focusAfterDelete.current = false;
    const active = document.activeElement;
    if (selectedSavedId === '' && (active === deleteButton.current || active === document.body || active === null)) titleRef.current?.focus();
  }, [savedList]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadSnapshotById = (id: string) => {
    setSavedStatus({ kind: 'loading' });
    saved.load(id).then(outcome => {
      if (!outcome.ok) { setSavedStatus({ kind: 'error', reason: savedErrorText(outcome.reason) }); return; }
      const record = outcome.savedTimeAssistedSnapshot;
      const snapshot = savedTimeAssistedSnapshotToSnapshot(record);
      setStatus({ kind: 'ready', result: snapshot, openedAtUtc: record.openedAtUtc, closedAtUtc: record.closedAtUtc });
      onSnapshot?.(snapshot);
      setSavedStatus({ kind: 'loaded', id: record.id, savedAt: record.savedAt });
    }, () => setSavedStatus({ kind: 'error', reason: savedErrorText('saved-time-assisted-snapshot-load-failed') }));
  };

  useEffect(() => {
    if (openRequest === null) return;
    setOpenRequest(null);
    loadSnapshotById(openRequest);
    // A Library handoff opens the record exactly once, through the same released load path as the Load button.
  }, [openRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (instrument === null) return null;

  const shown = status.kind === 'ready' ? status : null;
  const result = shown?.result ?? null;
  const dataStatus = result === null ? 'idle' : 'snapshot';
  const loadSnapshot = () => { if (selectedSavedId === '') return; loadSnapshotById(selectedSavedId); };
  const savedBusy = savedStatus.kind === 'loading' || savedStatus.kind === 'deleting';
  const removeSnapshot = () => {
    if (selectedSavedId === '') return;
    setSavedStatus({ kind: 'deleting' });
    // The dialog stays open and busy until the delete answers, so its focus return lands on an enabled "Delete estimate".
    saved.remove(selectedSavedId).then(outcome => {
      setConfirmingDelete(false);
      if (outcome.ok) { focusAfterDelete.current = true; setSavedStatus({ kind: 'deleted', id: outcome.savedTimeAssistedSnapshotId }); setListRevision(value => value + 1); }
      else { setSavedStatus({ kind: 'error', reason: savedErrorText(outcome.reason) }); if (outcome.type === 'not-found') { focusAfterDelete.current = true; setListRevision(value => value + 1); } }
    }, () => { setConfirmingDelete(false); setSavedStatus({ kind: 'error', reason: savedErrorText('saved-time-assisted-snapshot-delete-failed') }); });
  };
  const forex = instrument.venue === OANDA_FOREX_VENUE;
  return <section className="kairos-time-assisted" aria-labelledby="kairos-time-assisted-title" data-time-assisted-status={dataStatus}>
    <h3 id="kairos-time-assisted-title" ref={titleRef} tabIndex={-1}>Trades estimated from time</h3>
    <p className="kairos-analysis-chart__note">Your saved trades estimated from time. To check a price at a minute, use "See the market price at that minute" in the trade form.</p>
    <div aria-live="polite" data-time-assisted-result="true">
      {shown !== null && result !== null ? <>
        <p className="kairos-analysis-chart__note" data-time-assisted-times="true">{sideWord(result)} · opened {localWhen(shown.openedAtUtc)}{shown.closedAtUtc === null ? ' · still open' : ` · closed ${localWhen(shown.closedAtUtc)}`}</p>
        <p className="kairos-analysis-chart__note">{result.durationMs === null ? 'Still open' : `Held ${duration(result.durationMs)}`} · {forex ? `${instrument.symbol} from OANDA` : `${instrument.symbol} on Binance`}</p>
        <Estimate label="Entry" estimate={result.opening} forex={forex} />
        {result.closing === null ? null : <Estimate label="Exit" estimate={result.closing} forex={forex} />}
        {markers === null ? null : <p className="kairos-analysis-chart__note" data-time-assisted-markers={markers.kind === 'presented' ? String(markers.markerCount) : markers.kind}>{markerText(markers)}</p>}
        {onShowWindow === undefined ? null : <p className="kairos-time-assisted__window"><button type="button" onClick={() => {
          const fromMs = Date.parse(result.opening.requestedAt);
          const toMs = result.closing === null ? (windowNow ?? Date.now)() : Date.parse(result.closing.requestedAt);
          onShowWindow({ fromMs, toMs });
        }}>Show on chart</button>{windowResult === null ? null : <span aria-live="polite" data-time-assisted-window={windowResult.kind}>{windowText(windowResult)}</span>}</p>}
      </> : null}
    </div>
    <div className="kairos-time-assisted__saved" role="group" aria-label="Your saved estimates" data-saved-snapshot-status={savedStatus.kind} data-saved-snapshot-count={savedList.length}>
      <label><span>Saved estimate</span><select aria-label="Saved estimate" value={selectedSavedId} disabled={savedBusy || savedList.length === 0} onChange={event => setSelectedSavedId(event.target.value)}>
        {savedList.length === 0 ? <option value="">None saved</option> : savedList.map(item => <option key={item.id} value={item.id}>{savedOption(item)}</option>)}
      </select></label>
      <button type="button" disabled={savedBusy || selectedSavedId === ''} onClick={loadSnapshot}>Open estimate</button>
      <button ref={deleteButton} type="button" disabled={savedBusy || selectedSavedId === ''} onClick={() => setConfirmingDelete(true)}>Delete estimate</button>
      <ConfirmDialog open={confirmingDelete} tone="danger" busy={savedStatus.kind === 'deleting'} title="Delete this saved estimate for good?"
        message="It will be gone from this device. Your trades stay as they are." confirmLabel="Delete for good" cancelLabel="Keep it"
        onConfirm={removeSnapshot} onCancel={() => setConfirmingDelete(false)} />
      <span className="kairos-analysis-chart__note" aria-live="polite" data-saved-snapshot-message="true">{savedMessage(savedStatus, savedList.length)}</span>
    </div>
  </section>;
}
