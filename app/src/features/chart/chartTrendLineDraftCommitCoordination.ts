import type { ChartDrawingId, ChartTrendLineDrawing } from './chartDrawingContract';
import type { ChartTrendLineDraftInteractionSession } from './chartTrendLineDraftInteractionCoordination';
import { constructChartTrendLineDrawingFromDraft } from './chartTrendLineDraftCommitConstruction';

/**
 * P18.32 provider-neutral trend-line draft commit coordination.
 *
 * This boundary composes the already-authoritative owners only:
 * - P18.29 supplies the active interaction session + draft-anchor evidence;
 * - P18.31 constructs the P18.1 committed trend-line drawing shape;
 * - P18.23/P18.24 remain the sole commit transition/current-state owners via
 *   the P18.29 session dispatch path.
 *
 * A caller supplies the drawing identity. Commit is accepted only while the
 * authoritative session is in trend-line preview with a complete draft. The
 * constructed drawing is returned only after the existing interaction session
 * confirms the matching committed state. No drawing collection, persistence,
 * provider API, ID allocation, editing/deleting, undo/redo, journal truth, or
 * P19 Risk/Reward behavior lives here.
 */
export function commitChartTrendLineDraft(
  session: ChartTrendLineDraftInteractionSession,
  drawingId: ChartDrawingId,
): ChartTrendLineDrawing | null {
  const state = session.getState();
  if (state.status !== 'preview' || state.tool !== 'trend-line') return null;

  const drawing = constructChartTrendLineDrawingFromDraft(drawingId, session.getAnchors());
  if (drawing === null) return null;

  const next = session.dispatch({ type: 'commit-drawing', drawingId });
  if (next.status !== 'committed' || next.drawingId !== drawingId) return null;

  return drawing;
}
