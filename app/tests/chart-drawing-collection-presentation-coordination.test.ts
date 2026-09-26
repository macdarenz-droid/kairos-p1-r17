import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingCollectionPort,
  replaceChartDrawingPresentationFromCollection,
} from '../src/features/chart';
import { parsePositiveDecimalString, type DecimalString } from '../src/domain/trades';
import type { ChartTrendLineDrawing } from '../src/features/chart/chartDrawingContract';
import type { ChartDrawingPresentationSession } from '../src/features/chart/chartDrawingPresentationPort';
import type { RendererSeriesProjection } from '../src/features/chart/chartSeriesProjection';

const series: RendererSeriesProjection = {
  kind: 'price-line',
  data: [{ time: 1000, value: 10 }],
};

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

describe('P18.37 chart drawing collection presentation coordination', () => {
  it('projects one committed collection snapshot in insertion order and presents it once', () => {
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(drawing('drawing-a', '1970-01-01T00:16:40.000Z', '10.25', '1970-01-01T00:33:20.000Z', '11.5'));
    collection.addDrawing(drawing('drawing-b', '1970-01-01T00:50:00.000Z', '12', '1970-01-01T01:06:40.000Z', '13.75'));

    const replace = vi.fn();
    const presentation: ChartDrawingPresentationSession = { replace, destroy() {} };

    replaceChartDrawingPresentationFromCollection(presentation, series, collection);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(series, [
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

  it('presents an empty renderer drawing snapshot when the committed collection is empty', () => {
    const collection = createChartDrawingCollectionPort().create();
    const replace = vi.fn();
    const presentation: ChartDrawingPresentationSession = { replace, destroy() {} };

    replaceChartDrawingPresentationFromCollection(presentation, series, collection);

    expect(replace).toHaveBeenCalledWith(series, []);
  });

  it('fails closed before presentation when the authoritative collection session is destroyed', () => {
    const collection = createChartDrawingCollectionPort().create();
    collection.destroy();
    const replace = vi.fn();
    const presentation: ChartDrawingPresentationSession = { replace, destroy() {} };

    expect(() => replaceChartDrawingPresentationFromCollection(presentation, series, collection)).toThrow(
      'chart-drawing-collection-destroyed',
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
