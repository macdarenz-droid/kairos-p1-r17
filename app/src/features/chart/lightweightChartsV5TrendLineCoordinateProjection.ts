import type { RendererChartDrawing } from './chartDrawingProjection';

export interface LightweightChartsV5TimeCoordinateApi {
  timeToCoordinate(time: number): number | null;
}

export interface LightweightChartsV5PriceCoordinateApi {
  priceToCoordinate(price: number): number | null;
}

export interface LightweightChartsV5TrendLineScreenSegment {
  readonly id: string;
  readonly kind: 'trend-line';
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

/**
 * P18.5 vendor coordinate projection invariant:
 * - renderer-safe drawing anchors remain the presentation input
 * - time/price conversion is delegated to the active Lightweight Charts v5 scales
 * - off-screen/unresolvable anchors produce no drawable segment
 * - this function owns no drawing truth, interaction state, persistence, autoscale,
 *   calculation, market acquisition, or journal truth
 */
export function projectLightweightChartsV5TrendLineSegments(
  drawings: readonly RendererChartDrawing[],
  timeScale: LightweightChartsV5TimeCoordinateApi,
  series: LightweightChartsV5PriceCoordinateApi,
): readonly LightweightChartsV5TrendLineScreenSegment[] {
  const segments: LightweightChartsV5TrendLineScreenSegment[] = [];

  for (const drawing of drawings) {
    const startX = timeScale.timeToCoordinate(drawing.start.time);
    const startY = series.priceToCoordinate(drawing.start.value);
    const endX = timeScale.timeToCoordinate(drawing.end.time);
    const endY = series.priceToCoordinate(drawing.end.value);

    if (startX === null || startY === null || endX === null || endY === null) {
      continue;
    }

    segments.push({
      id: drawing.id,
      kind: drawing.kind,
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
    });
  }

  return segments;
}
