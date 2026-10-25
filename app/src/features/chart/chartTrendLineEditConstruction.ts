import {
  defineChartDrawing,
  type ChartDrawing,
  type ChartDrawingAnchor,
} from './chartDrawingContract';

/**
 * P18.48 provider-neutral trend-line edit construction.
 *
 * This pure boundary owns only construction of one identity-preserving edited
 * trend line from already-authoritative committed drawing truth, an explicit
 * editable endpoint, and one caller-supplied replacement anchor.
 *
 * P18.1 remains the committed drawing shape owner. P18.44 remains the sole
 * committed collection mutation owner. P18.23/P18.24/P18.38 remain interaction
 * transition/current-state owners. Provider gesture evidence, collection
 * replacement, presentation refresh, persistence, undo/redo, UI state, and P19
 * Risk/Reward semantics are deliberately outside this boundary.
 */
/** `target` names a risk box's target handle; lines and zones only have `start` and `end`. */
export type ChartTrendLineEditEndpoint = 'start' | 'end' | 'target';

export function constructChartTrendLineEdit(
  drawing: ChartDrawing,
  endpoint: ChartTrendLineEditEndpoint,
  anchor: ChartDrawingAnchor,
): ChartDrawing {
  if (endpoint !== 'start' && endpoint !== 'end') {
    throw new Error('chart-trend-line-edit-endpoint-unsupported');
  }

  const start = endpoint === 'start' ? { ...anchor } : { ...drawing.start };
  const end = endpoint === 'end' ? { ...anchor } : { ...drawing.end };
  // The kind is kept: a zone's placed corners are edited like a line's ends.
  return defineChartDrawing(drawing.kind === 'zone'
    ? { id: drawing.id, kind: 'zone', start, end }
    : { id: drawing.id, kind: 'trend-line', start, end });
}
