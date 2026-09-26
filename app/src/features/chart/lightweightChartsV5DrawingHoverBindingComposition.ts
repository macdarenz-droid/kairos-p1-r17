import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import type { RendererChartDrawing } from './chartDrawingProjection';
import type { ChartDrawingHoverProjection } from './lightweightChartsV5DrawingHoverProjection';
import {
  createLightweightChartsV5DrawingHoverSubscription,
  type LightweightChartsV5DrawingHoverChartApi,
  type LightweightChartsV5DrawingHoverSubscription,
} from './lightweightChartsV5DrawingHoverSubscription';
import type { LightweightChartsV5DriverBinding } from './lightweightChartsV5ModuleAdapter';

function requireDrawingHoverChartApi(chart: unknown): LightweightChartsV5DrawingHoverChartApi {
  if (typeof chart !== 'object' || chart === null) {
    throw new Error('chart-drawing-hover-capability-unavailable');
  }

  const candidate = chart as Partial<LightweightChartsV5DrawingHoverChartApi>;
  if (
    typeof candidate.subscribeCrosshairMove !== 'function' ||
    typeof candidate.unsubscribeCrosshairMove !== 'function'
  ) {
    throw new Error('chart-drawing-hover-capability-unavailable');
  }

  return chart as LightweightChartsV5DrawingHoverChartApi;
}

/**
 * P18.17 provider hover-binding composition invariant:
 * - P18.16 remains the sole neutral-series-handle -> provider-chart identity owner
 * - P18.15R1 remains the sole subscribeCrosshairMove/unsubscribeCrosshairMove lifecycle owner
 * - P18.14 remains the sole hoveredObjectId -> Kairos drawing-hover projection owner
 * - this boundary only resolves the provider chart, validates the hover-event capability, and delegates
 * - neutral ChartEngineSeriesHandle remains free of provider APIs
 * - missing provider hover capability fails closed before any subscription is created
 * - no click subscription, selection state, drag/edit, drawing truth mutation, persistence, calculations,
 *   market acquisition, journal truth, toolbar state, navigation state, autoscale policy, or P19 behavior lives here
 */
export function createLightweightChartsV5DrawingHoverSubscriptionFromBinding(
  binding: Pick<LightweightChartsV5DriverBinding, 'resolveChart'>,
  handle: ChartEngineSeriesHandle,
  drawings: readonly RendererChartDrawing[],
  onHover: (hover: ChartDrawingHoverProjection | null) => void,
): LightweightChartsV5DrawingHoverSubscription {
  const providerChart = binding.resolveChart(handle);
  const hoverChart = requireDrawingHoverChartApi(providerChart);
  return createLightweightChartsV5DrawingHoverSubscription(hoverChart, drawings, onHover);
}
