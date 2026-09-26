import type { ChartDrawingAnchor } from './chartDrawingContract';
import type { LightweightChartsV5DrawingSelectionMouseEvent } from './lightweightChartsV5DrawingSelectionProjection';
import {
  projectLightweightChartsV5DrawingAnchor,
  type LightweightChartsV5DrawingAnchorEvent,
  type LightweightChartsV5DrawingAnchorPriceApi,
} from './lightweightChartsV5DrawingAnchorProjection';

export type LightweightChartsV5DrawingClickEvent =
  LightweightChartsV5DrawingAnchorEvent & LightweightChartsV5DrawingSelectionMouseEvent;

export type LightweightChartsV5DrawingClickEventHandler = (
  event: LightweightChartsV5DrawingClickEvent,
) => void;

export type LightweightChartsV5DrawingProviderClickListener = (
  event: LightweightChartsV5DrawingClickEvent,
) => void;

export interface LightweightChartsV5DrawingClickChartApi {
  subscribeClick(handler: LightweightChartsV5DrawingClickEventHandler): void;
  unsubscribeClick(handler: LightweightChartsV5DrawingClickEventHandler): void;
}

export interface LightweightChartsV5DrawingClickSubscription {
  destroy(): void;
}

/**
 * P18.26/P18.40 Lightweight Charts v5 drawing-click subscription lifecycle.
 *
 * This boundary owns only provider subscribeClick/unsubscribeClick lifecycle.
 * P18.25R1 remains the sole provider event-point -> Kairos drawing-anchor
 * projection owner. P18.40 preserves the same exact subscribed provider click
 * event for one optional observer before emitting the existing projected anchor.
 * This is evidence fan-out inside the existing single subscription owner; it does
 * not create another subscribeClick lifecycle or perform selection dispatch.
 *
 * destroy() unsubscribes the exact registered handler once and is idempotent.
 * This boundary owns no interaction dispatch, anchor-pair collection, drawing
 * selection projection/dispatch, mutation, persistence, toolbar state, drag/edit
 * behavior, journal truth, or P19 Risk/Reward behavior.
 */
export function createLightweightChartsV5DrawingClickSubscription(
  chart: LightweightChartsV5DrawingClickChartApi,
  series: LightweightChartsV5DrawingAnchorPriceApi,
  onAnchor: (anchor: ChartDrawingAnchor | null) => void,
  onProviderClick?: LightweightChartsV5DrawingProviderClickListener,
): LightweightChartsV5DrawingClickSubscription {
  let destroyed = false;

  const handleClick: LightweightChartsV5DrawingClickEventHandler = (event) => {
    if (destroyed) return;
    onProviderClick?.(event);
    onAnchor(projectLightweightChartsV5DrawingAnchor(event, series));
  };

  chart.subscribeClick(handleClick);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      chart.unsubscribeClick(handleClick);
    },
  };
}
