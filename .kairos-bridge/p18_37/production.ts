import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawingPresentationSession } from './chartDrawingPresentationPort';
import { projectChartDrawings } from './chartDrawingProjection';
import type { RendererSeriesProjection } from './chartSeriesProjection';

/**
 * P18.37 provider-neutral committed-collection -> presentation coordination.
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
