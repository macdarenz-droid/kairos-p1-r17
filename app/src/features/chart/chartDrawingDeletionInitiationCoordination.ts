import type { ChartDrawingInteractionState } from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';

/**
 * P18.53 provider-neutral selected drawing -> deletion-intent coordination.
 *
 * P18.21/P18.24 remain the sole interaction state owner and P18.22/P18.23
 * remain the sole event-vocabulary/transition owners. This coordinator reads
 * exactly one authoritative current state snapshot and, only when it is
 * `selected`, forwards that same authoritative drawing identity through the
 * existing `start-deleting` event.
 *
 * Callers cannot supply a drawing ID. A non-selected state is a strict no-op.
 * If the active interaction session does not accept the delegated transition,
 * this seam fails closed to null rather than inventing deletion authority.
 *
 * This coordinator does not execute deletion, mutate committed drawings,
 * refresh presentation, subscribe to provider input, perform hit testing,
 * convert coordinates, persist/restore analysis, own undo/redo, own toolbar/UI
 * state, or introduce P19 Risk/Reward semantics.
 */
export function initiateChartDrawingDeletionFromSelection(
  interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'>,
): ChartDrawingInteractionState | null {
  const selected = interaction.getState();
  if (selected.status !== 'selected') return null;

  const next = interaction.dispatch({
    type: 'start-deleting',
    drawingId: selected.drawingId,
  });

  return next.status === 'deleting' && next.drawingId === selected.drawingId
    ? next
    : null;
}
