import type {
  LightweightChartsV5SeriesPrimitiveApi,
} from '../features/chart/lightweightChartsV5DrawingLayerDriver';
import {
  createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive,
  type AnalysisSavedTradeRiskRewardLightweightChartsV5Primitive,
  type AnalysisSavedTradeRiskRewardPrimitiveProjection,
} from './analysisSavedTradeRiskRewardLightweightChartsV5Primitive';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from './analysisSavedTradeRiskRewardRendererProjection';

export type AnalysisSavedTradeRiskRewardPrimitiveSeries =
  LightweightChartsV5SeriesPrimitiveApi<AnalysisSavedTradeRiskRewardLightweightChartsV5Primitive>;

export type AnalysisSavedTradeRiskRewardPrimitiveFactory = (
  projection: AnalysisSavedTradeRiskRewardRendererProjection,
  styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
) => AnalysisSavedTradeRiskRewardPrimitiveProjection;

export type AnalysisSavedTradeRiskRewardSeriesBindingPresentation =
  | Extract<AnalysisSavedTradeRiskRewardRendererProjection, { readonly kind: 'unavailable' }>
  | {
      readonly kind: 'bound';
      readonly rendererProjection: Extract<
        AnalysisSavedTradeRiskRewardRendererProjection,
        { readonly kind: 'renderer-ready' }
      >;
      readonly primitiveProjection: Extract<
        AnalysisSavedTradeRiskRewardPrimitiveProjection,
        { readonly kind: 'primitive-ready' }
      >;
    };

export interface AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding {
  present(
    projection: AnalysisSavedTradeRiskRewardRendererProjection,
    styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
  ): AnalysisSavedTradeRiskRewardSeriesBindingPresentation;
  presentation(): AnalysisSavedTradeRiskRewardSeriesBindingPresentation | null;
  close(): void;
}

/**
 * Owns only the attach/detach lifecycle for Gate452's provider primitive on one
 * caller-owned Lightweight Charts v5 series. Gate452 remains the primitive,
 * scale, pane-view and Canvas composition owner.
 */
export function createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(
  series: AnalysisSavedTradeRiskRewardPrimitiveSeries,
  createPrimitive: AnalysisSavedTradeRiskRewardPrimitiveFactory =
    createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive,
): AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding {
  let activePrimitive: AnalysisSavedTradeRiskRewardLightweightChartsV5Primitive | null = null;
  let currentPresentation: AnalysisSavedTradeRiskRewardSeriesBindingPresentation | null = null;
  let closed = false;

  const detachActive = (): void => {
    const previous = activePrimitive;
    activePrimitive = null;
    if (previous !== null) series.detachPrimitive(previous);
  };

  return Object.freeze({
    present(
      projection: AnalysisSavedTradeRiskRewardRendererProjection,
      styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
    ): AnalysisSavedTradeRiskRewardSeriesBindingPresentation {
      if (closed) throw new Error('analysis-saved-trade-risk-reward-series-binding-closed');

      detachActive();
      if (projection.kind === 'unavailable') {
        currentPresentation = projection;
        return projection;
      }

      const primitiveProjection = createPrimitive(projection, styleSource);
      if (
        primitiveProjection.kind !== 'primitive-ready'
        || primitiveProjection.rendererProjection !== projection
      ) {
        throw new Error('analysis-saved-trade-risk-reward-primitive-evidence-invalid');
      }

      series.attachPrimitive(primitiveProjection.primitive);
      activePrimitive = primitiveProjection.primitive;
      currentPresentation = Object.freeze({
        kind: 'bound' as const,
        rendererProjection: projection,
        primitiveProjection,
      });
      return currentPresentation;
    },
    presentation() {
      return currentPresentation;
    },
    close() {
      if (closed) return;
      closed = true;
      currentPresentation = null;
      detachActive();
    },
  });
}
