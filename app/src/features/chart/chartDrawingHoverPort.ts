import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import type { RendererChartDrawing } from './chartDrawingProjection';

export interface ChartDrawingHoverObservation {
  readonly kind: 'drawing-hover';
  readonly drawingId: string;
}

export interface ChartDrawingHoverDriverHandle {
  detach(): void;
}

export interface ChartDrawingHoverDriver {
  attach(
    series: ChartEngineSeriesHandle,
    drawings: readonly RendererChartDrawing[],
    onHover: (hover: ChartDrawingHoverObservation | null) => void,
  ): ChartDrawingHoverDriverHandle;
}

export interface ChartDrawingHoverSession {
  destroy(): void;
}

export interface ChartDrawingHoverPort {
  attach(
    series: ChartEngineSeriesHandle,
    drawings: readonly RendererChartDrawing[],
    onHover: (hover: ChartDrawingHoverObservation | null) => void,
  ): ChartDrawingHoverSession;
}

/**
 * P18.18 provider-neutral drawing-hover lifecycle invariant:
 * - provider-specific chart resolution, crosshair subscription, and hoveredObjectId projection remain behind P18 provider bindings
 * - the neutral port carries only the active chart-series handle, immutable renderer drawing input, and hover observations
 * - destroy() detaches the provider-owned hover resource exactly once and is idempotent
 * - this boundary owns no click selection, drag/edit, drawing truth mutation, persistence, calculations,
 *   market acquisition, journal truth, toolbar state, navigation state, autoscale policy, or P19 behavior
 */
export function createChartDrawingHoverPortFromDriver(
  driver: ChartDrawingHoverDriver,
): ChartDrawingHoverPort {
  return {
    attach(series, drawings, onHover): ChartDrawingHoverSession {
      const handle = driver.attach(series, drawings, onHover);
      let destroyed = false;

      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          handle.detach();
        },
      };
    },
  };
}
