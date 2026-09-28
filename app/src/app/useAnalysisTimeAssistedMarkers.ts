import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimeAssistedTradeSnapshot } from '../application/market-reference';
import { getChartTheme } from '../design-system/themes';
import type { LightweightChartsV5ProductionCandlestickSeriesLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';
import { createAnalysisTimeAssistedMarkerSession, type AnalysisTimeAssistedMarkerSession, type AnalysisTimeAssistedMarkerSessionPresentation } from './analysisTimeAssistedMarkerSession';
import { useThemeIdOrDefault } from './useAnalysisDrawingTools';

export interface AnalysisTimeAssistedMarkersBinding {
  /** Hand this to the drawing-tools hook so both chart paths carry it into the production renderer. */
  readonly lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle;
  readonly presentation: AnalysisTimeAssistedMarkerSessionPresentation | null;
  present(snapshot: TimeAssistedTradeSnapshot | null): void;
}

const inertLifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle = Object.freeze({ attach() { /* no selection */ }, detach() { /* no selection */ } });

/**
 * One time-assisted marker session per exact Analysis selection key. The
 * latest snapshot is re-presented on the current theme and on every series
 * the production renderer attaches; the session is closed when the selection
 * changes. No estimate, chart or journal truth lives here.
 */
export function useAnalysisTimeAssistedMarkers(key: string | null, createSession: () => AnalysisTimeAssistedMarkerSession = createAnalysisTimeAssistedMarkerSession): AnalysisTimeAssistedMarkersBinding {
  const themeId = useThemeIdOrDefault();
  const [presentation, setPresentation] = useState<AnalysisTimeAssistedMarkerSessionPresentation | null>(null);
  const latest = useRef<TimeAssistedTradeSnapshot | null>(null);
  const session = useMemo(() => (key === null ? null : createSession()), [key, createSession]);
  useEffect(() => {
    if (session === null) { latest.current = null; setPresentation(null); return; }
    setPresentation(session.presentation());
    return () => { session.close(); };
  }, [session]);
  useEffect(() => {
    if (session === null) return;
    setPresentation(session.present(latest.current, getChartTheme(themeId)));
  }, [session, themeId]);
  const lifecycle = useMemo<LightweightChartsV5ProductionCandlestickSeriesLifecycle>(() => session === null ? inertLifecycle : {
    attach(series) { session.lifecycle.attach(series); setPresentation(session.presentation()); },
    detach(series) { session.lifecycle.detach(series); setPresentation(session.presentation()); },
  }, [session]);
  const present = useCallback((snapshot: TimeAssistedTradeSnapshot | null) => {
    latest.current = snapshot;
    if (session !== null) setPresentation(session.present(snapshot, getChartTheme(themeId)));
  }, [session, themeId]);
  return { lifecycle, presentation, present };
}
