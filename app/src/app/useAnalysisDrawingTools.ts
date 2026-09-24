import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultThemeId, useTheme, type ThemeId } from '../design-system/themes';
import type { ChartDrawing, ChartDrawingInteractionState, ChartDrawingKind } from '../features/chart';
import { createAnalysisDrawingToolsLiveSessionFactory, createAnalysisDrawingToolsOverlaySessionFactory, createAnalysisDrawingToolsSession } from './analysisDrawingToolsComposition';
import type { AnalysisDrawingToolsRendererSession } from '../features/analysis/analysisDrawingToolsRendererSession';
import { composeDrawingBindingLifecycles } from './analysisTimeAssistedWindowSession';
import type { LightweightChartsV5ProductionCandlestickSeriesLifecycle, LightweightChartsV5ProductionDrawingBindingLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';

export interface AnalysisDrawingToolsSelection {
  readonly venue: string;
  readonly symbol: string;
  readonly interval: string;
  readonly revision: number;
}

export interface AnalysisDrawingToolsBinding {
  readonly state: ChartDrawingInteractionState | null;
  readonly drawingCount: number;
  /** How many of the drawings are zones. */
  readonly zoneCount: number;
  /** The kind of the drawing a committed, selected, editing or deleting state names; otherwise null. */
  readonly selectedKind: ChartDrawingKind | null;
  /** The Gate474 seam lifecycle the two canvas factories carry; inert without a selection. */
  readonly lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle;
  /** The session's committed drawings (P18 collection truth), empty without a selection. */
  getDrawings(): readonly ChartDrawing[];
  readonly liveSessionFactory: ReturnType<typeof createAnalysisDrawingToolsLiveSessionFactory>;
  readonly overlaySessionFactory: ReturnType<typeof createAnalysisDrawingToolsOverlaySessionFactory>;
  selectTrendLineTool(): void;
  selectZoneTool(): void;
  cancel(): void;
  deleteSelected(): void;
  /** Loads drawings into the current session (for example a Saved Analysis); no-op without a selection. */
  loadDrawings(drawings: readonly ChartDrawing[]): void;
}

const inertLifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle = Object.freeze({ attach() { /* no selection */ }, detach() { /* no selection */ } });

/** The released theme hook is called unconditionally; outside a ThemeProvider (test fixtures) the registered default theme styles drawings. */
export function useThemeIdOrDefault(): ThemeId {
  try {
    return useTheme().themeId;
  } catch {
    return defaultThemeId;
  }
}

/**
 * One drawing-tools session per exact Analysis selection. The stroke colour is
 * resolved from the theme active when the selection starts; the session and its
 * committed drawings are released when the selection changes or the workspace
 * leaves. Nothing here reads history, market or journal truth.
 */
export function useAnalysisDrawingTools(selection: AnalysisDrawingToolsSelection | null, seriesLifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle, extraDrawingLifecycle?: LightweightChartsV5ProductionDrawingBindingLifecycle): AnalysisDrawingToolsBinding {
  const themeId = useThemeIdOrDefault();
  const key = selection === null ? null : [selection.venue, selection.symbol, selection.interval, String(selection.revision)].join('|');
  const [state, setState] = useState<ChartDrawingInteractionState | null>(null);
  const [drawingCount, setDrawingCount] = useState(0);
  const [zoneCount, setZoneCount] = useState(0);
  const latestTheme = useRef(themeId);
  latestTheme.current = themeId;
  const session = useMemo<AnalysisDrawingToolsRendererSession | null>(() => {
    if (key === null) return null;
    // The theme active at selection start styles this session; a new selection resolves the theme again.
    return createAnalysisDrawingToolsSession(latestTheme.current, {
      onStateChange: next => setState(next),
      onDrawingsChange: drawings => { setDrawingCount(drawings.length); setZoneCount(drawings.filter(drawing => drawing.kind === 'zone').length); },
    });
  }, [key]);
  useEffect(() => {
    if (session === null) { setState(null); setDrawingCount(0); setZoneCount(0); return; }
    setState(session.getState());
    setDrawingCount(session.getDrawings().length); setZoneCount(session.getDrawings().filter(drawing => drawing.kind === 'zone').length);
    return () => { session.destroy(); };
  }, [session]);
  // The seam attaches from inside the renderer; the hook mirrors the bound/unbound state into React right there.
  useEffect(() => {
    // The released reducer only selects from idle: once the P18.35 commit is acknowledged, return the session to idle so the next chart click can select the placed line.
    if (session === null || state?.status !== 'committed') return;
    session.cancel();
    setState(session.getState());
  }, [session, state]);
  const ownLifecycle = useMemo<LightweightChartsV5ProductionDrawingBindingLifecycle>(() => session === null ? inertLifecycle : {
    attach(binding, handle) { session.lifecycle.attach(binding, handle); setState(session.getState()); setDrawingCount(session.getDrawings().length); setZoneCount(session.getDrawings().filter(drawing => drawing.kind === 'zone').length); },
    detach(handle) { session.lifecycle.detach(handle); setState(session.getState()); },
  }, [session]);
  // Another owner (the time-assisted window) may share the same seam; it sees the same binding and handle.
  const lifecycle = useMemo(() => (extraDrawingLifecycle === undefined ? ownLifecycle : composeDrawingBindingLifecycles(ownLifecycle, extraDrawingLifecycle)), [ownLifecycle, extraDrawingLifecycle]);
  const liveSessionFactory = useMemo(() => createAnalysisDrawingToolsLiveSessionFactory(lifecycle, seriesLifecycle), [lifecycle, seriesLifecycle]);
  const overlaySessionFactory = useMemo(() => createAnalysisDrawingToolsOverlaySessionFactory(lifecycle, seriesLifecycle), [lifecycle, seriesLifecycle]);
  const namedId = state !== null && 'drawingId' in state ? state.drawingId : null;
  const selectedKind = namedId === null || session === null ? null : session.getDrawings().find(drawing => drawing.id === namedId)?.kind ?? null;
  return {
    state,
    drawingCount,
    zoneCount,
    selectedKind,
    lifecycle,
    getDrawings() { return session === null ? [] : session.getDrawings(); },
    liveSessionFactory,
    overlaySessionFactory,
    selectTrendLineTool() { if (session) { session.selectTrendLineTool(); setState(session.getState()); } },
    selectZoneTool() { if (session) { session.selectZoneTool(); setState(session.getState()); } },
    cancel() { if (session) { session.cancel(); setState(session.getState()); } },
    deleteSelected() { if (session) { session.deleteSelected(); setState(session.getState()); } },
    loadDrawings(drawings) { if (session) { session.loadDrawings(drawings); setState(session.getState()); setDrawingCount(session.getDrawings().length); setZoneCount(session.getDrawings().filter(drawing => drawing.kind === 'zone').length); } },
  };
}
