import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawing } from './chartDrawingContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import type { ChartDrawingPresentationDrawingRefreshSession } from './chartDrawingPresentationPort';
import { refreshChartDrawingPresentationFromCollection } from './chartDrawingCollectionPresentationCoordination';
import { executeChartDrawingDeletion } from './chartDrawingDeletionCoordination';

/**
 * P18.52 provider-neutral committed drawing deletion -> presentation refresh
 * coordination.
 *
 * P18.45 remains the sole deletion-execution coordinator. P18.47 remains the
 * sole committed collection -> drawing-only presentation refresh coordinator.
 * This seam composes those owners so a successful authoritative deletion is
 * followed by one refresh of the already-active drawing presentation from
 * current committed collection truth.
 *
 * A no-op/stale deletion does not refresh presentation. If presentation refresh
 * fails after a committed deletion, the error is propagated but committed
 * drawing truth and the already-reset interaction state are not rolled back:
 * renderer presentation is not authoritative business/data truth.
 *
 * This coordinator does not initiate deletion, accept drawing identity,
 * subscribe to provider gestures, convert provider coordinates, mutate the
 * collection directly, project drawings directly, manage provider resources,
 * persist/restore analysis, own undo/redo, change edit behavior, own toolbar/UI
 * state, or introduce P19 Risk/Reward semantics.
 */
export function executeChartDrawingDeletionAndRefreshPresentation(
  interaction: ChartDrawingInteractionSession,
  collection: ChartDrawingCollectionSession,
  presentation: ChartDrawingPresentationDrawingRefreshSession,
): ChartDrawing | null {
  const deleted = executeChartDrawingDeletion(interaction, collection);
  if (deleted === null) return null;

  refreshChartDrawingPresentationFromCollection(presentation, collection);
  return deleted;
}
