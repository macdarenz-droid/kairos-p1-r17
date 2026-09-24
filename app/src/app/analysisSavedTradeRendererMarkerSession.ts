import type { ChartTheme } from '../design-system/themes/chartThemeAdapter';
import {
  createLightweightChartsV5ProductionRendererFactory,
  type LightweightChartsV5ProductionCandlestickSeriesLifecycle,
} from '../features/chart/lightweightChartsV5ProductionRenderer';
import type { LightweightChartsV5SeriesApi } from '../features/chart/lightweightChartsV5ModuleAdapter';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import type { AnalysisSavedTradeExecutionMarkerProjection } from './analysisSavedTradeExecutionMarkerProjection';
import {
  createAnalysisSavedTradeLightweightChartsV5MarkerBinding,
  type AnalysisSavedTradeLightweightChartsV5MarkerBinding,
  type AnalysisSavedTradeMarkerPresentation,
  type AnalysisSavedTradeMarkerSeries,
} from './analysisSavedTradeLightweightChartsV5MarkerBinding';

export type AnalysisSavedTradeRendererMarkerSessionPresentation =
  | { readonly kind: 'pending-series' }
  | AnalysisSavedTradeMarkerPresentation;

export interface AnalysisSavedTradeRendererMarkerSession {
  readonly rendererFactory: AnalysisCandleRendererFactory;
  present(
    projection: AnalysisSavedTradeExecutionMarkerProjection,
    theme: ChartTheme,
  ): AnalysisSavedTradeRendererMarkerSessionPresentation;
  presentation(): AnalysisSavedTradeRendererMarkerSessionPresentation | null;
  close(): void;
}

export interface AnalysisSavedTradeRendererMarkerSessionDependencies {
  readonly createRendererFactory?: (
    lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle,
  ) => AnalysisCandleRendererFactory;
  readonly createMarkerBinding?: (
    series: AnalysisSavedTradeMarkerSeries,
  ) => AnalysisSavedTradeLightweightChartsV5MarkerBinding;
}

/**
 * Composes Gate441's single provider marker binding with the exact active
 * candlestick series created by the released P17 production renderer. The
 * session retains only the latest caller projection/theme so renderer series
 * replacement can rebind without changing saved facts or requesting history.
 */
export function createAnalysisSavedTradeRendererMarkerSession(
  dependencies: AnalysisSavedTradeRendererMarkerSessionDependencies = {},
): AnalysisSavedTradeRendererMarkerSession {
  const createRendererFactory = dependencies.createRendererFactory
    ?? createLightweightChartsV5ProductionRendererFactory;
  const createMarkerBinding = dependencies.createMarkerBinding
    ?? createAnalysisSavedTradeLightweightChartsV5MarkerBinding;
  let activeSeries: LightweightChartsV5SeriesApi<unknown> | null = null;
  let binding: AnalysisSavedTradeLightweightChartsV5MarkerBinding | null = null;
  let latest: {
    readonly projection: AnalysisSavedTradeExecutionMarkerProjection;
    readonly theme: ChartTheme;
  } | null = null;
  let currentPresentation: AnalysisSavedTradeRendererMarkerSessionPresentation | null = null;
  let closed = false;

  const detachActive = (): void => {
    const previous = binding;
    binding = null;
    activeSeries = null;
    previous?.close();
  };

  const lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle = {
    attach(series) {
      if (closed) throw new Error('analysis-saved-trade-renderer-marker-session-closed');
      if (activeSeries !== null) {
        throw new Error('analysis-saved-trade-renderer-marker-series-already-active');
      }

      const next = createMarkerBinding(series as AnalysisSavedTradeMarkerSeries);
      activeSeries = series;
      binding = next;
      try {
        if (latest !== null) {
          currentPresentation = next.present(latest.projection, latest.theme);
        }
      } catch (error) {
        detachActive();
        throw error;
      }
    },
    detach(series) {
      if (activeSeries === null) return;
      if (activeSeries !== series) {
        throw new Error('analysis-saved-trade-renderer-marker-series-mismatch');
      }
      detachActive();
      if (!closed && latest !== null) currentPresentation = Object.freeze({ kind: 'pending-series' });
    },
  };

  const rendererFactory = createRendererFactory(lifecycle);

  return {
    rendererFactory,
    present(projection, theme) {
      if (closed) throw new Error('analysis-saved-trade-renderer-marker-session-closed');
      latest = Object.freeze({ projection, theme });
      if (binding === null) {
        currentPresentation = Object.freeze({ kind: 'pending-series' });
      } else {
        currentPresentation = binding.present(projection, theme);
      }
      return currentPresentation;
    },
    presentation() {
      return currentPresentation;
    },
    close() {
      if (closed) return;
      closed = true;
      latest = null;
      currentPresentation = null;
      detachActive();
    },
  };
}
