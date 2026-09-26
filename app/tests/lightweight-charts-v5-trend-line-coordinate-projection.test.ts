import { describe, expect, it, vi } from 'vitest';
import {
  projectLightweightChartsV5TrendLineSegments,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawing: RendererChartDrawing = {
  id: 'trend-1',
  kind: 'trend-line',
  start: { time: 100, value: 10 },
  end: { time: 200, value: 20 },
};

describe('P18.5 Lightweight Charts v5 trend-line coordinate projection', () => {
  it('delegates time and price conversion to active provider scale APIs', () => {
    const timeToCoordinate = vi.fn((time: number) => time / 10);
    const priceToCoordinate = vi.fn((price: number) => price * 2);

    expect(projectLightweightChartsV5TrendLineSegments(
      [drawing],
      { timeToCoordinate },
      { priceToCoordinate },
    )).toEqual([{
      id: 'trend-1',
      kind: 'trend-line',
      start: { x: 10, y: 20 },
      end: { x: 20, y: 40 },
    }]);

    expect(timeToCoordinate).toHaveBeenNthCalledWith(1, 100);
    expect(timeToCoordinate).toHaveBeenNthCalledWith(2, 200);
    expect(priceToCoordinate).toHaveBeenNthCalledWith(1, 10);
    expect(priceToCoordinate).toHaveBeenNthCalledWith(2, 20);
  });

  it('omits a segment when any provider coordinate is unavailable', () => {
    expect(projectLightweightChartsV5TrendLineSegments(
      [drawing],
      { timeToCoordinate: (time) => time === 200 ? null : 10 },
      { priceToCoordinate: (price) => price === 20 ? null : 20 },
    )).toEqual([]);
  });

  it('preserves drawing identity while projecting multiple drawings', () => {
    const second: RendererChartDrawing = {
      ...drawing,
      id: 'trend-2',
      start: { time: 300, value: 30 },
      end: { time: 400, value: 40 },
    };
    const result = projectLightweightChartsV5TrendLineSegments(
      [drawing, second],
      { timeToCoordinate: (time) => time },
      { priceToCoordinate: (price) => price },
    );
    expect(result.map((segment) => segment.id)).toEqual(['trend-1', 'trend-2']);
  });
});
