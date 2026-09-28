import type {
  RendererCandle,
  RendererPricePoint,
  RendererSeriesProjection,
} from './chartSeriesProjection';
import type {
  ChartEnginePort,
  ChartEngineSession,
} from './chartEnginePort';
import type {
  IncrementalChartEnginePort,
  IncrementalChartEngineSession,
} from './chartEngineIncrementalPort';
import type { ChartIncrementalUpdate } from './chartIncrementalUpdate';

export interface ChartEngineSeriesHandle {
  setPriceLineData(data: readonly RendererPricePoint[]): void;
  setCandleData(data: readonly RendererCandle[]): void;
  updatePriceLine(point: RendererPricePoint): void;
  updateCandle(candle: RendererCandle): void;
}

export interface ChartEngineDriver {
  createChart(container: HTMLElement): {
    addPriceLineSeries(): ChartEngineSeriesHandle;
    addCandlestickSeries(): ChartEngineSeriesHandle;
    removeSeries(series: ChartEngineSeriesHandle): void;
    remove(): void;
  };
}

/**
 * Adapts a concrete chart-library-shaped driver to the narrow Kairos P17 engine port.
 * The injected driver owns only presentation resources.
 */
export function createChartEnginePortFromDriver(
  driver: ChartEngineDriver,
): ChartEnginePort {
  return {
    create(container: HTMLElement): ChartEngineSession {
      const chart = driver.createChart(container);
      let activeSeries: ChartEngineSeriesHandle | null = null;
      let destroyed = false;

      const clearActiveSeries = (): void => {
        if (activeSeries === null) return;
        chart.removeSeries(activeSeries);
        activeSeries = null;
      };

      return {
        replaceSeries(series: RendererSeriesProjection): void {
          if (destroyed) {
            throw new Error('chart-engine-session-destroyed');
          }

          clearActiveSeries();

          if (series.kind === 'price-line') {
            const next = chart.addPriceLineSeries();
            next.setPriceLineData(series.data);
            activeSeries = next;
            return;
          }

          const next = chart.addCandlestickSeries();
          next.setCandleData(series.data);
          activeSeries = next;
        },

        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          activeSeries = null;
          chart.remove();
        },
      };
    },
  };
}


/**
 * P17.12 incremental adapter.
 *
 * Full replacement remains explicit via replaceSeries(). Latest/new-item
 * presentation updates reuse the active same-kind series handle instead of
 * destroying and recreating it. This boundary acquires no market data and
 * owns no journal, persistence, calculation, drawing, or navigation truth.
 */
export function createIncrementalChartEnginePortFromDriver(
  driver: ChartEngineDriver,
): IncrementalChartEnginePort {
  return {
    create(container: HTMLElement): IncrementalChartEngineSession {
      const chart = driver.createChart(container);
      let active:
        | { kind: 'price-line'; handle: ChartEngineSeriesHandle }
        | { kind: 'candles'; handle: ChartEngineSeriesHandle }
        | null = null;
      let destroyed = false;

      const assertActive = (): void => {
        if (destroyed) throw new Error('chart-engine-session-destroyed');
      };

      const clearActive = (): void => {
        if (active === null) return;
        chart.removeSeries(active.handle);
        active = null;
      };

      return {
        replaceSeries(series: RendererSeriesProjection): void {
          assertActive();
          clearActive();

          if (series.kind === 'price-line') {
            const handle = chart.addPriceLineSeries();
            handle.setPriceLineData(series.data);
            active = { kind: 'price-line', handle };
            return;
          }

          const handle = chart.addCandlestickSeries();
          handle.setCandleData(series.data);
          active = { kind: 'candles', handle };
        },

        updateLatest(update: ChartIncrementalUpdate): void {
          assertActive();
          if (active === null || active.kind !== update.kind) {
            throw new Error('chart-series-kind-mismatch');
          }

          if (active.kind === 'price-line' && update.kind === 'price-line') {
            active.handle.updatePriceLine(update.point);
            return;
          }

          if (active.kind === 'candles' && update.kind === 'candles') {
            active.handle.updateCandle(update.candle);
            return;
          }

          throw new Error('chart-series-kind-mismatch');
        },

        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          active = null;
          chart.remove();
        },
      };
    },
  };
}
