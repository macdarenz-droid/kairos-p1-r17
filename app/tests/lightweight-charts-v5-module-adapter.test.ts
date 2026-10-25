import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5Driver,
  type LightweightChartsV5Module,
} from '../src/features/chart';

describe('P17.6 Lightweight Charts v5 module adapter', () => {
  it('uses v5 addSeries with the injected LineSeries definition', () => {
    const lineSetData = vi.fn();
    const candleSetData = vi.fn();
    let module: LightweightChartsV5Module;
    const addSeries = vi.fn((definition: unknown) => {
      if (definition === module.LineSeries) return { setData: lineSetData, update: vi.fn() };
      return { setData: candleSetData, update: vi.fn() };
    });
    const removeSeries = vi.fn();
    const remove = vi.fn();

    module = {
      createChart: vi.fn(() => ({ timeScale: () => ({
        getVisibleLogicalRange: () => null,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      }), addSeries, removeSeries, remove })),
      LineSeries: {},
      CandlestickSeries: {},
    };

    const chart = createLightweightChartsV5Driver(module)
      .createChart(document.createElement('div'));

    const line = chart.addPriceLineSeries();
    line.setPriceLineData([{ time: 1788393600, value: 100.25 }]);

    expect(addSeries).toHaveBeenCalledWith(module.LineSeries);
    expect(lineSetData).toHaveBeenCalledWith([
      { time: 1788393600, value: 100.25 },
    ]);
  });

  it('uses v5 addSeries with the injected CandlestickSeries definition', () => {
    const candleSetData = vi.fn();
    const module: LightweightChartsV5Module = {
      createChart: () => ({
        timeScale: () => ({
          getVisibleLogicalRange: () => null,
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        }),
        addSeries: vi.fn(() => ({ setData: candleSetData, update: vi.fn() })),
        removeSeries: vi.fn(),
        remove: vi.fn(),
      }),
      LineSeries: {},
      CandlestickSeries: {},
    };

    const chart = createLightweightChartsV5Driver(module)
      .createChart(document.createElement('div'));

    const candles = chart.addCandlestickSeries();
    candles.setCandleData([{
      time: 1788393600,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
    }]);

    expect(candleSetData).toHaveBeenCalledTimes(1);
  });

  it('maps Kairos handles back to vendor series for irreversible removal', () => {
    const vendorSeries = { setData: vi.fn(), update: vi.fn() };
    const removeSeries = vi.fn();
    const remove = vi.fn();

    const module: LightweightChartsV5Module = {
      createChart: () => ({
        timeScale: () => ({
          getVisibleLogicalRange: () => null,
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        }),
        addSeries: vi.fn(() => vendorSeries),
        removeSeries,
        remove,
      }),
      LineSeries: {},
      CandlestickSeries: {},
    };

    const chart = createLightweightChartsV5Driver(module)
      .createChart(document.createElement('div'));

    const handle = chart.addPriceLineSeries();
    chart.removeSeries(handle);

    expect(removeSeries).toHaveBeenCalledWith(vendorSeries);
    expect(() => chart.removeSeries(handle))
      .toThrow('chart-series-handle-unknown');

    chart.remove();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
