import type { TimeAssistedTradeSnapshot } from '../application/market-reference';
import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import type { LightweightChartsV5SeriesApi } from '../features/chart/lightweightChartsV5ModuleAdapter';
import type { LightweightChartsV5ProductionCandlestickSeriesLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';
import { createAnalysisTimeAssistedMarkerBinding, type AnalysisTimeAssistedMarkerBinding, type AnalysisTimeAssistedMarkerPresentation, type AnalysisTimeAssistedMarkerSeries } from './analysisTimeAssistedMarkerBinding';

export type AnalysisTimeAssistedMarkerSessionPresentation = { readonly kind: 'pending-series' } | AnalysisTimeAssistedMarkerPresentation;

export interface AnalysisTimeAssistedMarkerSession {
  /** Hand this to the production renderer factory's candlestick series lifecycle (directly or fanned out with another). */
  readonly lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle;
  present(snapshot: TimeAssistedTradeSnapshot | null, theme: ChartTheme): AnalysisTimeAssistedMarkerSessionPresentation;
  presentation(): AnalysisTimeAssistedMarkerSessionPresentation | null;
  close(): void;
}

/** Fans one candlestick series lifecycle out to several owners (saved-trade markers and time-assisted markers share one production renderer). */
export function composeCandlestickSeriesLifecycles(...lifecycles: readonly LightweightChartsV5ProductionCandlestickSeriesLifecycle[]): LightweightChartsV5ProductionCandlestickSeriesLifecycle {
  return Object.freeze({
    attach(series: LightweightChartsV5SeriesApi<unknown>) { for (const lifecycle of lifecycles) lifecycle.attach(series); },
    detach(series: LightweightChartsV5SeriesApi<unknown>) { for (const lifecycle of [...lifecycles].reverse()) lifecycle.detach(series); },
  });
}

/**
 * Keeps the latest time-assisted snapshot and re-presents it on whichever
 * candlestick series is attached; mirrors the released saved-trade marker
 * session and owns no estimate, chart or journal truth.
 */
export function createAnalysisTimeAssistedMarkerSession(createBinding: (series: AnalysisTimeAssistedMarkerSeries) => AnalysisTimeAssistedMarkerBinding = createAnalysisTimeAssistedMarkerBinding): AnalysisTimeAssistedMarkerSession {
  let activeSeries: LightweightChartsV5SeriesApi<unknown> | null = null;
  let binding: AnalysisTimeAssistedMarkerBinding | null = null;
  let latest: { readonly snapshot: TimeAssistedTradeSnapshot | null; readonly theme: ChartTheme } | null = null;
  let current: AnalysisTimeAssistedMarkerSessionPresentation | null = null;
  let closed = false;
  const detachActive = (): void => { const previous = binding; binding = null; activeSeries = null; previous?.close(); };
  const lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle = {
    attach(series) {
      if (closed) throw new Error('analysis-time-assisted-marker-session-closed');
      if (activeSeries !== null) throw new Error('analysis-time-assisted-marker-series-already-active');
      const next = createBinding(series as AnalysisTimeAssistedMarkerSeries);
      activeSeries = series; binding = next;
      try { if (latest !== null) current = next.present(latest.snapshot, latest.theme); } catch (error) { detachActive(); throw error; }
    },
    detach(series) {
      if (activeSeries === null) return;
      if (activeSeries !== series) throw new Error('analysis-time-assisted-marker-series-mismatch');
      detachActive();
      if (!closed && latest !== null) current = Object.freeze({ kind: 'pending-series' as const });
    },
  };
  return {
    lifecycle,
    present(snapshot, theme) {
      if (closed) throw new Error('analysis-time-assisted-marker-session-closed');
      latest = Object.freeze({ snapshot, theme });
      current = binding === null ? Object.freeze({ kind: 'pending-series' as const }) : binding.present(snapshot, theme);
      return current;
    },
    presentation() { return current; },
    close() { if (closed) return; closed = true; latest = null; current = null; detachActive(); },
  };
}
