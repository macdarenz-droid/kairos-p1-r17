import { useEffect, useRef, useState } from 'react';
import { composeTimeAssistedTradeSnapshot, type EstimatedMarketReference, type TimeAssistedTradeSide, type TimeAssistedTradeSnapshot, type TimeAssistedTradeSnapshotResult } from '../application/market-reference';
import type { MarketCandleHistoryPort } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import { analysisHistoryPorts } from './analysisHistoryPorts';
import { useAnalysisHandoff } from './analysisHandoff';
import { SAVED_RECORD_LABEL_MAX_LENGTH } from './savedRecordLabel';
import { analysisSavedTimeAssistedSnapshotPorts, savedTimeAssistedSnapshotToSnapshot, type AnalysisSavedTimeAssistedSnapshotPorts, type AnalysisSavedTimeAssistedSnapshotSummary } from './analysisSavedTimeAssistedSnapshotRoundTrip';
import type { AnalysisTimeAssistedMarkerSessionPresentation } from './analysisTimeAssistedMarkerSession';
import type { AnalysisTimeAssistedWindowRange, AnalysisTimeAssistedWindowResult } from './analysisTimeAssistedWindowSession';

export interface AnalysisTimeAssistedSnapshotControlsProps {
  /** The released P15/P16 history port (the Analysis browser composition by default); the controls make no other network call. */
  readonly history?: Pick<MarketCandleHistoryPort, 'acquireHistory'>;
  /** The exact selected market; null hides the controls. */
  readonly instrument: MarketDataInstrument | null;
  /** The released P23 save/list/load ports (the production database by default); the controls make no other persistence call. */
  readonly saved?: AnalysisSavedTimeAssistedSnapshotPorts;
  /** The clock for the future-instant check (tests inject a fixed one). */
  readonly now?: () => number;
  /** Receives every result: the snapshot to show as chart markers, or null when there is nothing to show. */
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
  | { readonly kind: 'estimating' }
  | { readonly kind: 'ready'; readonly result: TimeAssistedTradeSnapshotResult };

type SavedStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly id: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly id: string; readonly savedAt: string }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'deleted'; readonly id: string }
  | { readonly kind: 'error'; readonly reason: string };

const shortId = (id: string): string => id.slice(0, 8);
const savedErrorText = (reason: string): string => {
  switch (reason) {
    case 'saved-time-assisted-snapshot-save-failed': return 'The snapshot could not be saved. Nothing was written.';
    case 'saved-time-assisted-snapshot-not-found': return 'That saved snapshot no longer exists.';
    case 'saved-time-assisted-snapshot-load-failed': return 'The saved snapshot could not be read.';
    case 'saved-time-assisted-snapshot-delete-failed': return 'The saved snapshot could not be deleted. It is still saved.';
    case 'snapshot-not-composed': return 'Estimate the snapshot before saving it.';
    case 'label-invalid': return `The label must be ${SAVED_RECORD_LABEL_MAX_LENGTH} characters or fewer. Nothing was written.`;
    default: return 'Saved snapshots are unavailable right now.';
  }
};

const deviceTimeZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'device time'; } catch { return 'device time'; } };
const utcClock = (iso: string): string => iso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const savedMessage = (status: SavedStatus, listed: number): string => {
  switch (status.kind) {
    case 'saving': return 'Saving this snapshot…';
    case 'saved': return `Saved snapshot ${shortId(status.id)} with its estimates as shown.`;
    case 'loading': return 'Loading the saved snapshot…';
    case 'loaded': return `Loaded snapshot ${shortId(status.id)} saved ${utcClock(status.savedAt)}; estimates as acquired then, not re-estimated.`;
    case 'deleting': return 'Deleting the saved snapshot…';
    case 'deleted': return `Deleted snapshot ${shortId(status.id)}. The shown estimate is unchanged.`;
    case 'error': return status.reason;
    default: return listed === 0 ? 'No saved snapshots for this market yet.' : `${listed === 1 ? '1 saved snapshot' : `${listed} saved snapshots`} for this market.`;
  }
};
const savedOption = (item: AnalysisSavedTimeAssistedSnapshotSummary): string => `${item.label === undefined ? '' : `${item.label} · `}${shortId(item.id)} · ${item.side === 'long' ? 'Long' : 'Short'} · opened ${utcClock(item.openedAtUtc)}${item.closedAtUtc === null ? ' · still open' : ''}`;
const seconds = (ms: number): string => `${Math.round(ms / 1000)}s`;
const duration = (ms: number): string => {
  const total = Math.round(ms / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', s || (!h && !m) ? `${s}s` : ''].filter(Boolean).join(' ');
};
const invalidText = (reason: Extract<TimeAssistedTradeSnapshotResult, { kind: 'invalid' }>['reason']): string => {
  switch (reason) {
    case 'side-invalid': return 'Choose long or short.';
    case 'opened-at-invalid': return 'Enter the opening date and time.';
    case 'closed-at-invalid': return 'The closing date and time is not valid.';
    case 'closed-before-opened': return 'The closing time must not be before the opening time.';
  }
};
const unavailableText = (reason: Extract<EstimatedMarketReference, { kind: 'unavailable' }>['reason']): string => {
  switch (reason) {
    case 'future-instant': return 'That time is in the future; no market candle exists yet.';
    case 'invalid-instant': return 'That time could not be read.';
    case 'no-candle': return 'No market candle exists for that minute on this venue.';
    case 'candle-mismatch': return 'The venue returned a candle for a different minute; nothing is estimated.';
    case 'http-error': return 'The venue refused the history request.';
    case 'transport-failed': case 'cancelled': return 'The history request did not complete. Check your connection.';
    default: return 'The venue response could not be used.';
  }
};

const windowText = (result: AnalysisTimeAssistedWindowResult): string => {
  switch (result.kind) {
    case 'shown': return result.visible === null ? 'Showing the trade interval…' : `The chart now shows ${utcClock(new Date(result.visible.fromMs).toISOString())} to ${utcClock(new Date(result.visible.toMs).toISOString())}.`;
    case 'pending-chart': return 'The chart is not live yet; try again once candles are connected.';
    case 'unsupported': return 'This chart cannot be scrolled to a time range.';
    case 'invalid-range': return 'The trade interval could not be shown.';
  }
};

const markerText = (markers: AnalysisTimeAssistedMarkerSessionPresentation): string => {
  switch (markers.kind) {
    case 'pending-series': return 'Chart markers appear once the chart is live.';
    case 'cleared': return 'No estimate markers on the chart.';
    default: return markers.markerCount === 0 ? 'No estimate markers on the chart.' : `${markers.markerCount === 1 ? '1 estimate marker' : `${markers.markerCount} estimate markers`} on the chart, on the containing candles${markers.unplaced.length ? ` (${markers.unplaced.join(' and ')} not placed)` : ''}.`;
  }
};

function Estimate({ label, estimate }: { readonly label: string; readonly estimate: EstimatedMarketReference }) {
  if (estimate.kind === 'unavailable') return <div className="kairos-time-assisted__estimate" data-estimate={label.toLowerCase()} data-estimate-kind="unavailable"><strong>{label}</strong><p>{unavailableText(estimate.reason)}</p></div>;
  const { candle } = estimate;
  return <div className="kairos-time-assisted__estimate" data-estimate={label.toLowerCase()} data-estimate-kind="candle-range" data-candle-open-time={candle.openTime} data-candle-low={candle.low} data-candle-high={candle.high}>
    <strong>{label}</strong>
    <p>Estimated from the 1-minute market candle at {utcClock(candle.openTime)}, {seconds(estimate.gapMs)} after its open. Not your fill.</p>
    <dl>
      <div><dt>Range</dt><dd>{candle.low} – {candle.high}</dd></div>
      <div><dt>Open</dt><dd>{candle.open}</dd></div>
      <div><dt>Close</dt><dd>{candle.close}</dd></div>
    </dl>
  </div>;
}

/** Time-assisted preview: instrument from the Analysis selection, side and instants from the user, estimates from the released P22.2 composition. No journal access, no chart drawing. */
export function AnalysisTimeAssistedSnapshotControls({ history = analysisHistoryPorts.history, instrument, saved = analysisSavedTimeAssistedSnapshotPorts, now, onSnapshot, markers = null, onShowWindow, window: windowResult = null, windowNow }: AnalysisTimeAssistedSnapshotControlsProps) {
  const [side, setSide] = useState<TimeAssistedTradeSide>('long');
  const [openedAt, setOpenedAt] = useState('');
  const [closedAt, setClosedAt] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const [savedList, setSavedList] = useState<readonly AnalysisSavedTimeAssistedSnapshotSummary[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [savedLabelInput, setSavedLabelInput] = useState('');
  const [savedStatus, setSavedStatus] = useState<SavedStatus>({ kind: 'idle' });
  const [listRevision, setListRevision] = useState(0);
  const marketKey = instrument === null ? null : `${instrument.venue}|${instrument.symbol}`;
  const handoff = useAnalysisHandoff();
  const handoffOpened = useRef(false);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  useEffect(() => { setStatus({ kind: 'idle' }); return () => { controller.current?.abort(); controller.current = null; }; }, [marketKey]);
  useEffect(() => {
    if (instrument === null) { setSavedList([]); setSelectedSavedId(''); setSavedStatus({ kind: 'idle' }); return; }
    let cancelled = false;
    saved.list(instrument).then(
      summaries => { if (!cancelled) { setSavedList(summaries); setSelectedSavedId(current => (summaries.some(item => item.id === current) ? current : summaries[0]?.id ?? '')); if (handoff?.open?.kind === 'snapshot' && !handoffOpened.current && summaries.some(item => item.id === handoff.open!.id)) { handoffOpened.current = true; setSelectedSavedId(handoff.open.id); setOpenRequest(handoff.open.id); } } },
      () => { if (!cancelled) setSavedStatus({ kind: 'error', reason: savedErrorText('unavailable') }); },
    );
    return () => { cancelled = true; };
    // The list follows the exact market and every completed save.
  }, [saved, marketKey, listRevision]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadSnapshotById = (id: string) => {
    setSavedStatus({ kind: 'loading' });
    saved.load(id).then(outcome => {
      if (!outcome.ok) { setSavedStatus({ kind: 'error', reason: savedErrorText(outcome.reason) }); return; }
      const record = outcome.savedTimeAssistedSnapshot;
      controller.current?.abort(); controller.current = null;
      const snapshot = savedTimeAssistedSnapshotToSnapshot(record);
      setSide(record.side); setOpenedAt(record.openedAt); setClosedAt(record.closedAt ?? '');
      setStatus({ kind: 'ready', result: snapshot });
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

  const estimate = () => {
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setStatus({ kind: 'estimating' });
    composeTimeAssistedTradeSnapshot(history, { instrument, side, openedAt, closedAt: closedAt.trim() === '' ? null : closedAt }, { signal: next.signal, ...(now === undefined ? {} : { now }) })
      .then(result => { if (next.signal.aborted) return; setStatus({ kind: 'ready', result }); onSnapshot?.(result.kind === 'snapshot' ? result : null); }, () => { if (next.signal.aborted) return; setStatus({ kind: 'ready', result: { kind: 'invalid', reason: 'opened-at-invalid' } }); onSnapshot?.(null); });
  };
  const result = status.kind === 'ready' ? status.result : null;
  const dataStatus = status.kind === 'ready' ? result!.kind : status.kind;
  const loadSnapshot = () => { if (selectedSavedId === '') return; loadSnapshotById(selectedSavedId); };
  const savedBusy = savedStatus.kind === 'saving' || savedStatus.kind === 'loading' || savedStatus.kind === 'deleting';
  const removeSnapshot = () => {
    if (selectedSavedId === '') return;
    setSavedStatus({ kind: 'deleting' });
    saved.remove(selectedSavedId).then(outcome => {
      if (outcome.ok) { setSavedStatus({ kind: 'deleted', id: outcome.savedTimeAssistedSnapshotId }); setListRevision(value => value + 1); }
      else { setSavedStatus({ kind: 'error', reason: savedErrorText(outcome.reason) }); if (outcome.type === 'not-found') setListRevision(value => value + 1); }
    }, () => setSavedStatus({ kind: 'error', reason: savedErrorText('saved-time-assisted-snapshot-delete-failed') }));
  };
  const saveSnapshot = () => {
    if (result?.kind !== 'snapshot') return;
    setSavedStatus({ kind: 'saving' });
    saved.save(result, deviceTimeZone(), savedLabelInput).then(outcome => {
      if (outcome.ok) { setSavedStatus({ kind: 'saved', id: outcome.savedTimeAssistedSnapshotId }); setSelectedSavedId(outcome.savedTimeAssistedSnapshotId); setSavedLabelInput(''); setListRevision(value => value + 1); }
      else setSavedStatus({ kind: 'error', reason: savedErrorText(outcome.reason) });
    }, () => setSavedStatus({ kind: 'error', reason: savedErrorText('saved-time-assisted-snapshot-save-failed') }));
  };
  return <section className="kairos-time-assisted" aria-labelledby="kairos-time-assisted-title" data-time-assisted-status={dataStatus}>
    <h3 id="kairos-time-assisted-title">Time-assisted snapshot</h3>
    <p className="kairos-analysis-chart__note">Enter when a trade opened and closed to see the market candle at each moment. Times are in your device time zone ({deviceTimeZone()}). Estimates are market references, never your fill, and nothing is saved until you save a snapshot.</p>
    <form className="kairos-time-assisted__form" onSubmit={event => { event.preventDefault(); estimate(); }}>
      <label><span>Side</span><select aria-label="Snapshot side" value={side} onChange={event => setSide(event.target.value as TimeAssistedTradeSide)}><option value="long">Long</option><option value="short">Short</option></select></label>
      <label><span>Opened at</span><input aria-label="Snapshot opened at" type="datetime-local" step="1" value={openedAt} onChange={event => setOpenedAt(event.target.value)} /></label>
      <label><span>Closed at</span><input aria-label="Snapshot closed at" type="datetime-local" step="1" value={closedAt} onChange={event => setClosedAt(event.target.value)} /></label>
      <button type="submit" disabled={status.kind === 'estimating'}>Estimate</button>
    </form>
    <div aria-live="polite" data-time-assisted-result="true">
      {status.kind === 'estimating' ? <p className="kairos-analysis-chart__note">Looking up market candles…</p> : null}
      {result?.kind === 'invalid' ? <p role="alert">{invalidText(result.reason)}</p> : null}
      {result?.kind === 'snapshot' ? <>
        <p className="kairos-analysis-chart__note">{result.side === 'long' ? 'Long' : 'Short'} · {result.durationMs === null ? 'still open' : `held ${duration(result.durationMs)}`} · {instrument.symbol} on {instrument.venue}</p>
        <Estimate label="Entry" estimate={result.opening} />
        {result.closing === null ? null : <Estimate label="Exit" estimate={result.closing} />}
        {markers === null ? null : <p className="kairos-analysis-chart__note" data-time-assisted-markers={markers.kind === 'presented' ? String(markers.markerCount) : markers.kind}>{markerText(markers)}</p>}
        {onShowWindow === undefined ? null : <p className="kairos-time-assisted__window"><button type="button" onClick={() => {
          const fromMs = Date.parse(result.opening.requestedAt);
          const toMs = result.closing === null ? (windowNow ?? Date.now)() : Date.parse(result.closing.requestedAt);
          onShowWindow({ fromMs, toMs });
        }}>Show on chart</button>{windowResult === null ? null : <span aria-live="polite" data-time-assisted-window={windowResult.kind}>{windowText(windowResult)}</span>}</p>}
      </> : null}
    </div>
    <div className="kairos-time-assisted__saved" role="group" aria-label="Saved snapshot" data-saved-snapshot-status={savedStatus.kind} data-saved-snapshot-count={savedList.length}>
      <label><span>Label</span><input aria-label="Snapshot label" type="text" maxLength={SAVED_RECORD_LABEL_MAX_LENGTH} placeholder="Optional name" value={savedLabelInput} disabled={savedBusy} onChange={event => setSavedLabelInput(event.target.value)} /></label>
      <button type="button" disabled={savedBusy || result?.kind !== 'snapshot'} onClick={saveSnapshot}>Save snapshot</button>
      <label><span>Saved snapshots</span><select aria-label="Saved snapshots" value={selectedSavedId} disabled={savedBusy || savedList.length === 0} onChange={event => setSelectedSavedId(event.target.value)}>
        {savedList.length === 0 ? <option value="">None saved</option> : savedList.map(item => <option key={item.id} value={item.id}>{savedOption(item)}</option>)}
      </select></label>
      <button type="button" disabled={savedBusy || selectedSavedId === ''} onClick={loadSnapshot}>Load snapshot</button>
      <button type="button" disabled={savedBusy || selectedSavedId === ''} onClick={removeSnapshot}>Delete snapshot</button>
      <span className="kairos-analysis-chart__note" aria-live="polite" data-saved-snapshot-message="true">{savedMessage(savedStatus, savedList.length)}</span>
    </div>
  </section>;
}
