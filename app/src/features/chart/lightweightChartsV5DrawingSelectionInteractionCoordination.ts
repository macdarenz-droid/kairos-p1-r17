import type { ChartDrawingInteractionState } from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import type { RendererChartDrawing } from './chartDrawingProjection';
import type { LightweightChartsV5DrawingClickEvent } from './lightweightChartsV5DrawingClickSubscription';
import type { LightweightChartsV5TrendLineScreenSegment } from './lightweightChartsV5TrendLineCoordinateProjection';
import { hitTestLightweightChartsV5TrendLineSegments } from './lightweightChartsV5TrendLineHitTest';
import {
  projectLightweightChartsV5DrawingSelection,
  type LightweightChartsV5DrawingSelectionMouseEvent,
} from './lightweightChartsV5DrawingSelectionProjection';

export type ChartDrawingSelectionInteractionDispatcher = Pick<
  ChartDrawingInteractionSession,
  'dispatch'
>;

/**
 * P18.41 provider-selection -> authoritative interaction coordination.
 *
 * This seam composes already-authoritative owners only:
 * - P18.39 remains the sole provider hit/current-snapshot selection projection owner;
 * - P18.22 remains the select-drawing event vocabulary owner;
 * - P18.23 remains the sole transition-acceptance owner;
 * - P18.24 remains the sole active interaction state/dispatch owner.
 *
 * A provider click with no current drawing selection evidence is a strict no-op
 * and is not dispatched. A valid selection is forwarded exactly once as the
 * existing select-drawing event, and the authoritative dispatch result is
 * returned unchanged. This coordinator never decides whether the current state
 * accepts selection; P18.23 does.
 *
 * It owns no provider subscribe/unsubscribe lifecycle, drawing collection or
 * projection truth, interaction state storage, drawing mutation/edit/delete,
 * persistence, toolbar/UI state, journal truth, calculations, or P19 behavior.
 */
export function coordinateLightweightChartsV5DrawingSelectionInteraction(
  interaction: ChartDrawingSelectionInteractionDispatcher,
  drawings: readonly RendererChartDrawing[],
  event: LightweightChartsV5DrawingSelectionMouseEvent,
): ChartDrawingInteractionState | null {
  const selection = projectLightweightChartsV5DrawingSelection(drawings, event);
  if (selection === null) return null;

  return interaction.dispatch({
    type: 'select-drawing',
    drawingId: selection.drawingId,
  });
}

/**
 * Selects a drawing by where the tap landed. On phones, lightweight-charts
 * 5.2.1 does not refresh its hover info on a tap, so `hoveredInfo` can name
 * the wrong drawing or none; the tap point is the reliable evidence. Returns
 * null when there is no point or no hit, so the caller can fall back to the
 * hover selection. Whether the current state accepts selection stays with the
 * interaction reducer.
 */
export function coordinateLightweightChartsV5DrawingPointSelection(
  interaction: ChartDrawingSelectionInteractionDispatcher,
  segments: readonly LightweightChartsV5TrendLineScreenSegment[],
  event: Pick<LightweightChartsV5DrawingClickEvent, 'point'>,
  tolerancePx: number,
): ChartDrawingInteractionState | null {
  const point = event.point;
  if (point === undefined) return null;
  const hit = hitTestLightweightChartsV5TrendLineSegments(segments, point.x, point.y, tolerancePx);
  if (hit === null) return null;
  return interaction.dispatch({ type: 'select-drawing', drawingId: hit.id });
}
