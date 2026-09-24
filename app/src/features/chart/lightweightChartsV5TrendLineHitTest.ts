import type { ChartTrendLineEditEndpoint } from './chartTrendLineEditConstruction';
import type { LightweightChartsV5TrendLineScreenSegment } from './lightweightChartsV5TrendLineCoordinateProjection';


export interface LightweightChartsV5TrendLineEditEndpointHit {
  readonly id: string;
  readonly kind: 'trend-line-edit-endpoint';
  readonly endpoint: ChartTrendLineEditEndpoint;
}
export interface LightweightChartsV5TrendLineHit {
  readonly id: string;
  readonly kind: 'trend-line';
  readonly cursorStyle: 'pointer';
}


function squaredDistanceToPoint(
  x: number,
  y: number,
  point: { readonly x: number; readonly y: number },
): number {
  const dx = x - point.x;
  const dy = y - point.y;
  return dx * dx + dy * dy;
}

function squaredDistanceToSegment(
  x: number,
  y: number,
  segment: LightweightChartsV5TrendLineScreenSegment,
): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  if (dx === 0 && dy === 0) {
    const px = x - segment.start.x;
    const py = y - segment.start.y;
    return px * px + py * py;
  }
  const t = Math.max(0, Math.min(1, ((x - segment.start.x) * dx + (y - segment.start.y) * dy) / (dx * dx + dy * dy)));
  const nearestX = segment.start.x + t * dx;
  const nearestY = segment.start.y + t * dy;
  const px = x - nearestX;
  const py = y - nearestY;
  return px * px + py * py;
}


/**
 * P18.55 controlled extension of the existing P18.12 hit-test geometry owner.
 *
 * This function derives edit-endpoint evidence only from already-projected P18.5
 * trend-line screen segments. It does not subscribe to provider input, dispatch
 * interaction events, execute edits, mutate drawing truth, refresh presentation,
 * persist state, or introduce P19 behavior.
 *
 * Reverse iteration preserves the existing top-most/latest segment rule. When
 * both endpoints of the same top-most segment are within tolerance, the nearest
 * endpoint wins; an exact distance tie is ambiguous and fails closed to null.
 */
export function hitTestLightweightChartsV5TrendLineEditEndpoints(
  segments: readonly LightweightChartsV5TrendLineScreenSegment[],
  x: number,
  y: number,
  tolerancePx: number,
): LightweightChartsV5TrendLineEditEndpointHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new Error('chart-drawing-hit-test-invalid-input');
  }

  const toleranceSquared = tolerancePx * tolerancePx;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    const startDistance = squaredDistanceToPoint(x, y, segment.start);
    const endDistance = squaredDistanceToPoint(x, y, segment.end);
    const startHit = startDistance <= toleranceSquared;
    const endHit = endDistance <= toleranceSquared;

    if (!startHit && !endHit) continue;
    if (startHit && endHit && startDistance === endDistance) return null;

    return {
      id: segment.id,
      kind: 'trend-line-edit-endpoint',
      endpoint: startHit && (!endHit || startDistance < endDistance) ? 'start' : 'end',
    };
  }

  return null;
}

/**
 * P18.12 provider hit-test geometry invariant:
 * - P18.5 projected screen segments remain the geometry owner
 * - this function only answers whether a screen point is within a presentation tolerance
 * - reverse iteration makes the visually latest segment the top-most hit
 * - no pointer subscription, selection, drag/edit, drawing truth mutation, persistence,
 *   autoscale, calculations, market acquisition, journal truth, toolbar, or P19 behavior lives here
 */
export function hitTestLightweightChartsV5TrendLineSegments(
  segments: readonly LightweightChartsV5TrendLineScreenSegment[],
  x: number,
  y: number,
  tolerancePx: number,
): LightweightChartsV5TrendLineHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new Error('chart-drawing-hit-test-invalid-input');
  }
  const toleranceSquared = tolerancePx * tolerancePx;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment.kind !== 'trend-line') continue;
    if (squaredDistanceToSegment(x, y, segment) <= toleranceSquared) {
      return { id: segment.id, kind: 'trend-line', cursorStyle: 'pointer' };
    }
  }
  return null;
}
