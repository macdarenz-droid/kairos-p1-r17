import type { ChartDrawing, ChartDrawingAnchor } from './chartDrawingContract';
import { projectChartPricePoint, type RendererPricePoint } from './chartSeriesProjection';

export type RendererDrawingAnchor = RendererPricePoint;

export interface RendererTrendLineDrawing {
  readonly id: string;
  readonly kind: 'trend-line';
  readonly start: RendererDrawingAnchor;
  readonly end: RendererDrawingAnchor;
}

export interface RendererZoneDrawing {
  readonly id: string;
  readonly kind: 'zone';
  readonly start: RendererDrawingAnchor;
  readonly end: RendererDrawingAnchor;
}

export type RendererChartDrawing = RendererTrendLineDrawing | RendererZoneDrawing;

export function projectChartDrawingAnchor(
  anchor: ChartDrawingAnchor,
): RendererDrawingAnchor {
  return projectChartPricePoint(anchor);
}

export function projectChartDrawing(
  drawing: ChartDrawing,
): RendererChartDrawing {
  const start = projectChartDrawingAnchor(drawing.start);
  const end = projectChartDrawingAnchor(drawing.end);
  return drawing.kind === 'zone'
    ? { id: drawing.id, kind: 'zone', start, end }
    : { id: drawing.id, kind: 'trend-line', start, end };
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
