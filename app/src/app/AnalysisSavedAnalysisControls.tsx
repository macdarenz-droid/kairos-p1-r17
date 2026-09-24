import { useEffect, useRef, useState } from 'react';
import { useAnalysisHandoff } from './analysisHandoff';
import { SAVED_RECORD_LABEL_MAX_LENGTH } from '../domain/saved-records/savedRecordLabel';
import type { ChartDrawing, ChartMarketReference } from '../features/chart';
import type { AnalysisSavedAnalysisPorts, AnalysisSavedAnalysisSummary } from './analysisSavedAnalysisRoundTrip';

export interface AnalysisSavedAnalysisControlsProps {
  readonly ports: AnalysisSavedAnalysisPorts;
  /** The exact selected market; null hides the controls' actions. */
  readonly market: ChartMarketReference | null;
  readonly drawingCount: number;
  readonly getDrawings: () => readonly ChartDrawing[];
  readonly onLoad: (drawings: readonly ChartDrawing[]) => void;
}

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly id: string; readonly drawingCount: number; readonly zoneCount: number }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly id: string; readonly drawingCount: number; readonly zoneCount: number }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'deleted'; readonly id: string }
  | { readonly kind: 'error'; readonly reason: string };

const shortId = (id: string): string => id.slice(0, 8);
const lines = (count: number): string => (count === 1 ? '1 line' : `${count} lines`);
const zones = (count: number): string => (count === 1 ? '1 zone' : `${count} zones`);
/** "1 line", "1 zone", "1 line and 1 zone": zones are named only when present. */
const drawingWords = (drawingCount: number, zoneCount = 0): string => {
  const lineCount = drawingCount - zoneCount;
  if (zoneCount === 0) return lines(drawingCount);
  return lineCount === 0 ? zones(zoneCount) : `${lines(lineCount)} and ${zones(zoneCount)}`;
};
const zoneCountOf = (drawings: readonly ChartDrawing[]): number => drawings.filter(drawing => drawing.kind === 'zone').length;

const message = (status: Status, listed: number): string => {
  switch (status.kind) {
    case 'saving': return 'Saving this analysis…';
    case 'saved': return `Saved analysis ${shortId(status.id)} with ${drawingWords(status.drawingCount, status.zoneCount)}.`;
    case 'loading': return 'Loading the saved analysis…';
    case 'loaded': return `Loaded analysis ${shortId(status.id)} with ${drawingWords(status.drawingCount, status.zoneCount)}.`;
    case 'deleting': return 'Deleting the saved analysis…';
    case 'deleted': return `Deleted analysis ${shortId(status.id)}. The chart is unchanged.`;
    case 'error': return status.reason;
    default: return listed === 0 ? 'No saved analyses for this market yet.' : `${listed === 1 ? '1 saved analysis' : `${listed} saved analyses`} for this market.`;
  }
};

const errorText = (reason: string): string => {
  switch (reason) {
    case 'saved-analysis-save-failed': return 'The analysis could not be saved. Nothing was written.';
    case 'saved-analysis-not-found': return 'That saved analysis no longer exists.';
    case 'saved-analysis-load-failed': return 'The saved analysis could not be read.';
    case 'saved-analysis-delete-failed': return 'The saved analysis could not be deleted. It is still saved.';
    case 'saved-analysis-label-invalid': return `The label must be ${SAVED_RECORD_LABEL_MAX_LENGTH} characters or fewer. Nothing was written.`;
    default: return 'Saved analyses are unavailable right now.';
  }
};

/** Save the current drawings as a Saved Analysis and load one back; no drawing truth, no journal access. */
export function AnalysisSavedAnalysisControls({ ports, market, drawingCount, getDrawings, onLoad }: AnalysisSavedAnalysisControlsProps) {
  const [saved, setSaved] = useState<readonly AnalysisSavedAnalysisSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [listRevision, setListRevision] = useState(0);
  const marketKey = market === null ? null : `${market.venue}|${market.instrument}`;
  const handoff = useAnalysisHandoff();
  const handoffOpened = useRef(false);
  const [openRequest, setOpenRequest] = useState<string | null>(null);

  useEffect(() => {
    if (market === null) { setSaved([]); setSelectedId(''); setStatus({ kind: 'idle' }); return; }
    let cancelled = false;
    ports.list(market).then(
      summaries => { if (!cancelled) { setSaved(summaries); setSelectedId(current => (summaries.some(item => item.id === current) ? current : summaries[0]?.id ?? '')); if (handoff?.open?.kind === 'analysis' && !handoffOpened.current && summaries.some(item => item.id === handoff.open!.id)) { handoffOpened.current = true; setSelectedId(handoff.open.id); setOpenRequest(handoff.open.id); } } },
      () => { if (!cancelled) setStatus({ kind: 'error', reason: errorText('unavailable') }); },
    );
    return () => { cancelled = true; };
    // The list follows the exact market and every completed save.
  }, [ports, marketKey, listRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (openRequest === null) return;
    setOpenRequest(null);
    setStatus({ kind: 'loading' });
    ports.load(openRequest).then(result => {
      if (result.ok) { onLoad(result.savedAnalysis.drawings); setStatus({ kind: 'loaded', id: result.savedAnalysis.id, drawingCount: result.savedAnalysis.drawings.length, zoneCount: zoneCountOf(result.savedAnalysis.drawings) }); }
      else setStatus({ kind: 'error', reason: errorText(result.reason) });
    }, () => setStatus({ kind: 'error', reason: errorText('saved-analysis-load-failed') }));
    // A Library handoff opens the record exactly once, through the same released load path as the Load button.
  }, [openRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (market === null) return null;

  const save = () => {
    const drawings = getDrawings();
    if (drawings.length === 0) return;
    setStatus({ kind: 'saving' });
    ports.save(market, drawings, labelInput).then(result => {
      if (result.ok) { setStatus({ kind: 'saved', id: result.savedAnalysisId, drawingCount: drawings.length, zoneCount: zoneCountOf(drawings) }); setSelectedId(result.savedAnalysisId); setLabelInput(''); setListRevision(value => value + 1); }
      else setStatus({ kind: 'error', reason: errorText(result.reason) });
    }, () => setStatus({ kind: 'error', reason: errorText('saved-analysis-save-failed') }));
  };
  const load = () => {
    if (selectedId === '') return;
    setStatus({ kind: 'loading' });
    ports.load(selectedId).then(result => {
      if (result.ok) { onLoad(result.savedAnalysis.drawings); setStatus({ kind: 'loaded', id: result.savedAnalysis.id, drawingCount: result.savedAnalysis.drawings.length, zoneCount: zoneCountOf(result.savedAnalysis.drawings) }); }
      else setStatus({ kind: 'error', reason: errorText(result.reason) });
    }, () => setStatus({ kind: 'error', reason: errorText('saved-analysis-load-failed') }));
  };
  const remove = () => {
    if (selectedId === '') return;
    setStatus({ kind: 'deleting' });
    ports.remove(selectedId).then(result => {
      if (result.ok) { setStatus({ kind: 'deleted', id: result.savedAnalysisId }); setListRevision(value => value + 1); }
      else { setStatus({ kind: 'error', reason: errorText(result.reason) }); if (result.type === 'not-found') setListRevision(value => value + 1); }
    }, () => setStatus({ kind: 'error', reason: errorText('saved-analysis-delete-failed') }));
  };
  const busy = status.kind === 'saving' || status.kind === 'loading' || status.kind === 'deleting';

  return <div className="kairos-analysis-chart__saved-analysis" role="group" aria-label="Saved analysis" data-saved-analysis-status={status.kind} data-saved-analysis-count={saved.length}>
    <label><span>Label</span><input aria-label="Analysis label" type="text" maxLength={SAVED_RECORD_LABEL_MAX_LENGTH} placeholder="Optional name" value={labelInput} disabled={busy} onChange={event => setLabelInput(event.target.value)} /></label>
    <button type="button" disabled={busy || drawingCount === 0} onClick={save}>Save analysis</button>
    <label><span>Saved analyses</span><select aria-label="Saved analyses" value={selectedId} disabled={busy || saved.length === 0} onChange={event => setSelectedId(event.target.value)}>
      {saved.length === 0 ? <option value="">None saved</option> : saved.map(item => <option key={item.id} value={item.id}>{item.label === undefined ? '' : `${item.label} · `}{shortId(item.id)} · {drawingWords(item.drawingCount, item.zoneCount)}</option>)}
    </select></label>
    <button type="button" disabled={busy || selectedId === ''} onClick={load}>Load analysis</button>
    <button type="button" disabled={busy || selectedId === ''} onClick={remove}>Delete analysis</button>
    <span className="kairos-analysis-chart__note" aria-live="polite" data-saved-analysis-message="true">{message(status, saved.length)}</span>
  </div>;
}
