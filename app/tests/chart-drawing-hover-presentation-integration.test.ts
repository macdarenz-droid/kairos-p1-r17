import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingPresentationPort,
  type ChartDrawingHoverPort,
  type ChartDrawingLayerPort,
  type ChartEngineDriver,
  type ChartEngineSeriesHandle,
} from '../src/features/chart';

function createHarness() {
  const events: string[] = [];
  let seriesCounter = 0;

  const makeHandle = (): ChartEngineSeriesHandle => {
    const id = `series-${++seriesCounter}`;
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
        addPriceLineSeries() { events.push('add-line'); return makeHandle(); },
        addCandlestickSeries() { events.push('add-candles'); return makeHandle(); },
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

  const hoverPort: ChartDrawingHoverPort = {
    attach(_series, drawings, onHover) {
      events.push(`hover-attach:${drawings.length}`);
      onHover(null);
      return { destroy() { events.push('hover-destroy'); } };
    },
  };

  return { events, driver, drawingLayer, hoverPort };
}

const priceSeries = {
  kind: 'price-line' as const,
  data: [{ time: 1, value: 100 }],
};

const drawings = [{
  id: 'trend-1',
  kind: 'trend-line' as const,
  start: { time: 1, value: 1 },
  end: { time: 2, value: 2 },
}];

describe('P18.20 chart drawing hover presentation integration', () => {
  it('attaches hover to the same active series/drawing snapshot after drawing presentation setup', () => {
    const { events, driver, drawingLayer, hoverPort } = createHarness();
    const onHover = vi.fn();
    const session = createChartDrawingPresentationPort(driver, drawingLayer, {
      port: hoverPort,
      onHover,
    }).create({} as HTMLElement);

    session.replace(priceSeries, drawings);

    expect(events).toEqual([
      'chart-create',
      'add-line',
      'set-line:series-1',
      'drawing-attach',
      'drawings:1',
      'hover-attach:1',
    ]);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('detaches hover before drawing layer and series on replacement and destroy', () => {
    const { events, driver, drawingLayer, hoverPort } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer, {
      port: hoverPort,
      onHover() {},
    }).create({} as HTMLElement);

    session.replace(priceSeries, drawings);
    session.replace(priceSeries, []);

    const firstHoverDestroy = events.indexOf('hover-destroy');
    const firstDrawingDestroy = events.indexOf('drawing-destroy');
    const firstSeriesRemove = events.indexOf('remove-series');
    expect(firstHoverDestroy).toBeGreaterThan(-1);
    expect(firstDrawingDestroy).toBeGreaterThan(firstHoverDestroy);
    expect(firstSeriesRemove).toBeGreaterThan(firstDrawingDestroy);

    session.destroy();
    session.destroy();
    expect(events.slice(-4)).toEqual([
      'hover-destroy',
      'drawing-destroy',
      'remove-series',
      'chart-remove',
    ]);
    expect(events.filter((event) => event === 'chart-remove')).toHaveLength(1);
  });
});
