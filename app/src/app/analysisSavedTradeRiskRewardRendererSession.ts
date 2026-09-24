import {
  createLightweightChartsV5ProductionRendererFactory,
  type LightweightChartsV5ProductionCandlestickSeriesLifecycle,
} from '../features/chart/lightweightChartsV5ProductionRenderer';
import type { LightweightChartsV5SeriesApi } from '../features/chart/lightweightChartsV5ModuleAdapter';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding,
  type AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding,
  type AnalysisSavedTradeRiskRewardPrimitiveSeries,
  type AnalysisSavedTradeRiskRewardSeriesBindingPresentation,
} from './analysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from './analysisSavedTradeRiskRewardRendererProjection';

export type AnalysisSavedTradeRiskRewardRendererSessionPresentation =
  | Extract<AnalysisSavedTradeRiskRewardRendererProjection, { readonly kind: 'unavailable' }>
  | { readonly kind: 'pending-series' }
  | AnalysisSavedTradeRiskRewardSeriesBindingPresentation;

export interface AnalysisSavedTradeRiskRewardRendererSession {
  readonly rendererFactory: AnalysisCandleRendererFactory;
  present(
    projection: AnalysisSavedTradeRiskRewardRendererProjection,
    styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
  ): AnalysisSavedTradeRiskRewardRendererSessionPresentation;
  presentation(): AnalysisSavedTradeRiskRewardRendererSessionPresentation | null;
  close(): void;
}

export interface AnalysisSavedTradeRiskRewardRendererSessionDependencies {
  readonly createRendererFactory?: (
    lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle,
  ) => AnalysisCandleRendererFactory;
  readonly createRiskRewardBinding?: (
    series: AnalysisSavedTradeRiskRewardPrimitiveSeries,
  ) => AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding;
}

/**
 * Composes Gate453's single-series Risk/Reward primitive binding with the exact
 * active candlestick series created by the released P17 production renderer.
 * It retains only the caller's latest exact renderer projection and style input
 * so a renderer-owned series replacement can rebind without changing facts.
 */
export function createAnalysisSavedTradeRiskRewardRendererSession(
  dependencies: AnalysisSavedTradeRiskRewardRendererSessionDependencies = {},
): AnalysisSavedTradeRiskRewardRendererSession {
  const createRendererFactory = dependencies.createRendererFactory
    ?? createLightweightChartsV5ProductionRendererFactory;
  const createRiskRewardBinding = dependencies.createRiskRewardBinding
    ?? createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding;
  let activeSeries: LightweightChartsV5SeriesApi<unknown> | null = null;
  let binding: AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding | null = null;
  let latest: {
    readonly projection: AnalysisSavedTradeRiskRewardRendererProjection;
    readonly styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
  } | null = null;
  let currentPresentation: AnalysisSavedTradeRiskRewardRendererSessionPresentation | null = null;
  let closed = false;

  const detachActive = (): void => {
    const previous = binding;
    binding = null;
    activeSeries = null;
    previous?.close();
  };

  const lifecycle: LightweightChartsV5ProductionCandlestickSeriesLifecycle = {
    attach(series) {
      if (closed) throw new Error('analysis-saved-trade-risk-reward-renderer-session-closed');
      if (activeSeries !== null) {
        throw new Error('analysis-saved-trade-risk-reward-renderer-series-already-active');
      }

      const next = createRiskRewardBinding(
        series as unknown as AnalysisSavedTradeRiskRewardPrimitiveSeries,
      );
      activeSeries = series;
      binding = next;
      try {
        if (latest !== null) {
          currentPresentation = next.present(latest.projection, latest.styleSource);
        }
      } catch (error) {
        detachActive();
        throw error;
      }
    },
    detach(series) {
      if (activeSeries === null) return;
      if (activeSeries !== series) {
        throw new Error('analysis-saved-trade-risk-reward-renderer-series-mismatch');
      }
      detachActive();
      if (!closed && latest !== null) {
        currentPresentation = latest.projection.kind === 'unavailable'
          ? latest.projection
          : Object.freeze({ kind: 'pending-series' as const });
      }
    },
  };

  const rendererFactory = createRendererFactory(lifecycle);

  return Object.freeze({
    rendererFactory,
    present(
      projection: AnalysisSavedTradeRiskRewardRendererProjection,
      styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
    ): AnalysisSavedTradeRiskRewardRendererSessionPresentation {
      if (closed) throw new Error('analysis-saved-trade-risk-reward-renderer-session-closed');
      latest = Object.freeze({ projection, styleSource });
      let nextPresentation: AnalysisSavedTradeRiskRewardRendererSessionPresentation;
      if (binding !== null) {
        nextPresentation = binding.present(projection, styleSource);
      } else if (projection.kind === 'unavailable') {
        nextPresentation = projection;
      } else {
        nextPresentation = Object.freeze({ kind: 'pending-series' as const });
      }
      currentPresentation = nextPresentation;
      return nextPresentation;
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
  });
}
