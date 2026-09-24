import type { RendererChartDrawing } from './chartDrawingProjection';
import type { LightweightChartsV5DrawingPrimitiveFactory } from './lightweightChartsV5DrawingLayerDriver';
import {
  createLightweightChartsV5TrendLinePrimitive,
  type LightweightChartsV5TrendLinePrimitive,
} from './lightweightChartsV5TrendLinePrimitive';
import type { LightweightChartsV5TrendLineStrokeStyle } from './lightweightChartsV5TrendLinePaneRenderer';

/**
 * P18.8 primitive-factory invariant:
 * - P18.4 remains the sole provider primitive attach/detach lifecycle owner
 * - P18.7 remains the sole trend-line primitive/view composition owner
 * - this factory only binds injected presentation stroke style to immutable drawing input
 * - each create() call returns a fresh primitive suitable for P18.4 replacement semantics
 * - no provider series lookup, Canvas drawing, coordinate conversion, hit testing, interaction,
 *   persistence, autoscale, calculation, market acquisition, journal truth, or P19 behavior lives here
 */
export function createLightweightChartsV5TrendLinePrimitiveFactory(
  style: LightweightChartsV5TrendLineStrokeStyle,
): LightweightChartsV5DrawingPrimitiveFactory<LightweightChartsV5TrendLinePrimitive> {
  const styleSnapshot: LightweightChartsV5TrendLineStrokeStyle = {
    color: style.color,
    lineWidth: style.lineWidth,
  };

  return {
    create(drawings: readonly RendererChartDrawing[]): LightweightChartsV5TrendLinePrimitive {
      return createLightweightChartsV5TrendLinePrimitive(drawings, styleSnapshot);
    },
  };
}
