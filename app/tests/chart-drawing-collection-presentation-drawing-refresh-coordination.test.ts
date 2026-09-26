import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingCollectionPort,
  refreshChartDrawingPresentationFromCollection,
} from '../src/features/chart';
import { parsePositiveDecimalString, type DecimalString } from '../src/domain/trades';
import type { ChartTrendLineDrawing } from '../src/features/chart/chartDrawingContract';
import type { ChartDrawingPresentationDrawingRefreshSession } from '../src/features/chart/chartDrawingPresentationPort';

function decimal(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid positive decimal fixture: ${value}`);
  return parsed.value;
}

function drawing(id: string, startTime: string, startPrice: string, endTime: string, endPrice: string): ChartTrendLineDrawing {
  return {
    id,
    kind: 'trend-line',
    start: { timestamp: startTime, price: decimal(startPrice) },
    end: { timestamp: endTime, price: decimal(endPrice) },
  };
}

function presentation(replaceDrawings = vi.fn()): ChartDrawingPresentationDrawingRefreshSession {
  return {
    replace() {},
    replaceDrawings,
    destroy() {},
  };
}

describe('P18.47 chart drawing collection presentation drawing-refresh coordination', () => {
  it('refreshes the current committed collection through the drawing-only presentation path', () => {
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(drawing('drawing-a', '1970-01-01T00:16:40.000Z', '10.25', '1970-01-01T00:33:20.000Z', '11.5'));
    collection.addDrawing(drawing('drawing-b', '1970-01-01T00:50:00.000Z', '12', '1970-01-01T01:06:40.000Z', '13.75'));
    const replaceDrawings = vi.fn();
    const session = presentation(replaceDrawings);

    refreshChartDrawingPresentationFromCollection(session, collection);

    expect(replaceDrawings).toHaveBeenCalledTimes(1);
    expect(replaceDrawings).toHaveBeenCalledWith([
      {
        id: 'drawing-a',
        kind: 'trend-line',
        start: { time: 1000, value: 10.25 },
        end: { time: 2000, value: 11.5 },
      },
      {
        id: 'drawing-b',
        kind: 'trend-line',
        start: { time: 3000, value: 12 },
        end: { time: 4000, value: 13.75 },
      },
    ]);
  });

  it('refreshes an empty committed collection as an empty renderer snapshot', () => {
    const collection = createChartDrawingCollectionPort().create();
    const replaceDrawings = vi.fn();

    refreshChartDrawingPresentationFromCollection(presentation(replaceDrawings), collection);

    expect(replaceDrawings).toHaveBeenCalledWith([]);
  });

  it('fails closed before presentation refresh when the collection is destroyed', () => {
    const collection = createChartDrawingCollectionPort().create();
    collection.destroy();
    const replaceDrawings = vi.fn();

    expect(() => refreshChartDrawingPresentationFromCollection(presentation(replaceDrawings), collection)).toThrow(
      'chart-drawing-collection-destroyed',
    );
    expect(replaceDrawings).not.toHaveBeenCalled();
  });
});
