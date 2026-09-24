import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawing, ChartDrawingAnchor } from './chartDrawingContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import type { ChartDrawingPresentationDrawingRefreshSession } from './chartDrawingPresentationPort';
import { refreshChartDrawingPresentationFromCollection } from './chartDrawingCollectionPresentationCoordination';
import { executeChartTrendLineEdit } from './chartTrendLineEditCoordination';

/**
 * P18.51 provider-neutral committed trend-line edit -> presentation refresh
 * coordination.
 *
 * P18.50 remains the sole edit-execution coordinator. P18.47 remains the sole
 * committed collection -> drawing-only presentation refresh coordinator. This
 * seam composes those owners so a successful authoritative edit is followed by
 * one refresh of the already-active drawing presentation from current committed
 * collection truth.
 *
 * A no-op/stale edit does not refresh presentation. If presentation refresh
 * fails after a committed edit, the error is propagated but committed drawing
 * truth and the already-reset interaction state are not rolled back: renderer
 * presentation is not authoritative business/data truth.
 *
 * This coordinator does not initiate editing, accept drawing identity or edit
 * endpoint arguments, subscribe to provider gestures, convert provider
 * coordinates, mutate the collection directly, project drawings directly,
 * manage provider resources, persist/restore analysis, own undo/redo, change
 * deletion behavior, own toolbar/UI state, or introduce P19 Risk/Reward
 * semantics.
 */
export function executeChartTrendLineEditAndRefreshPresentation(
  interaction: ChartDrawingInteractionSession,
  collection: ChartDrawingCollectionSession,
  presentation: ChartDrawingPresentationDrawingRefreshSession,
  anchor: ChartDrawingAnchor,
): ChartDrawing | null {
  const edited = executeChartTrendLineEdit(interaction, collection, anchor);
  if (edited === null) return null;

  refreshChartDrawingPresentationFromCollection(presentation, collection);
  return edited;
}
