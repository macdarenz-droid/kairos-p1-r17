import { describe, expect, it, vi } from 'vitest';
import {
  createIncrementalChartEnginePortFromDriver,
  createLightweightChartsV5Driver,
  type ChartEngineDriver,
  type ChartEngineSeriesHandle,
  type LightweightChartsV5Module,
} from '../src/features/chart';

function handle(): ChartEngineSeriesHandle {
  return {
    setPriceLineData: vi.fn(),
    setCandleData: vi.fn(),
    updatePriceLine: vi.fn(),
    updateCandle: vi.fn(),
  };
}

describe('P17.12 incremental chart engine driver composition', () => {
  it('reuses the active same-kind series for latest/new line updates', () => {
    const line = handle();
    const removeSeries = vi.fn();
    const driver: ChartEngineDriver = {
      createChart: () => ({
        addPriceLineSeries: () => line,
        addCandlestickSeries: handle,
        removeSeries,
        remove: vi.fn(),
      }),
    };

    const session = createIncrementalChartEnginePortFromDriver(driver)
      .create(document.createElement('div'));

    session.replaceSeries({
      kind: 'price-line',
      data: [{ time: 1788393600, value: 100 }],
    });
    session.updateLatest({
      kind: 'price-line',
      point: { time: 1788393660, value: 101 },
    });

    expect(line.updatePriceLine).toHaveBeenCalledWith({
      time: 1788393660,
      value: 101,
    });
    expect(removeSeries).not.toHaveBeenCalled();
  });

  it('rejects cross-kind incremental updates without replacing the active series', () => {
    const line = handle();
    const removeSeries = vi.fn();
    const driver: ChartEngineDriver = {
      createChart: () => ({
        addPriceLineSeries: () => line,
        addCandlestickSeries: handle,
        removeSeries,
        remove: vi.fn(),
      }),
    };
    const session = createIncrementalChartEnginePortFromDriver(driver)
      .create(document.createElement('div'));
    session.replaceSeries({ kind: 'price-line', data: [] });

    expect(() => session.updateLatest({
      kind: 'candles',
      candle: { time: 1788393660, open: 100, high: 102, low: 99, close: 101 },
    })).toThrow('chart-series-kind-mismatch');
    expect(removeSeries).not.toHaveBeenCalled();
  });

  it('maps the incremental handle to Lightweight Charts v5 series.update()', () => {
    const update = vi.fn();
    const setData = vi.fn();
    const vendorSeries = { setData, update };
    const module: LightweightChartsV5Module = {
      createChart: () => ({
        timeScale: () => ({
          getVisibleLogicalRange: () => null,
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        }),
        addSeries: () => vendorSeries,
        removeSeries: vi.fn(),
        remove: vi.fn(),
      }),
      LineSeries: {},
      CandlestickSeries: {},
    };

    const driver = createLightweightChartsV5Driver(module);
    const session = createIncrementalChartEnginePortFromDriver(driver)
      .create(document.createElement('div'));

    session.replaceSeries({
      kind: 'price-line',
      data: [{ time: 1788393600, value: 100 }],
    });
    session.updateLatest({
      kind: 'price-line',
      point: { time: 1788393660, value: 101 },
    });

    expect(setData).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ time: 1788393660, value: 101 });
  });
});
