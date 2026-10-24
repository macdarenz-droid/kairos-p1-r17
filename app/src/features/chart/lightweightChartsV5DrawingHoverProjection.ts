import type { RendererChartDrawing } from './chartDrawingProjection';
import type { ChartDrawingHoverObservation } from './chartDrawingHoverPort';

export interface LightweightChartsV5DrawingMouseEvent {
  readonly hoveredObjectId?: string;
}

export interface ChartDrawingHoverProjection extends ChartDrawingHoverObservation {
  readonly kind: 'drawing-hover';
  readonly drawingId: string;
}

/**
 * P18.14 provider hover-event projection invariant:
 * - P18.13 primitive hitTest() remains the source of provider externalId values
 * - this projection only accepts hoveredObjectId values that belong to the current renderer drawing snapshot
 * - unrelated provider object ids fail closed to null
 * - no chart subscription lifecycle, selection state, click state, drag/edit, drawing truth mutation,
 *   persistence, calculations, market acquisition, journal truth, toolbar state, or P19 behavior lives here
 */
export function projectLightweightChartsV5DrawingHover(
  drawings: readonly RendererChartDrawing[],
  event: LightweightChartsV5DrawingMouseEvent,
): ChartDrawingHoverProjection | null {
  const hoveredObjectId = event.hoveredObjectId;
  if (hoveredObjectId === undefined) {
    return null;
  }
  for (const drawing of drawings) {
    if (drawing.id === hoveredObjectId) {
      return { kind: 'drawing-hover', drawingId: drawing.id };
    }
  }
  return null;
}
