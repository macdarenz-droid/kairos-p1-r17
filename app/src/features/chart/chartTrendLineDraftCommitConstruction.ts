import {
  defineChartDrawing,
  type ChartDrawing,
  type ChartDrawingId,
  type ChartDrawingKind,
} from './chartDrawingContract';
import type { ChartTrendLineDraftAnchors } from './chartTrendLineDraftAnchorCollection';

/**
 * P18.31 provider-neutral trend-line draft commit construction.
 *
 * This pure boundary owns only the conversion of a complete two-anchor draft
 * plus a caller-supplied drawing identity into the authoritative P18.1
 * ChartTrendLineDrawing shape. P18.28R1 remains the draft-anchor evidence
 * owner; P18.1 remains the committed drawing-truth shape owner.
 *
 * Incomplete drafts fail closed. This boundary does not allocate drawing IDs,
 * dispatch interaction events, mutate draft state, persist/restore drawings,
 * attach provider primitives, or own edit/delete/undo/P19 behavior.
 */
export function constructChartTrendLineDrawingFromDraft(
  drawingId: ChartDrawingId,
  anchors: ChartTrendLineDraftAnchors,
  kind: ChartDrawingKind = 'trend-line',
): ChartDrawing | null {
  if (anchors.length !== 2) return null;

  // A zone is drafted exactly like a trend line: two anchors, opposite corners in placed order.
  return defineChartDrawing({
    id: drawingId,
    kind,
    start: anchors[0],
    end: anchors[1],
  });
}
