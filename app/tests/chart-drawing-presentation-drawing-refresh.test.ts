import { describe, expect, it } from 'vitest';
import {
  createChartDrawingPresentationPort,
  type ChartDrawingHoverPort,
  type ChartDrawingLayerPort,
  type ChartEngineDriver,
  type ChartEngineSeriesHandle,
} from '../src/features/chart';

const priceSeries = {
  kind: 'price-line' as const,
  data: [{ time: 1, value: 100 }],
};

const drawingA = {
  id: 'trend-1',
  kind: 'trend-line' as const,
  start: { time: 1, value: 1 },
  end: { time: 2, value: 2 },
};

const drawingB = {
  id: 'trend-2',
  kind: 'trend-line' as const,
  start: { time: 3, value: 3 },
  end: { time: 4, value: 4 },
};

function createHarness(options?: { failSecondHoverAttach?: boolean }) {
  const events: string[] = [];
  let hoverAttachCount = 0;

  const handle: ChartEngineSeriesHandle = {
    setPriceLineData() { events.push('set-line'); },
    setCandleData() { events.push('set-candles'); },
    updatePriceLine() {},
    updateCandle() {},
  };

  const driver: ChartEngineDriver = {
    createChart() {
      events.push('chart-create');
      return {
        addPriceLineSeries() { events.push('add-line'); return handle; },
        addCandlestickSeries() { events.push('add-candles'); return handle; },
        removeSeries() { events.push('remove-series'); },
        remove() { events.push('chart-remove'); },
      };
    },
  };

  const drawingLayer: ChartDrawingLayerPort = {
    attach(series) {
      expect(series).toBe(handle);
      events.push('drawing-attach');
      return {
        replaceDrawings(drawings) {
          events.push(`drawings:${drawings.map((drawing) => drawing.id).join(',')}`);
        },
        destroy() { events.push('drawing-destroy'); },
      };
    },
  };

  const hoverPort: ChartDrawingHoverPort = {
    attach(series, drawings) {
      expect(series).toBe(handle);
      hoverAttachCount += 1;
      events.push(`hover-attach:${drawings.map((drawing) => drawing.id).join(',')}`);
      if (options?.failSecondHoverAttach && hoverAttachCount === 2) {
        throw new Error('hover-refresh-failed');
      }
      return {
        destroy() { events.push(`hover-destroy:${hoverAttachCount}`); },
      };
    },
  };

  return { events, driver, drawingLayer, hoverPort };
}

describe('P18.46 chart drawing presentation drawing-only refresh', () => {
  it('refreshes drawings on the existing market series without series or drawing-layer churn', () => {
    const { events, driver, drawingLayer, hoverPort } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer, {
      port: hoverPort,
      onHover() {},
    }).create({} as HTMLElement);

    session.replace(priceSeries, [drawingA]);
    session.replaceDrawings([drawingB]);

    expect(events).toEqual([
      'chart-create',
      'add-line',
      'set-line',
      'drawing-attach',
      'drawings:trend-1',
      'hover-attach:trend-1',
      'drawings:trend-2',
      'hover-attach:trend-2',
      'hover-destroy:2',
    ]);
    expect(events.filter((event) => event === 'add-line')).toHaveLength(1);
    expect(events.filter((event) => event === 'remove-series')).toHaveLength(0);
    expect(events.filter((event) => event === 'drawing-attach')).toHaveLength(1);
    expect(events.filter((event) => event === 'drawing-destroy')).toHaveLength(0);
  });

  it('refreshes drawing-layer state without hover lifecycle work when hover is not configured', () => {
    const { events, driver, drawingLayer } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer).create({} as HTMLElement);

    session.replace(priceSeries, [drawingA]);
    session.replaceDrawings([]);

    expect(events.slice(-1)).toEqual(['drawings:']);
    expect(events.filter((event) => event.startsWith('hover-'))).toHaveLength(0);
    expect(events.filter((event) => event === 'remove-series')).toHaveLength(0);
  });

  it('fails closed before an active series/drawing-layer presentation exists', () => {
    const { driver, drawingLayer } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer).create({} as HTMLElement);

    expect(() => session.replaceDrawings([drawingA])).toThrow('chart-drawing-presentation-inactive');
  });

  it('rolls the drawing layer back and preserves the existing hover/series when hover renewal fails', () => {
    const { events, driver, drawingLayer, hoverPort } = createHarness({ failSecondHoverAttach: true });
    const session = createChartDrawingPresentationPort(driver, drawingLayer, {
      port: hoverPort,
      onHover() {},
    }).create({} as HTMLElement);

    session.replace(priceSeries, [drawingA]);
    expect(() => session.replaceDrawings([drawingB])).toThrow('hover-refresh-failed');

    expect(events.slice(-3)).toEqual([
      'drawings:trend-2',
      'hover-attach:trend-2',
      'drawings:trend-1',
    ]);
    expect(events.filter((event) => event.startsWith('hover-destroy:'))).toHaveLength(0);
    expect(events.filter((event) => event === 'remove-series')).toHaveLength(0);
    expect(events.filter((event) => event === 'drawing-destroy')).toHaveLength(0);
  });

  it('rejects drawing-only refresh after destruction', () => {
    const { driver, drawingLayer } = createHarness();
    const session = createChartDrawingPresentationPort(driver, drawingLayer).create({} as HTMLElement);
    session.replace(priceSeries, [drawingA]);
    session.destroy();

    expect(() => session.replaceDrawings([drawingB])).toThrow('chart-drawing-presentation-destroyed');
  });
});
