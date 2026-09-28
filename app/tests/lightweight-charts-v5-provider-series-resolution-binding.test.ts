import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5DriverBinding,
  type LightweightChartsV5Module,
} from '../src/features/chart';

function createModule() {
  const lineSeries = { setData: vi.fn(), update: vi.fn() };
  const candleSeries = { setData: vi.fn(), update: vi.fn() };
  const removeSeries = vi.fn();
  const remove = vi.fn();
  const chart = {
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    }),
    addSeries(definition: unknown) {
      return definition === module.LineSeries ? lineSeries : candleSeries;
    },
    removeSeries,
    remove,
  };
  const module: LightweightChartsV5Module = {
    createChart: () => chart,
    LineSeries: { __kairosSeriesData: undefined },
    CandlestickSeries: { __kairosSeriesData: undefined },
  };
  return { module, lineSeries, candleSeries, removeSeries, remove };
}

describe('P18.9 Lightweight Charts v5 provider series resolution binding', () => {
  it('resolves neutral handles to the exact vendor series created by the same binding', () => {
    const { module, lineSeries, candleSeries } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));

    const lineHandle = chart.addPriceLineSeries();
    const candleHandle = chart.addCandlestickSeries();

    expect(binding.resolveSeries(lineHandle)).toBe(lineSeries);
    expect(binding.resolveSeries(candleHandle)).toBe(candleSeries);
  });

  it('fails closed after a series handle is removed', () => {
    const { module } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addPriceLineSeries();

    chart.removeSeries(handle);
    expect(() => binding.resolveSeries(handle)).toThrow('chart-series-handle-unknown');
  });

  it('clears provider resolution when the chart is removed', () => {
    const { module } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addCandlestickSeries();

    chart.remove();
    expect(() => binding.resolveSeries(handle)).toThrow('chart-series-handle-unknown');
  });
});
