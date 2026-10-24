import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5DriverBinding,
  type LightweightChartsV5Module,
} from '../src/features/chart';

function createModule() {
  const lineSeries = { setData: vi.fn(), update: vi.fn() };
  const candleSeries = { setData: vi.fn(), update: vi.fn() };
  const chart = {
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    }),
    addSeries(definition: unknown) {
      return definition === module.LineSeries ? lineSeries : candleSeries;
    },
    removeSeries: vi.fn(),
    remove: vi.fn(),
  };
  const module: LightweightChartsV5Module = {
    createChart: () => chart,
    LineSeries: { __kairosSeriesData: undefined },
    CandlestickSeries: { __kairosSeriesData: undefined },
  };
  return { module, chart };
}

describe('P18.16 Lightweight Charts v5 provider chart resolution binding', () => {
  it('resolves a neutral series handle to the exact provider chart that created it', () => {
    const { module, chart: providerChart } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addPriceLineSeries();

    expect(binding.resolveChart(handle)).toBe(providerChart);
  });

  it('fails closed after the owning series handle is removed', () => {
    const { module } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addCandlestickSeries();

    chart.removeSeries(handle);
    expect(() => binding.resolveChart(handle)).toThrow('chart-series-handle-unknown');
  });

  it('fails closed after the chart is removed', () => {
    const { module } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addPriceLineSeries();

    chart.remove();
    expect(() => binding.resolveChart(handle)).toThrow('chart-series-handle-unknown');
  });
});
