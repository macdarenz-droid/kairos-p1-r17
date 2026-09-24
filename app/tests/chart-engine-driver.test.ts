import { describe, expect, it, vi } from 'vitest';
import {
  createChartEnginePortFromDriver,
  type ChartEngineDriver,
  type ChartEngineSeriesHandle,
} from '../src/features/chart';

function createSeriesHandle(): ChartEngineSeriesHandle {
  return {
    setPriceLineData: vi.fn(),
    setCandleData: vi.fn(),
    updatePriceLine: vi.fn(),
    updateCandle: vi.fn(),
  };
}

describe('P17.5 chart engine driver adapter', () => {
  it('maps price-line projection to one driver-owned series', () => {
    const line = createSeriesHandle();
    const candle = createSeriesHandle();
    const removeSeries = vi.fn();
    const remove = vi.fn();

    const driver: ChartEngineDriver = {
      createChart: vi.fn(() => ({
        addPriceLineSeries: vi.fn(() => line),
        addCandlestickSeries: vi.fn(() => candle),
        removeSeries,
        remove,
      })),
    };

    const session = createChartEnginePortFromDriver(driver)
      .create(document.createElement('div'));

    session.replaceSeries({
      kind: 'price-line',
      data: [{ time: 1788393600, value: 100.25 }],
    });

    expect(line.setPriceLineData).toHaveBeenCalledWith([
      { time: 1788393600, value: 100.25 },
    ]);
    expect(candle.setCandleData).not.toHaveBeenCalled();
  });

  it('removes the previous visual series before changing series kind', () => {
    const line = createSeriesHandle();
    const candle = createSeriesHandle();
    const removeSeries = vi.fn();

    const driver: ChartEngineDriver = {
      createChart: () => ({
        addPriceLineSeries: () => line,
        addCandlestickSeries: () => candle,
        removeSeries,
        remove: vi.fn(),
      }),
    };

    const session = createChartEnginePortFromDriver(driver)
      .create(document.createElement('div'));

    session.replaceSeries({
      kind: 'price-line',
      data: [{ time: 1788393600, value: 100 }],
    });
    session.replaceSeries({
      kind: 'candles',
      data: [{
        time: 1788393600,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
      }],
    });

    expect(removeSeries).toHaveBeenCalledTimes(1);
    expect(removeSeries).toHaveBeenCalledWith(line);
    expect(candle.setCandleData).toHaveBeenCalledTimes(1);
  });

  it('destroys the chart once and rejects replacement after destroy', () => {
    const remove = vi.fn();
    const driver: ChartEngineDriver = {
      createChart: () => ({
        addPriceLineSeries: createSeriesHandle,
        addCandlestickSeries: createSeriesHandle,
        removeSeries: vi.fn(),
        remove,
      }),
    };

    const session = createChartEnginePortFromDriver(driver)
      .create(document.createElement('div'));

    session.destroy();
    session.destroy();
    expect(remove).toHaveBeenCalledTimes(1);

    expect(() => session.replaceSeries({
      kind: 'price-line',
      data: [],
    })).toThrow('chart-engine-session-destroyed');
  });
});
