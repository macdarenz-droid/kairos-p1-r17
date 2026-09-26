import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawingPresentationSession } from './chartDrawingPresentationPort';
import type { ChartDrawingPresentationDrawingRefreshSession } from './chartDrawingPresentationPort';
import { projectChartDrawings } from './chartDrawingProjection';
import type { RendererSeriesProjection } from './chartSeriesProjection';

/**
 * P18.37 provider-neutral committed-collection -> presentation coordination.
 *
 * P18.47 extends this same coordination owner with a drawing-only refresh path
 * that delegates to the P18.46 presentation-owner extension instead of forcing
 * market-series replacement after committed drawing mutations.
 *
 * This seam composes already-authoritative owners only:
 * - P18.33 owns the committed in-memory ChartDrawing collection;
 * - P18.2/P18.36 own domain drawing -> renderer drawing projection;
 * - P18.11 owns series/drawing presentation resource ordering.
 *
 * The coordinator reads one current immutable collection snapshot, projects it
 * through the existing projection owner, and presents that renderer snapshot
 * with the caller-supplied renderer series. It owns no collection mutation,
 * drawing construction/identity, interaction state, provider APIs, persistence,
 * selection/edit/delete semantics, journal truth, or P19 Risk/Reward behavior.
 */
export function replaceChartDrawingPresentationFromCollection(
  presentation: ChartDrawingPresentationSession,
  series: RendererSeriesProjection,
  collection: ChartDrawingCollectionSession,
): void {
  const drawings = projectChartDrawings(collection.getDrawings());
  presentation.replace(series, drawings);
}

/**
 * P18.47 controlled extension of the existing P18.37 collection-to-presentation
 * coordinator. Reads exactly one authoritative committed collection snapshot,
 * delegates domain -> renderer projection to P18.36, then delegates drawing-only
 * presentation refresh to P18.46.
 *
 * No collection mutation, interaction dispatch, provider API, series lifecycle,
 * persistence, edit/delete execution, journal truth, or P19 semantics live here.
 */
export function refreshChartDrawingPresentationFromCollection(
  presentation: ChartDrawingPresentationDrawingRefreshSession,
  collection: ChartDrawingCollectionSession,
): void {
  const drawings = projectChartDrawings(collection.getDrawings());
  presentation.replaceDrawings(drawings);
}
