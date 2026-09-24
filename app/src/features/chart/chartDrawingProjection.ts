import type { ChartDrawing, ChartDrawingAnchor } from './chartDrawingContract';
import { projectChartPricePoint, type RendererPricePoint } from './chartSeriesProjection';

export type RendererDrawingAnchor = RendererPricePoint;

export interface RendererTrendLineDrawing {
  readonly id: string;
  readonly kind: 'trend-line';
  readonly start: RendererDrawingAnchor;
  readonly end: RendererDrawingAnchor;
}

export type RendererChartDrawing = RendererTrendLineDrawing;

export function projectChartDrawingAnchor(
  anchor: ChartDrawingAnchor,
): RendererDrawingAnchor {
  return projectChartPricePoint(anchor);
}

export function projectChartDrawing(
  drawing: ChartDrawing,
): RendererChartDrawing {
  return {
    id: drawing.id,
    kind: drawing.kind,
    start: projectChartDrawingAnchor(drawing.start),
    end: projectChartDrawingAnchor(drawing.end),
  };
}

/**
 * P18.36 ordered drawing-collection projection.
 *
 * P18.2 remains the sole domain-drawing -> renderer-drawing projection owner.
 * This helper only projects one immutable drawing snapshot in insertion order so
 * later presentation/selection composition does not reimplement projection at a
 * UI or provider boundary. It owns no collection mutation, presentation
 * lifecycle, interaction state, persistence, provider APIs, or P19 semantics.
 */
export function projectChartDrawings(
  drawings: readonly ChartDrawing[],
): readonly RendererChartDrawing[] {
  return drawings.map(projectChartDrawing);
}
