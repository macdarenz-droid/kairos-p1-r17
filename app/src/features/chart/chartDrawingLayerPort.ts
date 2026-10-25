import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import type { RendererChartDrawing } from './chartDrawingProjection';

export interface ChartDrawingLayerDriverHandle {
  replaceDrawings(drawings: readonly RendererChartDrawing[]): void;
  detach(): void;
}

export interface ChartDrawingLayerDriver {
  attach(series: ChartEngineSeriesHandle): ChartDrawingLayerDriverHandle;
}

export interface ChartDrawingLayerSession {
  replaceDrawings(drawings: readonly RendererChartDrawing[]): void;
  destroy(): void;
}

export interface ChartDrawingLayerPort {
  attach(series: ChartEngineSeriesHandle): ChartDrawingLayerSession;
}

/**
 * P18.3 drawing-layer lifecycle invariant:
 * - projected drawing values are presentation input only
 * - the active chart-series handle is the presentation attachment target
 * - destroy() detaches renderer-owned resources exactly once
 * - this boundary owns no drawing truth, journal truth, market truth, persistence,
 *   acquisition, calculations, interaction state, or navigation state
 */
export function createChartDrawingLayerPortFromDriver(
  driver: ChartDrawingLayerDriver,
): ChartDrawingLayerPort {
  return {
    attach(series: ChartEngineSeriesHandle): ChartDrawingLayerSession {
      const handle = driver.attach(series);
      let destroyed = false;

      return {
        replaceDrawings(drawings: readonly RendererChartDrawing[]): void {
          if (destroyed) throw new Error('chart-drawing-layer-destroyed');
          handle.replaceDrawings(drawings);
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          handle.detach();
        },
      };
    },
  };
}
