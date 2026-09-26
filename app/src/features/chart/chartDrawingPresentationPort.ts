import type { ChartEngineDriver, ChartEngineSeriesHandle } from './chartEngineDriver';
import type { RendererSeriesProjection } from './chartSeriesProjection';
import type { ChartDrawingLayerPort, ChartDrawingLayerSession } from './chartDrawingLayerPort';
import type { RendererChartDrawing } from './chartDrawingProjection';
import type {
  ChartDrawingHoverObservation,
  ChartDrawingHoverPort,
  ChartDrawingHoverSession,
} from './chartDrawingHoverPort';

export interface ChartDrawingPresentationSession {
  replace(
    series: RendererSeriesProjection,
    drawings: readonly RendererChartDrawing[],
  ): void;
  destroy(): void;
}

/**
 * P18.46 controlled extension of the existing P18.11/P18.20 presentation owner.
 *
 * Existing callers may continue to depend only on ChartDrawingPresentationSession.
 * Sessions created by the presentation port additionally expose drawing-only
 * refresh so committed drawing mutations do not require market-series teardown.
 */
export interface ChartDrawingPresentationDrawingRefreshSession
  extends ChartDrawingPresentationSession {
  replaceDrawings(drawings: readonly RendererChartDrawing[]): void;
}

export interface ChartDrawingPresentationPort {
  create(container: HTMLElement): ChartDrawingPresentationDrawingRefreshSession;
}

export interface ChartDrawingPresentationHoverBinding {
  readonly port: ChartDrawingHoverPort;
  readonly onHover: (hover: ChartDrawingHoverObservation | null) => void;
}

function cloneRendererDrawings(
  drawings: readonly RendererChartDrawing[],
): readonly RendererChartDrawing[] {
  return drawings.map((drawing) => ({
    ...drawing,
    start: { ...drawing.start },
    end: { ...drawing.end },
  }));
}

/**
 * P18.11 provider-neutral presentation coordination invariant:
 * - P17 ChartEngineDriver remains the series-resource owner
 * - P18.3 ChartDrawingLayerPort remains the drawing attachment lifecycle owner
 * - each replace() builds one fresh series and one drawing-layer attachment for the same handle
 * - the drawing layer is detached before its series is removed
 * - failed replacement is cleaned up without promoting a partial active presentation
 * - optional P18.20 hover integration attaches to the exact active series/drawing snapshot and detaches before drawing/series teardown
 * - P18.18 remains the hover lifecycle owner; this boundary only coordinates resource ordering
 * - P18.46 drawing-only refresh reuses the exact active series/drawing-layer resources and renews hover snapshot evidence without creating a second presentation owner
 * - this boundary owns no drawing truth, journal truth, market truth, persistence,
 *   calculations, acquisition, interaction state, autoscale policy, or navigation state
 */
export function createChartDrawingPresentationPort(
  driver: ChartEngineDriver,
  drawingLayer: ChartDrawingLayerPort,
  hover?: ChartDrawingPresentationHoverBinding,
): ChartDrawingPresentationPort {
  return {
    create(container: HTMLElement): ChartDrawingPresentationDrawingRefreshSession {
      const chart = driver.createChart(container);
      let activeSeries: ChartEngineSeriesHandle | null = null;
      let activeDrawingLayer: ChartDrawingLayerSession | null = null;
      let activeHover: ChartDrawingHoverSession | null = null;
      let activeDrawings: readonly RendererChartDrawing[] = [];
      let destroyed = false;

      const clearActive = (): void => {
        if (activeHover !== null) {
          activeHover.destroy();
          activeHover = null;
        }
        if (activeDrawingLayer !== null) {
          activeDrawingLayer.destroy();
          activeDrawingLayer = null;
        }
        if (activeSeries !== null) {
          chart.removeSeries(activeSeries);
          activeSeries = null;
        }
        activeDrawings = [];
      };

      const createSeries = (series: RendererSeriesProjection): ChartEngineSeriesHandle => {
        if (series.kind === 'price-line') {
          const handle = chart.addPriceLineSeries();
          handle.setPriceLineData(series.data);
          return handle;
        }

        const handle = chart.addCandlestickSeries();
        handle.setCandleData(series.data);
        return handle;
      };

      return {
        replace(series, drawings): void {
          if (destroyed) throw new Error('chart-drawing-presentation-destroyed');
          clearActive();

          let nextSeries: ChartEngineSeriesHandle | null = null;
          let nextDrawingLayer: ChartDrawingLayerSession | null = null;
          let nextHover: ChartDrawingHoverSession | null = null;
          try {
            nextSeries = createSeries(series);
            nextDrawingLayer = drawingLayer.attach(nextSeries);
            nextDrawingLayer.replaceDrawings(drawings);
            if (hover !== undefined) {
              nextHover = hover.port.attach(nextSeries, drawings, hover.onHover);
            }
            activeSeries = nextSeries;
            activeDrawingLayer = nextDrawingLayer;
            activeHover = nextHover;
            activeDrawings = cloneRendererDrawings(drawings);
          } catch (error) {
            if (nextHover !== null) nextHover.destroy();
            if (nextDrawingLayer !== null) nextDrawingLayer.destroy();
            if (nextSeries !== null) chart.removeSeries(nextSeries);
            throw error;
          }
        },

        replaceDrawings(drawings): void {
          if (destroyed) throw new Error('chart-drawing-presentation-destroyed');
          if (activeSeries === null || activeDrawingLayer === null) {
            throw new Error('chart-drawing-presentation-inactive');
          }

          const nextDrawings = cloneRendererDrawings(drawings);
          const previousDrawings = activeDrawings;

          activeDrawingLayer.replaceDrawings(nextDrawings);

          if (hover === undefined) {
            activeDrawings = nextDrawings;
            return;
          }

          let nextHover: ChartDrawingHoverSession;
          try {
            nextHover = hover.port.attach(activeSeries, nextDrawings, hover.onHover);
          } catch (error) {
            try {
              activeDrawingLayer.replaceDrawings(previousDrawings);
            } catch (rollbackError) {
              clearActive();
              throw rollbackError;
            }
            throw error;
          }

          const previousHover = activeHover;
          activeHover = nextHover;
          activeDrawings = nextDrawings;
          if (previousHover !== null) previousHover.destroy();
        },

        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          clearActive();
          chart.remove();
        },
      };
    },
  };
}
