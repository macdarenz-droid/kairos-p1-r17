import type { IPrimitivePaneRenderer } from 'lightweight-charts';
import type {
  LightweightChartsV5PriceCoordinateApi,
  LightweightChartsV5TimeCoordinateApi,
} from '../features/chart/lightweightChartsV5TrendLineCoordinateProjection';
import {
  projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer,
  type AnalysisSavedTradeRiskRewardCanvasPaneProjection,
  type AnalysisSavedTradeRiskRewardCanvasStyleSource,
} from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  projectAnalysisSavedTradeRiskRewardCoordinates,
} from './analysisSavedTradeRiskRewardCoordinateProjection';
import type {
  AnalysisSavedTradeRiskRewardRendererProjection,
} from './analysisSavedTradeRiskRewardRendererProjection';

export interface AnalysisSavedTradeRiskRewardPrimitiveChartApi {
  timeScale(): LightweightChartsV5TimeCoordinateApi;
}

export interface AnalysisSavedTradeRiskRewardPrimitiveAttachedParameter {
  readonly chart: AnalysisSavedTradeRiskRewardPrimitiveChartApi;
  readonly series: LightweightChartsV5PriceCoordinateApi;
  readonly requestUpdate: () => void;
}

export interface AnalysisSavedTradeRiskRewardPrimitivePaneView {
  renderer(): IPrimitivePaneRenderer;
}

export interface AnalysisSavedTradeRiskRewardLightweightChartsV5Primitive {
  attached(parameter: AnalysisSavedTradeRiskRewardPrimitiveAttachedParameter): void;
  detached(): void;
  updateAllViews(): void;
  paneViews(): readonly AnalysisSavedTradeRiskRewardPrimitivePaneView[];
  currentCanvasProjection(): AnalysisSavedTradeRiskRewardCanvasPaneProjection | null;
}

export type AnalysisSavedTradeRiskRewardPrimitiveProjection =
  | Extract<AnalysisSavedTradeRiskRewardRendererProjection, { readonly kind: 'unavailable' }>
  | {
      readonly kind: 'primitive-ready';
      readonly rendererProjection: Extract<
        AnalysisSavedTradeRiskRewardRendererProjection,
        { readonly kind: 'renderer-ready' }
      >;
      readonly primitive: AnalysisSavedTradeRiskRewardLightweightChartsV5Primitive;
    };

const EMPTY_PANE_RENDERER: IPrimitivePaneRenderer = Object.freeze({
  draw(): void {},
});

/**
 * Creates one provider primitive from Gate449 renderer evidence. Gate450 remains
 * the only scale-to-coordinate owner and Gate451 remains the only Canvas owner.
 * Series attachment/detachment is deliberately left to a later binding.
 */
export function createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
  projection: AnalysisSavedTradeRiskRewardRendererProjection,
  styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
): AnalysisSavedTradeRiskRewardPrimitiveProjection {
  if (projection.kind !== 'renderer-ready') {
    return projection;
  }

  let attached: AnalysisSavedTradeRiskRewardPrimitiveAttachedParameter | null = null;
  let canvasProjection: AnalysisSavedTradeRiskRewardCanvasPaneProjection | null = null;
  let paneRenderer: IPrimitivePaneRenderer | null = null;

  const paneView: AnalysisSavedTradeRiskRewardPrimitivePaneView = Object.freeze({
    renderer(): IPrimitivePaneRenderer {
      return paneRenderer ?? EMPTY_PANE_RENDERER;
    },
  });
  const paneViews = Object.freeze([paneView] as const);
  const noPaneViews = Object.freeze([] as const);

  const clearPresentation = (): void => {
    canvasProjection = null;
    paneRenderer = null;
  };

  const primitive: AnalysisSavedTradeRiskRewardLightweightChartsV5Primitive = Object.freeze({
    attached(parameter: AnalysisSavedTradeRiskRewardPrimitiveAttachedParameter): void {
      attached = parameter;
      clearPresentation();
    },

    detached(): void {
      attached = null;
      clearPresentation();
    },

    updateAllViews(): void {
      if (attached === null) {
        clearPresentation();
        return;
      }

      const coordinates = projectAnalysisSavedTradeRiskRewardCoordinates(
        projection,
        attached.chart.timeScale(),
        attached.series,
      );
      canvasProjection = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
        coordinates,
        styleSource,
      );
      paneRenderer = canvasProjection.kind === 'pane-ready'
        ? canvasProjection.paneRenderer
        : null;
    },

    paneViews(): readonly AnalysisSavedTradeRiskRewardPrimitivePaneView[] {
      return paneRenderer === null ? noPaneViews : paneViews;
    },

    currentCanvasProjection(): AnalysisSavedTradeRiskRewardCanvasPaneProjection | null {
      return canvasProjection;
    },
  });

  return Object.freeze({
    kind: 'primitive-ready' as const,
    rendererProjection: projection,
    primitive,
  });
}
