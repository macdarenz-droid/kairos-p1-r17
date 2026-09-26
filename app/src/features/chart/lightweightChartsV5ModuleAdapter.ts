import type {
  ChartEngineDriver,
  ChartEngineSeriesHandle,
} from './chartEngineDriver';
import type {
  RendererCandle,
  RendererPricePoint,
} from './chartSeriesProjection';
export interface LightweightChartsV5SeriesOptions {
  readonly upColor?: string;
  readonly downColor?: string;
  readonly wickUpColor?: string;
  readonly wickDownColor?: string;
  readonly borderVisible?: boolean;
  readonly priceFormat?: { readonly type: 'price'; readonly precision: number; readonly minMove: number };
}

export interface LightweightChartsV5SeriesApi<TData> {
  applyOptions?(options: LightweightChartsV5SeriesOptions): void;
  setData(data: readonly TData[]): void;
  update(data: TData): void;
}

export interface LightweightChartsV5LogicalRange {
  readonly from: number;
  readonly to: number;
}

export type LightweightChartsV5LogicalRangeChangeHandler = (
  range: LightweightChartsV5LogicalRange | null,
) => void;

export interface LightweightChartsV5TimeScaleApi {
  fitContent?(): void;
  setVisibleLogicalRange?(range: LightweightChartsV5LogicalRange): void;
  /** Times are UTC seconds, as the series data uses. */
  setVisibleRange?(range: { readonly from: number; readonly to: number }): void;
  getVisibleLogicalRange(): LightweightChartsV5LogicalRange | null;
  subscribeVisibleLogicalRangeChange(
    handler: LightweightChartsV5LogicalRangeChangeHandler,
  ): void;
  unsubscribeVisibleLogicalRangeChange(
    handler: LightweightChartsV5LogicalRangeChangeHandler,
  ): void;
}

export interface LightweightChartsV5ChartApi {
  applyOptions?(options: LightweightChartsV5ChartOptions): void;
  timeScale(): LightweightChartsV5TimeScaleApi;
  addSeries<TData>(
    definition: LightweightChartsV5SeriesDefinition<TData>,
  ): LightweightChartsV5SeriesApi<TData>;
  removeSeries(series: LightweightChartsV5SeriesApi<unknown>): void;
  remove(): void;
}

export interface LightweightChartsV5SeriesDefinition<TData> {
  readonly __kairosSeriesData?: TData;
}

export interface LightweightChartsV5ChartOptions {
  readonly autoSize?: boolean;
  readonly localization?: { readonly locale?: string };
  readonly layout?: { readonly background?: { readonly color: string }; readonly textColor?: string; readonly attributionLogo?: boolean };
  readonly timeScale?: { readonly timeVisible?: boolean; readonly secondsVisible?: boolean; readonly rightOffset?: number; readonly borderColor?: string };
  readonly rightPriceScale?: { readonly borderColor?: string };
  readonly grid?: { readonly vertLines?: { readonly color: string }; readonly horzLines?: { readonly color: string } };
  readonly crosshair?: { readonly vertLine?: { readonly color: string }; readonly horzLine?: { readonly color: string } };
  readonly handleScroll?: { readonly vertTouchDrag?: boolean; readonly horzTouchDrag?: boolean };
  readonly kineticScroll?: { readonly touch?: boolean; readonly mouse?: boolean };
}

export interface LightweightChartsV5Module {
  createChart(
    container: HTMLElement,
    options?: LightweightChartsV5ChartOptions,
  ): LightweightChartsV5ChartApi;
  LineSeries: LightweightChartsV5SeriesDefinition<RendererPricePoint>;
  CandlestickSeries: LightweightChartsV5SeriesDefinition<RendererCandle>;
}

export interface LightweightChartsV5DriverBinding {
  readonly driver: ChartEngineDriver;
  resolveSeries(handle: ChartEngineSeriesHandle): LightweightChartsV5SeriesApi<unknown>;
  resolveChart(handle: ChartEngineSeriesHandle): LightweightChartsV5ChartApi;
}

/**
 * P18.9/P18.16 provider-resource resolution invariant:
 * - the neutral ChartEngineSeriesHandle remains free of vendor methods
 * - this binding owns the existing handle-to-vendor-series identity map and the P18.16 handle-to-vendor-chart identity map
 * - resolution fails closed for unknown or already-removed handles
 * - createLightweightChartsV5Driver remains backward-compatible by returning only the neutral driver
 * - no primitive lifecycle, Canvas, drawing projection, interaction, persistence, calculation,
 *   market acquisition, journal truth, or P19 behavior lives here
 */
export function createLightweightChartsV5DriverBinding(
  module: LightweightChartsV5Module,
): LightweightChartsV5DriverBinding {
  const seriesLookup = new Map<
    ChartEngineSeriesHandle,
    LightweightChartsV5SeriesApi<unknown>
  >();
  const chartLookup = new Map<ChartEngineSeriesHandle, LightweightChartsV5ChartApi>();

  const driver: ChartEngineDriver = {
    createChart(container: HTMLElement) {
      const chart = module.createChart(container);

      const wrapLine = (
        series: LightweightChartsV5SeriesApi<RendererPricePoint>,
      ): ChartEngineSeriesHandle => ({
        setPriceLineData(data): void {
          series.setData(data);
        },
        setCandleData(): void {
          throw new Error('chart-series-kind-mismatch');
        },
        updatePriceLine(point): void {
          series.update(point);
        },
        updateCandle(): void {
          throw new Error('chart-series-kind-mismatch');
        },
      });

      const wrapCandles = (
        series: LightweightChartsV5SeriesApi<RendererCandle>,
      ): ChartEngineSeriesHandle => ({
        setPriceLineData(): void {
          throw new Error('chart-series-kind-mismatch');
        },
        setCandleData(data): void {
          series.setData(data);
        },
        updatePriceLine(): void {
          throw new Error('chart-series-kind-mismatch');
        },
        updateCandle(candle): void {
          series.update(candle);
        },
      });

      return {
        addPriceLineSeries(): ChartEngineSeriesHandle {
          const vendorSeries = chart.addSeries(module.LineSeries);
          const handle = wrapLine(vendorSeries);
          seriesLookup.set(
            handle,
            vendorSeries as LightweightChartsV5SeriesApi<unknown>,
          );
          chartLookup.set(handle, chart);
          return handle;
        },

        addCandlestickSeries(): ChartEngineSeriesHandle {
          const vendorSeries = chart.addSeries(module.CandlestickSeries);
          const handle = wrapCandles(vendorSeries);
          seriesLookup.set(
            handle,
            vendorSeries as LightweightChartsV5SeriesApi<unknown>,
          );
          chartLookup.set(handle, chart);
          return handle;
        },

        removeSeries(handle: ChartEngineSeriesHandle): void {
          const vendorSeries = seriesLookup.get(handle);
          if (vendorSeries === undefined) {
            throw new Error('chart-series-handle-unknown');
          }
          seriesLookup.delete(handle);
          chartLookup.delete(handle);
          chart.removeSeries(vendorSeries);
        },

        remove(): void {
          seriesLookup.clear();
          chartLookup.clear();
          chart.remove();
        },
      };
    },
  };

  return {
    driver,
    resolveSeries(handle: ChartEngineSeriesHandle): LightweightChartsV5SeriesApi<unknown> {
      const vendorSeries = seriesLookup.get(handle);
      if (vendorSeries === undefined) {
        throw new Error('chart-series-handle-unknown');
      }
      return vendorSeries;
    },

    resolveChart(handle: ChartEngineSeriesHandle): LightweightChartsV5ChartApi {
      const vendorChart = chartLookup.get(handle);
      if (vendorChart === undefined) {
        throw new Error('chart-series-handle-unknown');
      }
      return vendorChart;
    },
  };
}

export function createLightweightChartsV5Driver(
  module: LightweightChartsV5Module,
): ChartEngineDriver {
  return createLightweightChartsV5DriverBinding(module).driver;
}
