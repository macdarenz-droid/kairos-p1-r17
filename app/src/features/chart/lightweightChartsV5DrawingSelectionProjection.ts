import type { ChartDrawingId } from './chartDrawingContract';
import type { RendererChartDrawing } from './chartDrawingProjection';

export interface LightweightChartsV5DrawingSelectionHoveredInfo {
  readonly sourceKind: 'series' | 'series-primitive' | 'pane-primitive';
  readonly objectKind:
    | 'primitive'
    | 'series'
    | 'custom-object'
    | 'custom-price-line'
    | 'series-marker';
  readonly objectId?: unknown;
}

export interface LightweightChartsV5DrawingSelectionMouseEvent {
  readonly hoveredInfo?: LightweightChartsV5DrawingSelectionHoveredInfo;
}

export interface ChartDrawingSelectionProjection {
  readonly kind: 'drawing-selection';
  readonly drawingId: ChartDrawingId;
}

/**
 * P18.39 Lightweight Charts v5 drawing-selection projection invariant:
 * - P18.13 remains the primitive hit-test owner and exposes drawing identity as externalId
 * - Lightweight Charts v5.2 surfaces that identity as hoveredInfo.objectId on mouse events
 * - only series-primitive / primitive hits are eligible for drawing selection
 * - objectId is accepted only when it is a string present in the current renderer drawing snapshot
 * - unrelated, malformed, stale, or non-drawing provider hits fail closed to null
 * - no provider click-subscription lifecycle, interaction dispatch/state mutation, drawing mutation, persistence,
 *   toolbar/UI state, drag/edit/delete execution, journal truth, calculation, or P19 behavior lives here
 */
export function projectLightweightChartsV5DrawingSelection(
  drawings: readonly RendererChartDrawing[],
  event: LightweightChartsV5DrawingSelectionMouseEvent,
): ChartDrawingSelectionProjection | null {
  const hoveredInfo = event.hoveredInfo;
  if (
    hoveredInfo === undefined
    || hoveredInfo.sourceKind !== 'series-primitive'
    || hoveredInfo.objectKind !== 'primitive'
    || typeof hoveredInfo.objectId !== 'string'
  ) {
    return null;
  }

  for (const drawing of drawings) {
    if (drawing.id === hoveredInfo.objectId) {
      return { kind: 'drawing-selection', drawingId: drawing.id };
    }
  }

  return null;
}
