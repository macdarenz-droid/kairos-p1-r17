import type { ChartDrawing, ChartDrawingAnchor } from './chartDrawingContract';
import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import { constructChartTrendLineEdit } from './chartTrendLineEditConstruction';

/**
 * P18.50 provider-neutral committed trend-line edit execution coordination.
 *
 * This coordinator consumes only an already-authoritative P18.49 `editing`
 * interaction state. The authoritative state supplies both the committed drawing
 * identity and editable endpoint; callers supply only the replacement market
 * anchor evidence. P18.48 constructs the identity-preserving edited trend line,
 * P18.33/P18.44 remain the sole committed collection mutation owner, and
 * P18.23/P18.24 remain the sole interaction transition/current-state owners.
 *
 * It deliberately does not initiate editing, subscribe to provider pointer/drag
 * events, convert provider coordinates, refresh presentation, persist/restore
 * saved analysis, own undo/redo, own toolbar/UI state, or introduce P19
 * Risk/Reward semantics.
 */
export function executeChartTrendLineEdit(
  interaction: ChartDrawingInteractionSession,
  collection: ChartDrawingCollectionSession,
  anchor: ChartDrawingAnchor,
): ChartDrawing | null {
  const state = interaction.getState();
  if (state.status !== 'editing') return null;

  const drawing = collection.getDrawing(state.drawingId);
  if (drawing === null) return null;

  const edited = constructChartTrendLineEdit(drawing, state.endpoint, anchor);
  collection.replaceDrawing(state.drawingId, edited);

  const resetState = interaction.dispatch({ type: 'reset-interaction' });
  if (resetState.status !== 'idle') {
    throw new Error('chart-trend-line-edit-reset-rejected');
  }

  return edited;
}
