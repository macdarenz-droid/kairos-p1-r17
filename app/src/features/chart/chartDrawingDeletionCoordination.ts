import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawing } from './chartDrawingContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';

/**
 * P18.45 provider-neutral committed drawing deletion coordination.
 *
 * P18.23/P18.24/P18.38 remain the sole interaction transition/current-state
 * owners, and P18.33/P18.44 remain the sole committed drawing-set mutation
 * owner. This coordinator consumes only an already-authoritative `deleting`
 * interaction state, verifies that the exact drawing still exists in the
 * current committed collection, delegates removal to that collection owner,
 * then clears the interaction through the existing reset event only after the
 * committed removal succeeds.
 *
 * It deliberately does not initiate deletion, mutate the collection directly,
 * refresh presentation, own provider APIs, construct edits, persist/restore
 * saved analysis, implement undo/redo, own toolbar/UI state, or introduce P19
 * Risk/Reward semantics.
 */
export function executeChartDrawingDeletion(
  interaction: ChartDrawingInteractionSession,
  collection: ChartDrawingCollectionSession,
): ChartDrawing | null {
  const state = interaction.getState();
  if (state.status !== 'deleting') return null;

  const drawing = collection.getDrawing(state.drawingId);
  if (drawing === null) return null;

  collection.removeDrawing(state.drawingId);

  const resetState = interaction.dispatch({ type: 'reset-interaction' });
  if (resetState.status !== 'idle') {
    throw new Error('chart-drawing-deletion-reset-rejected');
  }

  return drawing;
}
