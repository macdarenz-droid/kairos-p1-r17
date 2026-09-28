import type { ChartDrawingInteractionState } from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import { coordinateChartTrendLineEditEndpointHit } from './chartTrendLineEditEndpointHitCoordination';
import type { LightweightChartsV5DrawingClickEvent } from './lightweightChartsV5DrawingClickSubscription';
import {
  hitTestLightweightChartsV5TrendLineEditEndpoints,
} from './lightweightChartsV5TrendLineHitTest';
import type { LightweightChartsV5TrendLineScreenSegment } from './lightweightChartsV5TrendLineCoordinateProjection';

/**
 * P18.57 raw provider-click point -> authoritative trend-line edit initiation coordination.
 *
 * The existing P18.26/P18.40 click lifecycle remains the sole provider click
 * subscription/evidence owner. P18.55 remains the sole endpoint hit-test geometry
 * owner and P18.56 remains the sole endpoint-hit identity -> authoritative selected
 * edit-initiation coordinator. This seam only composes those established owners for
 * one already-observed provider click using a caller-supplied current projected
 * trend-line segment snapshot.
 *
 * Missing provider point evidence is a strict no-op. Present point evidence is
 * delegated unchanged to P18.55 together with the supplied tolerance, so P18.55
 * retains invalid-input/top-most/ambiguity semantics. The resulting endpoint hit
 * (including null) is then delegated unchanged to P18.56, which preserves selected
 * drawing identity authority and P18.54's final state revalidation.
 *
 * This coordinator creates no provider subscription, resolves no provider chart or
 * series capability, performs no forward coordinate projection, dispatches no
 * interaction event directly, executes no edit, mutates no committed drawing,
 * refreshes no presentation, persists no state, owns no UI/toolbar behavior, and
 * introduces no P19 Risk/Reward semantics.
 */
export function coordinateLightweightChartsV5TrendLineEditEndpointClick(
  interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'>,
  segments: readonly LightweightChartsV5TrendLineScreenSegment[],
  event: Pick<LightweightChartsV5DrawingClickEvent, 'point'>,
  tolerancePx: number,
): ChartDrawingInteractionState | null {
  const point = event.point;
  if (point === undefined) return null;

  const hit = hitTestLightweightChartsV5TrendLineEditEndpoints(
    segments,
    point.x,
    point.y,
    tolerancePx,
  );

  return coordinateChartTrendLineEditEndpointHit(interaction, hit);
}
