import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import { createChartDrawingLayerPortFromDriver, type ChartDrawingLayerPort } from './chartDrawingLayerPort';
import {
  createLightweightChartsV5DrawingLayerDriver,
  type LightweightChartsV5SeriesPrimitiveApi,
} from './lightweightChartsV5DrawingLayerDriver';
import type { LightweightChartsV5DriverBinding } from './lightweightChartsV5ModuleAdapter';
import { createLightweightChartsV5TrendLinePrimitiveFactory } from './lightweightChartsV5TrendLinePrimitiveFactory';
import type { LightweightChartsV5TrendLinePrimitive } from './lightweightChartsV5TrendLinePrimitive';
import type { LightweightChartsV5TrendLineStrokeStyle } from './lightweightChartsV5TrendLinePaneRenderer';

function resolveTrendLinePrimitiveSeries(
  binding: LightweightChartsV5DriverBinding,
  series: ChartEngineSeriesHandle,
): LightweightChartsV5SeriesPrimitiveApi<LightweightChartsV5TrendLinePrimitive> {
  const vendorSeries = binding.resolveSeries(series) as unknown as Partial<
    LightweightChartsV5SeriesPrimitiveApi<LightweightChartsV5TrendLinePrimitive>
  >;

  if (
    typeof vendorSeries.attachPrimitive !== 'function'
    || typeof vendorSeries.detachPrimitive !== 'function'
  ) {
    throw new Error('lightweight-charts-series-primitive-api-unavailable');
  }

  return vendorSeries as LightweightChartsV5SeriesPrimitiveApi<LightweightChartsV5TrendLinePrimitive>;
}

/**
 * P18.10 production drawing-layer composition invariant:
 * - P18.3 remains the provider-neutral drawing-layer lifecycle owner
 * - P18.4 remains the provider primitive attach/detach owner
 * - P18.8 remains the trend-line primitive factory owner
 * - P18.9 remains the neutral-handle -> vendor-series identity owner
 * - this composition only adapts the resolved provider series to P18.4's narrow primitive surface
 * - the adapter fails closed when the provider series does not expose primitive lifecycle methods
 * - no drawing truth, coordinate conversion, Canvas rendering, hit testing, interaction,
 *   persistence, calculations, market acquisition, journal truth, or P19 behavior lives here
 */
export function createLightweightChartsV5TrendLineDrawingLayerPort(
  binding: LightweightChartsV5DriverBinding,
  style: LightweightChartsV5TrendLineStrokeStyle,
): ChartDrawingLayerPort {
  const primitiveFactory = createLightweightChartsV5TrendLinePrimitiveFactory(style);
  const driver = createLightweightChartsV5DrawingLayerDriver<LightweightChartsV5TrendLinePrimitive>(
    (series) => resolveTrendLinePrimitiveSeries(binding, series),
    primitiveFactory,
  );
  return createChartDrawingLayerPortFromDriver(driver);
}
