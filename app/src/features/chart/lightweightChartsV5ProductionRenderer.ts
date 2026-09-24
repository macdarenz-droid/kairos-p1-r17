import { createIncrementalChartEnginePortFromDriver, type ChartEngineDriver, type ChartEngineSeriesHandle } from './chartEngineDriver';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5DriverBinding } from './lightweightChartsV5ModuleAdapter';
import { lightweightChartsV5Package } from './lightweightChartsV5Package';
import { createProjectedIncrementalCandleRendererFactory } from './projectedChartRenderer';
import type { ChartTheme } from '../../design-system/themes/chartThemeAdapter';
import type { ChartRendererLifecycle } from './chartRendererLifecycle';
import type { ChartCandle } from './chartRenderContract';
import type { LightweightChartsV5ChartApi, LightweightChartsV5SeriesApi, LightweightChartsV5SeriesOptions } from './lightweightChartsV5ModuleAdapter';
import type { ChartVisibleTimeRange } from './chartVisibleRange';
import { createLightweightChartsV5VisibleRangePort } from './lightweightChartsV5VisibleRange';

export interface PresentedChartRenderer extends ChartRendererLifecycle {
  updateLatestCandle(candle: ChartCandle): void;
  setTheme(theme: ChartTheme): void;
  resetView(): void;
  showRecent(count: number): void;
  /** Moves the view to a time window through the visible-range port; false when nothing is drawn yet or the chart cannot. */
  showTimeRange?(range: ChartVisibleTimeRange): boolean;
  zoom(factor: number): void;
  pan(fraction: number): void;
}

export interface LightweightChartsV5ProductionCandlestickSeriesLifecycle {
  attach(series: LightweightChartsV5SeriesApi<unknown>): void;
  detach(series: LightweightChartsV5SeriesApi<unknown>): void;
}

/**
 * Provider drawing-binding seam: the released P18 compositions resolve the
 * vendor chart and series only through the P18.9/P18.16 driver binding plus
 * the neutral candlestick series handle. This lifecycle reports exactly that
 * pair once the candlestick series exists and clears it when the series or
 * the chart goes away. It exposes no vendor object on the renderer itself.
 */
export interface LightweightChartsV5ProductionDrawingBindingLifecycle {
  attach(binding: LightweightChartsV5DriverBinding, handle: ChartEngineSeriesHandle): void;
  detach(handle: ChartEngineSeriesHandle): void;
}

/** The released P18 click/hover subscriptions call exactly these vendor chart methods through the resolved chart. */
interface LightweightChartsV5VendorChartEvents {
  subscribeClick(handler: unknown): void;
  unsubscribeClick(handler: unknown): void;
  subscribeCrosshairMove(handler: unknown): void;
  unsubscribeCrosshairMove(handler: unknown): void;
}

function forwardVendorChartEvents(chart: LightweightChartsV5ChartApi): LightweightChartsV5VendorChartEvents {
  const vendor = chart as unknown as Partial<LightweightChartsV5VendorChartEvents>;
  const method = (name: keyof LightweightChartsV5VendorChartEvents) => (handler: unknown): void => {
    const target = vendor[name];
    if (typeof target !== 'function') throw new Error(`lightweight-charts-chart-${name}-unavailable`);
    target.call(vendor, handler);
  };
  return {
    subscribeClick: method('subscribeClick'),
    unsubscribeClick: method('unsubscribeClick'),
    subscribeCrosshairMove: method('subscribeCrosshairMove'),
    unsubscribeCrosshairMove: method('unsubscribeCrosshairMove'),
  };
}

function observeCandlestickHandle(
  binding: LightweightChartsV5DriverBinding,
  drawingBindingLifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle,
): ChartEngineDriver {
  return {
    createChart(container) {
      const inner = binding.driver.createChart(container);
      let candlestickHandle: ChartEngineSeriesHandle | null = null;
      const release = () => {
        if (candlestickHandle === null) return;
        const handle = candlestickHandle;
        candlestickHandle = null;
        drawingBindingLifecycle.detach(handle);
      };
      return {
        addPriceLineSeries: () => inner.addPriceLineSeries(),
        addCandlestickSeries() {
          const handle = inner.addCandlestickSeries();
          candlestickHandle = handle;
          drawingBindingLifecycle.attach(binding, handle);
          return handle;
        },
        removeSeries(handle) {
          if (handle === candlestickHandle) release();
          inner.removeSeries(handle);
        },
        remove() {
          release();
          inner.remove();
        },
      };
    },
  };
}

function candleStyle(theme: ChartTheme): LightweightChartsV5SeriesOptions {
  return { upColor: theme.candleUp, downColor: theme.candleDown, wickUpColor: theme.wickUp, wickDownColor: theme.wickDown, borderVisible: false };
}

/**
 * Production composition root for the P17 chart renderer.
 *
 * It binds the verified Lightweight Charts v5 package through the existing
 * Kairos driver and engine boundaries. It owns no feed, journal, persistence,
 * calculation, drawing, or navigation state.
 */
export function createLightweightChartsV5ProductionRendererFactory(
  candlestickSeriesLifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle,
  drawingBindingLifecycle?: LightweightChartsV5ProductionDrawingBindingLifecycle,
) {
  return { create(container: HTMLElement): PresentedChartRenderer {
    let chart: LightweightChartsV5ChartApi;
    let series: LightweightChartsV5SeriesApi<unknown> | null = null;
    let observedCandlestickSeries: LightweightChartsV5SeriesApi<unknown> | null = null;
    let theme: ChartTheme | null = null;
    let displayDecimals = 2;
    let seriesLength = 0;
    let destroyed = false;
    // The P18.9/P18.16 binding keeps the neutral handle → vendor series/chart identity maps; the
    // engine port still receives only the neutral driver (createLightweightChartsV5Driver semantics).
    const binding = createLightweightChartsV5DriverBinding({
        ...lightweightChartsV5Package,
        createChart(container) {
          chart = lightweightChartsV5Package.createChart(container, {
            autoSize: true,
            localization: { locale: 'en-US' },
            timeScale: { timeVisible: true, secondsVisible: true, rightOffset: 3 },
            handleScroll: { vertTouchDrag: false, horzTouchDrag: true },
            kineticScroll: { touch: false, mouse: false },
          });
          const wrapped: LightweightChartsV5ChartApi & LightweightChartsV5VendorChartEvents = {
            ...forwardVendorChartEvents(chart),
            timeScale: () => chart.timeScale(),
            addSeries(definition) {
              const next = chart.addSeries(definition);
              series = next as LightweightChartsV5SeriesApi<unknown>;
              if (definition === lightweightChartsV5Package.CandlestickSeries) {
                observedCandlestickSeries = series;
                candlestickSeriesLifecycle?.attach(series);
              }
              if (theme) next.applyOptions?.(candleStyle(theme));
              next.applyOptions?.({ priceFormat: { type: 'price', precision: displayDecimals, minMove: 10 ** -displayDecimals } });
              return next;
            },
            removeSeries(value) {
              if (observedCandlestickSeries === value) {
                candlestickSeriesLifecycle?.detach(observedCandlestickSeries);
                observedCandlestickSeries = null;
              }
              series = null;
              chart.removeSeries(value);
            },
            remove() {
              if (observedCandlestickSeries !== null) {
                candlestickSeriesLifecycle?.detach(observedCandlestickSeries);
                observedCandlestickSeries = null;
              }
              chart.remove();
            },
          };
          return wrapped;
        },
      });
    const factory = createProjectedIncrementalCandleRendererFactory(
      createIncrementalChartEnginePortFromDriver(
        drawingBindingLifecycle ? observeCandlestickHandle(binding, drawingBindingLifecycle) : binding.driver,
      ),
    );
    const renderer = factory.create(container);
    return {
      render(model) {
        // Display resolution only, derived from supplied decimals; not a trading tick size.
        const values = model.series.kind === 'candles' ? model.series.candles.flatMap(c => [c.open, c.high, c.low, c.close]) : model.series.points.map(p => p.price);
        if (values.some(value => Math.abs(Number(value)) < 1e-12 && /[1-9]/.test(value))) throw new Error('chart-price-resolution-unavailable');
        displayDecimals = Math.min(12, Math.max(0, ...values.map(value => (value.split('.')[1] ?? '').replace(/0+$/, '').length)));
        seriesLength = model.series.kind === 'candles' ? model.series.candles.length : model.series.points.length;
        renderer.render(model);
      },
      updateLatestCandle(candle) {
        if (destroyed) throw new Error('chart-renderer-destroyed');
        renderer.updateLatestCandle(candle);
      },
      setTheme(next) {
        if (destroyed) return;
        theme = next;
        chart.applyOptions?.({
          layout: { background: { color: next.background }, textColor: next.axis, attributionLogo: true },
          grid: { vertLines: { color: next.grid }, horzLines: { color: next.grid } },
          rightPriceScale: { borderColor: next.grid }, timeScale: { borderColor: next.grid },
          crosshair: { vertLine: { color: next.crosshair }, horzLine: { color: next.crosshair } },
        });
        series?.applyOptions?.(candleStyle(next));
      },
      resetView() { if (!destroyed) chart.timeScale().fitContent?.(); },
      showRecent(count) {
        if (destroyed || !Number.isFinite(count) || count <= 0 || !seriesLength) return;
        chart.timeScale().setVisibleLogicalRange?.({ from: Math.max(0, seriesLength - count), to: seriesLength + 2 });
      },
      showTimeRange(range) {
        if (destroyed || !seriesLength) return false;
        return createLightweightChartsV5VisibleRangePort(chart).setVisibleTimeRange(range);
      },
      zoom(factor) {
        if (destroyed || !Number.isFinite(factor) || factor <= 0) return;
        const scale = chart.timeScale(), range = scale.getVisibleLogicalRange();
        if (!range) return;
        const width = Math.min(2000, Math.max(5, (range.to - range.from) * factor));
        const middle = (range.from + range.to) / 2;
        scale.setVisibleLogicalRange?.({ from: middle - width / 2, to: middle + width / 2 });
      },
      pan(fraction) {
        if (destroyed || !Number.isFinite(fraction)) return;
        const scale = chart.timeScale(), range = scale.getVisibleLogicalRange();
        if (!range) return;
        const offset = (range.to - range.from) * fraction;
        scale.setVisibleLogicalRange?.({ from: range.from + offset, to: range.to + offset });
      },
      destroy() { if (destroyed) return; destroyed = true; series = null; renderer.destroy(); },
    };
  } };
}
