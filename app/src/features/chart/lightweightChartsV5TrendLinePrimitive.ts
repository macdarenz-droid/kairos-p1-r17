import type { RendererChartDrawing } from './chartDrawingProjection';
import {
  projectLightweightChartsV5TrendLineSegments,
  type LightweightChartsV5PriceCoordinateApi,
  type LightweightChartsV5TimeCoordinateApi,
  type LightweightChartsV5TrendLineScreenSegment,
} from './lightweightChartsV5TrendLineCoordinateProjection';
import {
  hitTestLightweightChartsV5TrendLineSegments,
} from './lightweightChartsV5TrendLineHitTest';
import {
  createLightweightChartsV5TrendLinePaneRenderer,
  type LightweightChartsV5TrendLineStrokeStyle,
} from './lightweightChartsV5TrendLinePaneRenderer';

export interface LightweightChartsV5TrendLinePrimitiveChartApi {
  timeScale(): LightweightChartsV5TimeCoordinateApi;
}

export interface LightweightChartsV5TrendLinePrimitiveAttachedParameter {
  readonly chart: LightweightChartsV5TrendLinePrimitiveChartApi;
  readonly series: LightweightChartsV5PriceCoordinateApi;
  readonly requestUpdate: () => void;
}

export interface LightweightChartsV5TrendLinePrimitivePaneView {
  renderer(): ReturnType<typeof createLightweightChartsV5TrendLinePaneRenderer>;
}

export interface LightweightChartsV5TrendLinePrimitiveHoveredItem {
  readonly externalId: string;
  readonly zOrder: 'normal';
  readonly cursorStyle: 'pointer';
  /** 1 for a line (a stroke), 0 for a zone or risk box (a covered region), as lightweight-charts ranks hits. */
  readonly hitTestPriority: 0 | 1;
  readonly itemType: 'primitive';
}

export interface LightweightChartsV5TrendLinePrimitive {
  attached(parameter: LightweightChartsV5TrendLinePrimitiveAttachedParameter): void;
  detached(): void;
  updateAllViews(): void;
  paneViews(): readonly LightweightChartsV5TrendLinePrimitivePaneView[];
  hitTest(x: number, y: number): LightweightChartsV5TrendLinePrimitiveHoveredItem | null;
}

const MINIMUM_TREND_LINE_HIT_TOLERANCE_PX = 4;

/**
 * P18.13 provider primitive hit-test binding invariant:
 * - P18.2 renderer-safe drawings remain the immutable drawing input
 * - P18.5 remains the sole time/price-to-screen projection owner
 * - P18.6 remains the sole Canvas pane-rendering owner
 * - P18.12 remains the sole point-to-segment hit-test geometry owner
 * - updateAllViews() refreshes one shared projected-segment snapshot for renderer and hit testing
 * - hitTest() only adapts a P18.12 hit to Lightweight Charts v5 PrimitiveHoveredItem shape
 * - detached() clears both renderer and hit-test presentation geometry
 * - no pointer subscription, selection, drag/edit, drawing truth mutation, persistence, autoscale,
 *   calculation, market acquisition, journal truth, toolbar state, or P19 behavior is owned here
 */
export function createLightweightChartsV5TrendLinePrimitive(
  drawings: readonly RendererChartDrawing[],
  style: LightweightChartsV5TrendLineStrokeStyle,
): LightweightChartsV5TrendLinePrimitive {
  const drawingSnapshot: RendererChartDrawing[] = drawings.map((drawing) => ({
    ...drawing,
    start: { ...drawing.start },
    end: { ...drawing.end },
  }));

  let attached: LightweightChartsV5TrendLinePrimitiveAttachedParameter | null = null;
  let segments: readonly LightweightChartsV5TrendLineScreenSegment[] = [];
  let renderer = createLightweightChartsV5TrendLinePaneRenderer(segments, style);

  const paneView: LightweightChartsV5TrendLinePrimitivePaneView = {
    renderer: () => renderer,
  };
  const paneViews = [paneView] as const;

  const clearPresentationGeometry = (): void => {
    segments = [];
    renderer = createLightweightChartsV5TrendLinePaneRenderer(segments, style);
  };

  return {
    attached(parameter): void {
      attached = parameter;
    },

    detached(): void {
      attached = null;
      clearPresentationGeometry();
    },

    updateAllViews(): void {
      if (attached === null) {
        clearPresentationGeometry();
        return;
      }

      segments = projectLightweightChartsV5TrendLineSegments(
        drawingSnapshot,
        attached.chart.timeScale(),
        attached.series,
      );
      renderer = createLightweightChartsV5TrendLinePaneRenderer(segments, style);
    },

    paneViews(): readonly LightweightChartsV5TrendLinePrimitivePaneView[] {
      return paneViews;
    },

    hitTest(x: number, y: number): LightweightChartsV5TrendLinePrimitiveHoveredItem | null {
      const hit = hitTestLightweightChartsV5TrendLineSegments(
        segments,
        x,
        y,
        Math.max(MINIMUM_TREND_LINE_HIT_TOLERANCE_PX, style.lineWidth),
      );
      if (hit === null) {
        return null;
      }
      return {
        externalId: hit.id,
        zOrder: 'normal',
        cursorStyle: hit.cursorStyle,
        hitTestPriority: hit.kind === 'trend-line' ? 1 : 0,
        itemType: 'primitive',
      };
    },
  };
}
