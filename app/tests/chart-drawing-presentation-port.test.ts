import { describe, expect, it } from 'vitest';
import { createChartDrawingPresentationPort } from '../src/features/chart/chartDrawingPresentationPort';
import type { ChartEngineDriver, ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import type { ChartDrawingLayerPort } from '../src/features/chart/chartDrawingLayerPort';

function createHarness() {
  const events: string[] = [];
  let seriesCounter = 0;

  const makeHandle = (kind: 'line' | 'candles'): ChartEngineSeriesHandle => {
    const id = `${kind}-${++seriesCounter}`;
    return {
      setPriceLineData() { events.push(`set-line:${id}`); },
      setCandleData() { events.push(`set-candles:${id}`); },
      updatePriceLine() {},
      updateCandle() {},
    };
  };

  const driver: ChartEngineDriver = {
    createChart() {
      events.push('chart-create');
      return {
        addPriceLineSeries() { events.push('add-line'); return makeHandle('line'); },
        addCandlestickSeries() { events.push('add-candles'); return makeHandle('candles'); },
        removeSeries() { events.push('remove-series'); },
        remove() { events.push('chart-remove'); },
      };
    },
  };

  const drawingLayer: ChartDrawingLayerPort = {
    attach() {
      events.push('drawing-attach');
      return {
        replaceDrawings(drawings) { events.push(`drawings:${drawings.length}`); },
        destroy() { events.push('drawing-destroy'); },
      };
    },
  };

  return { events, driver, drawingLayer };
}

const priceSeries = {
  kind: 'price-line' as const,
  data: [{ time: 1, value: 100 }],
};
const candleSeries = {
  kind: 'candles' as const,
  data: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }],
};
const drawings = [{
  id: 'trend-1',
  kind: 'trend-line' as const,
  start: { time: 1, value: 1 },
  end: { time: 2, value: 2 },
}];

describe('P18.11 chart drawing presentation coordination', () => {
  it('attaches projected drawings to the exact freshly-created series presentation', () => {
    const { events, driver, drawingLayer } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer).create({} as HTMLElement);
    session.replace(priceSeries, drawings);
    expect(events).toEqual([
      'chart-create', 'add-line', 'set-line:line-1', 'drawing-attach', 'drawings:1',
    ]);
  });

  it('detaches the drawing layer before removing the prior series on replacement', () => {
    const { events, driver, drawingLayer } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer).create({} as HTMLElement);
    session.replace(priceSeries, drawings);
    session.replace(candleSeries, []);
    const destroyIndex = events.indexOf('drawing-destroy');
    const removeIndex = events.indexOf('remove-series');
    expect(destroyIndex).toBeGreaterThan(-1);
    expect(removeIndex).toBeGreaterThan(destroyIndex);
    expect(events.slice(removeIndex + 1)).toEqual([
      'add-candles', 'set-candles:candles-2', 'drawing-attach', 'drawings:0',
    ]);
  });

  it('destroys drawing resources before series and chart resources exactly once', () => {
    const { events, driver, drawingLayer } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer).create({} as HTMLElement);
    session.replace(priceSeries, drawings);
    session.destroy();
    session.destroy();
    expect(events.slice(-3)).toEqual(['drawing-destroy', 'remove-series', 'chart-remove']);
    expect(events.filter((event) => event === 'chart-remove')).toHaveLength(1);
  });
});
