import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString, type DecimalString } from '../src/domain/trades';
import {
  projectChartDrawing,
  projectChartDrawings,
  projectChartDrawingAnchor,
  type ChartDrawingAnchor,
  type ChartTrendLineDrawing,
} from '../src/features/chart';

function decimal(value: string): DecimalString {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid positive decimal fixture: ${value}`);
  return parsed.value;
}

describe('P18.2 chart drawing projection boundary', () => {
  it('reuses the chart renderer projection for drawing anchors', () => {
    const anchor: ChartDrawingAnchor = {
      timestamp: '2026-09-03T00:00:00.000Z',
      price: decimal('100.25'),
    };

    expect(projectChartDrawingAnchor(anchor)).toEqual({
      time: 1788393600,
      value: 100.25,
    });
  });

  it('projects a trend line without changing drawing identity or kind', () => {
    const drawing: ChartTrendLineDrawing = {
      id: 'drawing-1',
      kind: 'trend-line',
      start: {
        timestamp: '2026-09-03T00:00:00.000Z',
        price: decimal('100'),
      },
      end: {
        timestamp: '2026-09-03T00:05:00.000Z',
        price: decimal('105.5'),
      },
    };

    expect(projectChartDrawing(drawing)).toEqual({
      id: 'drawing-1',
      kind: 'trend-line',
      start: { time: 1788393600, value: 100 },
      end: { time: 1788393900, value: 105.5 },
    });
  });

  it('keeps the source drawing anchored in DecimalString truth', () => {
    const price = decimal('101.125');
    const drawing: ChartTrendLineDrawing = {
      id: 'drawing-2',
      kind: 'trend-line',
      start: { timestamp: '2026-09-03T00:00:00.000Z', price },
      end: { timestamp: '2026-09-03T00:01:00.000Z', price },
    };

    projectChartDrawing(drawing);
    expect(drawing.start.price).toBe(price);
    expect(drawing.end.price).toBe(price);
  });

  it('inherits invalid-time rejection from the existing chart projection owner', () => {
    expect(() => projectChartDrawingAnchor({
      timestamp: 'not-a-time',
      price: decimal('100'),
    })).toThrow('invalid-chart-timestamp');
  });
});

describe('P18.36 chart drawing collection projection', () => {
  it('projects an ordered committed drawing snapshot through the existing P18.2 owner', () => {
    const drawings: readonly ChartTrendLineDrawing[] = [
      {
        id: 'drawing-a',
        kind: 'trend-line',
        start: { timestamp: '2026-09-03T00:00:00.000Z', price: decimal('100') },
        end: { timestamp: '2026-09-03T00:01:00.000Z', price: decimal('101') },
      },
      {
        id: 'drawing-b',
        kind: 'trend-line',
        start: { timestamp: '2026-09-03T00:02:00.000Z', price: decimal('102') },
        end: { timestamp: '2026-09-03T00:03:00.000Z', price: decimal('103') },
      },
    ];

    expect(projectChartDrawings(drawings)).toEqual([
      {
        id: 'drawing-a',
        kind: 'trend-line',
        start: { time: 1788393600, value: 100 },
        end: { time: 1788393660, value: 101 },
      },
      {
        id: 'drawing-b',
        kind: 'trend-line',
        start: { time: 1788393720, value: 102 },
        end: { time: 1788393780, value: 103 },
      },
    ]);
  });

  it('returns an empty renderer snapshot for an empty committed collection', () => {
    expect(projectChartDrawings([])).toEqual([]);
  });

  it('does not mutate the source drawing snapshot', () => {
    const drawing: ChartTrendLineDrawing = {
      id: 'drawing-c',
      kind: 'trend-line',
      start: { timestamp: '2026-09-03T00:04:00.000Z', price: decimal('104') },
      end: { timestamp: '2026-09-03T00:05:00.000Z', price: decimal('105') },
    };
    const before = JSON.stringify(drawing);

    projectChartDrawings([drawing]);

    expect(JSON.stringify(drawing)).toBe(before);
  });
});

