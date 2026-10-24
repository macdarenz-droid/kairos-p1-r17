import type { ChartDrawingInteractionState } from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import type { ChartTrendLineEditEndpoint } from './chartTrendLineEditConstruction';

/**
 * P18.54 provider-neutral selected drawing -> trend-line edit-intent coordination.
 *
 * P18.21/P18.24 remain the sole interaction state owner and P18.22/P18.23/P18.49
 * remain the sole event-vocabulary/transition/edit-endpoint state owners. This
 * coordinator reads exactly one authoritative current state snapshot and, only
 * when it is `selected`, forwards that same authoritative drawing identity with
 * one caller-supplied P18.48 edit endpoint through the existing `start-editing`
 * event.
 *
 * Callers cannot supply a drawing ID. A non-selected state is a strict no-op.
 * If the active interaction session does not accept the delegated transition
 * for the same selected identity and endpoint, this seam fails closed to null
 * rather than inventing edit authority.
 *
 * This coordinator does not identify which endpoint was hit, execute an edit,
 * mutate committed drawings, refresh presentation, subscribe to provider input,
 * perform hit testing, convert coordinates, persist/restore analysis, own
 * undo/redo, own toolbar/UI state, or introduce P19 Risk/Reward semantics.
 */
export function initiateChartTrendLineEditFromSelection(
  interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'>,
  endpoint: ChartTrendLineEditEndpoint,
): ChartDrawingInteractionState | null {
  const selected = interaction.getState();
  if (selected.status !== 'selected') return null;

  const next = interaction.dispatch({
    type: 'start-editing',
    drawingId: selected.drawingId,
    endpoint,
  });

  return next.status === 'editing'
    && next.drawingId === selected.drawingId
    && next.endpoint === endpoint
    ? next
    : null;
}
