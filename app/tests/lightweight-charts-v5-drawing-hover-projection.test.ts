import { describe, expect, it } from 'vitest';
import {
  projectLightweightChartsV5DrawingHover,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawings: readonly RendererChartDrawing[] = [
  {
    id: 'trend-1',
    kind: 'trend-line',
    start: { time: 10, value: 20 },
    end: { time: 30, value: 40 },
  },
  {
    id: 'trend-2',
    kind: 'trend-line',
    start: { time: 40, value: 50 },
    end: { time: 60, value: 70 },
  },
];

describe('P18.14 Lightweight Charts v5 drawing hover projection', () => {
  it('projects a provider hoveredObjectId that belongs to the current drawing snapshot', () => {
    expect(projectLightweightChartsV5DrawingHover(drawings, { hoveredObjectId: 'trend-2' })).toEqual({
      kind: 'drawing-hover',
      drawingId: 'trend-2',
    });
  });

  it('fails closed when the provider event has no hovered object', () => {
    expect(projectLightweightChartsV5DrawingHover(drawings, {})).toBeNull();
  });

  it('fails closed for unrelated provider object ids', () => {
    expect(projectLightweightChartsV5DrawingHover(drawings, { hoveredObjectId: 'series-marker-1' })).toBeNull();
  });

  it('uses the current drawing snapshot rather than accepting stale drawing ids', () => {
    expect(projectLightweightChartsV5DrawingHover(drawings.slice(1), { hoveredObjectId: 'trend-1' })).toBeNull();
  });
});
