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
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding,
  type AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding,
  type AnalysisSavedTradeRiskRewardPrimitiveSeries,
  type AnalysisSavedTradeRiskRewardSeriesBindingPresentation,
} from './analysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from './analysisSavedTradeRiskRewardRendererProjection';

export type AnalysisSavedTradeOverlayMarkerPresentation =
  | { readonly kind: 'pending-series' }
  | AnalysisSavedTradeMarkerPresentation;

export type AnalysisSavedTradeOverlayRiskRewardPresentation =
  | { readonly kind: 'pending-series' }
  | AnalysisSavedTradeRiskRewardSeriesBindingPresentation;

export interface AnalysisSavedTradeOverlayRendererPresentation {
  readonly markers: AnalysisSavedTradeOverlayMarkerPresentation | null;
  readonly riskReward: AnalysisSavedTradeOverlayRiskRewardPresentation | null;
}

export interface AnalysisSavedTradeOverlayRendererSession {
  readonly rendererFactory: AnalysisCandleRendererFactory;
  presentMarkers(
    projection: AnalysisSavedTradeExecutionMarkerProjection,
    theme: ChartTheme,
  ): AnalysisSavedTradeOverlayMarkerPresentation;
  presentRiskReward(
    projection: AnalysisSavedTradeRiskRewardRendererProjection,
    styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
  ): AnalysisSavedTradeOverlayRiskRewardPresentation;
  presentation(): AnalysisSavedTradeOverlayRendererPresentation;
  close(): void;
}

export interface AnalysisSavedTradeOverlayRendererSessionDependencies {
  readonly createRendererFactory?: (
    lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle,
  ) => AnalysisCandleRendererFactory;
  readonly createMarkerBinding?: (
    series: AnalysisSavedTradeMarkerSeries,
  ) => AnalysisSavedTradeLightweightChartsV5MarkerBinding;
  readonly createRiskRewardBinding?: (
    series: AnalysisSavedTradeRiskRewardPrimitiveSeries,
  ) => AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding;
}

/**
 * Owns one shared P17 candlestick-series lifecycle for the already-released
 * execution-marker and Risk/Reward bindings. Each lower owner still controls
 * only its own provider plugin/primitive; this session adds no projection,
 * financial meaning, acquisition, persistence or UI responsibility.
 */
export function createAnalysisSavedTradeOverlayRendererSession(
  dependencies: AnalysisSavedTradeOverlayRendererSessionDependencies = {},
): AnalysisSavedTradeOverlayRendererSession {
  const createRendererFactory = dependencies.createRendererFactory
    ?? createLightweightChartsV5ProductionRendererFactory;
  const createMarkerBinding = dependencies.createMarkerBinding
    ?? createAnalysisSavedTradeLightweightChartsV5MarkerBinding;
  const createRiskRewardBinding = dependencies.createRiskRewardBinding
    ?? createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding;
  let activeSeries: LightweightChartsV5SeriesApi<unknown> | null = null;
  let markerBinding: AnalysisSavedTradeLightweightChartsV5MarkerBinding | null = null;
  let riskRewardBinding: AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding | null = null;
  let latestMarkers: Readonly<{
    projection: AnalysisSavedTradeExecutionMarkerProjection;
    theme: ChartTheme;
  }> | null = null;
  let latestRiskReward: Readonly<{
    projection: AnalysisSavedTradeRiskRewardRendererProjection;
    styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
  }> | null = null;
  let markers: AnalysisSavedTradeOverlayMarkerPresentation | null = null;
  let riskReward: AnalysisSavedTradeOverlayRiskRewardPresentation | null = null;
  let closed = false;

  const snapshot = (): AnalysisSavedTradeOverlayRendererPresentation => Object.freeze({
    markers,
    riskReward,
  });

  const detachActive = (): void => {
    const previousRiskReward = riskRewardBinding;
    const previousMarkers = markerBinding;
    riskRewardBinding = null;
    markerBinding = null;
    activeSeries = null;
    previousRiskReward?.close();
    previousMarkers?.close();
  };

  const lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle = {
    attach(series) {
      if (closed) throw new Error('analysis-saved-trade-overlay-renderer-session-closed');
      if (activeSeries !== null) throw new Error('analysis-saved-trade-overlay-renderer-series-already-active');

      const nextMarkers = createMarkerBinding(series as AnalysisSavedTradeMarkerSeries);
      let nextRiskReward: AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding;
      try {
        nextRiskReward = createRiskRewardBinding(series as unknown as AnalysisSavedTradeRiskRewardPrimitiveSeries);
      } catch (error) {
        nextMarkers.close();
        throw error;
      }

      activeSeries = series;
      markerBinding = nextMarkers;
      riskRewardBinding = nextRiskReward;
      try {
        if (latestMarkers !== null) {
          markers = nextMarkers.present(latestMarkers.projection, latestMarkers.theme);
        }
        if (latestRiskReward !== null) {
          riskReward = nextRiskReward.present(
            latestRiskReward.projection,
            latestRiskReward.styleSource,
          );
        }
      } catch (error) {
        detachActive();
        throw error;
      }
    },
    detach(series) {
      if (activeSeries === null) return;
      if (activeSeries !== series) throw new Error('analysis-saved-trade-overlay-renderer-series-mismatch');
      detachActive();
      if (!closed && latestMarkers !== null) markers = Object.freeze({ kind: 'pending-series' as const });
      if (!closed && latestRiskReward !== null) {
        riskReward = latestRiskReward.projection.kind === 'unavailable'
          ? latestRiskReward.projection
          : Object.freeze({ kind: 'pending-series' as const });
      }
    },
  };

  const rendererFactory = createRendererFactory(lifecycle);

  return Object.freeze({
    rendererFactory,
    presentMarkers(
      projection: AnalysisSavedTradeExecutionMarkerProjection,
      theme: ChartTheme,
    ): AnalysisSavedTradeOverlayMarkerPresentation {
      if (closed) throw new Error('analysis-saved-trade-overlay-renderer-session-closed');
      latestMarkers = Object.freeze({ projection, theme });
      markers = markerBinding === null
        ? Object.freeze({ kind: 'pending-series' as const })
        : markerBinding.present(projection, theme);
      return markers;
    },
    presentRiskReward(
      projection: AnalysisSavedTradeRiskRewardRendererProjection,
      styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
    ): AnalysisSavedTradeOverlayRiskRewardPresentation {
      if (closed) throw new Error('analysis-saved-trade-overlay-renderer-session-closed');
      latestRiskReward = Object.freeze({ projection, styleSource });
      let next: AnalysisSavedTradeOverlayRiskRewardPresentation;
      if (riskRewardBinding !== null) {
        next = riskRewardBinding.present(projection, styleSource);
      } else if (projection.kind === 'unavailable') {
        next = projection;
      } else {
        next = Object.freeze({ kind: 'pending-series' as const });
      }
      riskReward = next;
      return next;
    },
    presentation: snapshot,
    close() {
      if (closed) return;
      closed = true;
      latestMarkers = null;
      latestRiskReward = null;
      markers = null;
      riskReward = null;
      detachActive();
    },
  });
}
