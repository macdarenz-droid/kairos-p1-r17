import type { ChartDrawingInteractionState } from './chartDrawingInteractionContract';
import type { RendererChartDrawing } from './chartDrawingProjection';

export type ChartDrawingSelectionPresentationMode = 'selected' | 'editing' | 'deleting';

export interface ChartDrawingSelectionPresentationProjection {
  readonly drawing: RendererChartDrawing;
  readonly mode: ChartDrawingSelectionPresentationMode;
}

/**
 * P18.43 provider-neutral drawing selection presentation projection.
 *
 * P18.24 remains the sole active interaction-state owner and P18.2/P18.36 remain
 * the sole drawing -> renderer projection owners. This boundary only projects an
 * already-authoritative selected/editing/deleting interaction state onto the
 * caller-supplied current renderer drawing snapshot.
 *
 * Stale interaction identity fails closed when the drawing no longer exists in
 * the current renderer snapshot. No drawing mutation, interaction dispatch,
 * provider API, styling token, persistence, collection ownership, or P19
 * Risk/Reward semantics live here.
 */
export function projectChartDrawingSelectionPresentation(
  drawings: readonly RendererChartDrawing[],
  state: ChartDrawingInteractionState,
): ChartDrawingSelectionPresentationProjection | null {
  if (
    state.status !== 'selected' &&
    state.status !== 'editing' &&
    state.status !== 'deleting'
  ) {
    return null;
  }

  const drawing = drawings.find((candidate) => candidate.id === state.drawingId);
  if (drawing === undefined) return null;

  return {
    drawing,
    mode: state.status,
  };
}
