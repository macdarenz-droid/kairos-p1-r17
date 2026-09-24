import type { RendererChartDrawing } from './chartDrawingProjection';
import {
  projectLightweightChartsV5DrawingHover,
  type ChartDrawingHoverProjection,
  type LightweightChartsV5DrawingMouseEvent,
} from './lightweightChartsV5DrawingHoverProjection';

export type LightweightChartsV5DrawingHoverEventHandler = (
  event: LightweightChartsV5DrawingMouseEvent,
) => void;

export interface LightweightChartsV5DrawingHoverChartApi {
  subscribeCrosshairMove(handler: LightweightChartsV5DrawingHoverEventHandler): void;
  unsubscribeCrosshairMove(handler: LightweightChartsV5DrawingHoverEventHandler): void;
}

export interface LightweightChartsV5DrawingHoverSubscription {
  destroy(): void;
}

/**
 * P18.15 provider hover-subscription lifecycle invariant:
 * - P18.14 remains the sole provider hoveredObjectId -> Kairos drawing-hover projection owner
 * - this boundary owns only subscribeCrosshairMove/unsubscribeCrosshairMove lifecycle
 * - one immutable renderer drawing snapshot scopes provider ids for the subscription lifetime
 * - every provider move emits either the P18.14 drawing-hover projection or null to clear presentation hover
 * - destroy() unsubscribes the exact registered handler once and is idempotent
 * - no click subscription, selection state, drag/edit, drawing truth mutation, persistence, calculations,
 *   market acquisition, journal truth, toolbar state, navigation state, or P19 behavior lives here
 */
export function createLightweightChartsV5DrawingHoverSubscription(
  chart: LightweightChartsV5DrawingHoverChartApi,
  drawings: readonly RendererChartDrawing[],
  onHover: (hover: ChartDrawingHoverProjection | null) => void,
): LightweightChartsV5DrawingHoverSubscription {
  const drawingSnapshot = drawings.map((drawing) => ({
    ...drawing,
    start: { ...drawing.start },
    end: { ...drawing.end },
  }));
  let destroyed = false;

  const handleCrosshairMove: LightweightChartsV5DrawingHoverEventHandler = (event) => {
    if (destroyed) return;
    onHover(projectLightweightChartsV5DrawingHover(drawingSnapshot, event));
  };

  chart.subscribeCrosshairMove(handleCrosshairMove);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
    },
  };
}
