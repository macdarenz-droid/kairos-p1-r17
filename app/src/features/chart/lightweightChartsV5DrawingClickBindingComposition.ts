import type { ChartDrawingAnchor } from './chartDrawingContract';
import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import {
  createLightweightChartsV5DrawingClickSubscription,
  type LightweightChartsV5DrawingClickChartApi,
  type LightweightChartsV5DrawingClickSubscription,
  type LightweightChartsV5DrawingProviderClickListener,
} from './lightweightChartsV5DrawingClickSubscription';
import type { LightweightChartsV5DrawingAnchorPriceApi } from './lightweightChartsV5DrawingAnchorProjection';
import type { LightweightChartsV5DriverBinding } from './lightweightChartsV5ModuleAdapter';

function requireDrawingClickChartApi(chart: unknown): LightweightChartsV5DrawingClickChartApi {
  if (typeof chart !== 'object' || chart === null) {
    throw new Error('chart-drawing-click-capability-unavailable');
  }

  const candidate = chart as Partial<LightweightChartsV5DrawingClickChartApi>;
  if (
    typeof candidate.subscribeClick !== 'function' ||
    typeof candidate.unsubscribeClick !== 'function'
  ) {
    throw new Error('chart-drawing-click-capability-unavailable');
  }

  return chart as LightweightChartsV5DrawingClickChartApi;
}

function requireDrawingAnchorPriceApi(series: unknown): LightweightChartsV5DrawingAnchorPriceApi {
  if (typeof series !== 'object' || series === null) {
    throw new Error('chart-drawing-anchor-price-capability-unavailable');
  }

  const candidate = series as Partial<LightweightChartsV5DrawingAnchorPriceApi>;
  if (typeof candidate.coordinateToPrice !== 'function') {
    throw new Error('chart-drawing-anchor-price-capability-unavailable');
  }

  return series as LightweightChartsV5DrawingAnchorPriceApi;
}

/**
 * P18.27/P18.40 provider drawing-click binding composition invariant:
 * - P18.9 remains the sole neutral-series-handle -> provider-series identity owner
 * - P18.16 remains the sole neutral-series-handle -> provider-chart identity owner
 * - P18.26 remains the sole subscribeClick/unsubscribeClick lifecycle owner
 * - P18.25R1 remains the sole provider event/coordinate -> Kairos anchor projection owner
 * - P18.40 forwards one optional raw provider-click observer into the same P18.26 lifecycle
 * - this boundary only resolves both provider resources, validates capabilities, and delegates
 * - neutral ChartEngineSeriesHandle remains free of provider APIs
 * - missing click or price-coordinate capability fails closed before any subscription is created
 * - no interaction-session dispatch, anchor-pair collection, selection projection/dispatch, drawing mutation, persistence,
 *   toolbar state, drag/edit behavior, journal truth, or P19 Risk/Reward behavior lives here
 */
export function createLightweightChartsV5DrawingClickSubscriptionFromBinding(
  binding: Pick<LightweightChartsV5DriverBinding, 'resolveChart' | 'resolveSeries'>,
  handle: ChartEngineSeriesHandle,
  onAnchor: (anchor: ChartDrawingAnchor | null) => void,
  onProviderClick?: LightweightChartsV5DrawingProviderClickListener,
): LightweightChartsV5DrawingClickSubscription {
  const providerChart = binding.resolveChart(handle);
  const providerSeries = binding.resolveSeries(handle);
  const clickChart = requireDrawingClickChartApi(providerChart);
  const priceSeries = requireDrawingAnchorPriceApi(providerSeries);

  if (onProviderClick === undefined) {
    return createLightweightChartsV5DrawingClickSubscription(clickChart, priceSeries, onAnchor);
  }

  return createLightweightChartsV5DrawingClickSubscription(
    clickChart,
    priceSeries,
    onAnchor,
    onProviderClick,
  );
}
