import type { ChartDrawing } from './chartDrawingContract';
import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import { createChartDrawingId } from './chartDrawingIdentity';
import { commitChartTrendLineDraft } from './chartTrendLineDraftCommitCoordination';
import type { ChartTrendLineDraftInteractionSession } from './chartTrendLineDraftInteractionCoordination';

/**
 * P18.35 provider-neutral trend-line commit-to-collection coordination.
 *
 * This boundary composes the already-authoritative owners only:
 * - P18.34 allocates one fresh chart drawing identity;
 * - P18.32 performs the authoritative preview -> committed transition and
 *   returns only the matching P18.1 trend-line drawing truth;
 * - P18.33 owns the committed in-memory drawing collection.
 *
 * The collection is preflighted before commit so destroyed collection state or
 * an identity collision fails before the interaction transition is attempted.
 * The drawing is added only after P18.32 confirms the authoritative committed
 * state. This boundary stores no parallel interaction or drawing state and owns
 * no persistence, provider APIs, rendering, editing/deleting, journal truth, or
 * P19 Risk/Reward semantics.
 */
export function commitChartTrendLineDraftToCollection(
  session: ChartTrendLineDraftInteractionSession,
  collection: ChartDrawingCollectionSession,
): ChartDrawing | null {
  const state = session.getState();
  if (state.status !== 'preview' || (state.tool !== 'trend-line' && state.tool !== 'zone')) return null;

  const drawingId = createChartDrawingId();
  if (collection.getDrawing(drawingId) !== null) return null;

  const drawing = commitChartTrendLineDraft(session, drawingId);
  if (drawing === null) return null;

  collection.addDrawing(drawing);
  return drawing;
}
