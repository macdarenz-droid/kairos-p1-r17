import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5TrendLinePaneRenderer,
  type LightweightChartsV5TrendLineScreenSegment,
} from '../src/features/chart';

const segment: LightweightChartsV5TrendLineScreenSegment = {
  id: 'trend-1',
  kind: 'trend-line',
  start: { x: 10, y: 20 },
  end: { x: 30, y: 40 },
};

function createTarget(horizontalPixelRatio = 2, verticalPixelRatio = 3) {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
  };
  const useBitmapCoordinateSpace = vi.fn((draw: (scope: any) => void) => {
    draw({ context, horizontalPixelRatio, verticalPixelRatio });
  });
  return { context, target: { useBitmapCoordinateSpace } };
}

describe('P18.6 Lightweight Charts v5 trend-line pane renderer', () => {
  it('draws projected media coordinates in provider bitmap coordinate space', () => {
    const { context, target } = createTarget();
    const renderer = createLightweightChartsV5TrendLinePaneRenderer(
      [segment],
      { color: '#ffffff', lineWidth: 2 },
    );

    renderer.draw(target as never);

    expect(context.strokeStyle).toBe('#ffffff');
    expect(context.lineWidth).toBe(4);
    expect(context.moveTo).toHaveBeenCalledWith(20, 60);
    expect(context.lineTo).toHaveBeenCalledWith(60, 120);
    expect(context.stroke).toHaveBeenCalledTimes(1);
  });

  it('renders every supplied segment without owning coordinate conversion', () => {
    const { context, target } = createTarget(1, 1);
    const renderer = createLightweightChartsV5TrendLinePaneRenderer(
      [segment, { ...segment, id: 'trend-2', start: { x: 5, y: 6 }, end: { x: 7, y: 8 } }],
      { color: '#aaa', lineWidth: 1 },
    );

    renderer.draw(target as never);

    expect(context.beginPath).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.moveTo).toHaveBeenNthCalledWith(2, 5, 6);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 7, 8);
  });

  it('snapshots segment geometry so later caller mutation cannot alter a renderer frame', () => {
    const mutable = { ...segment, start: { ...segment.start }, end: { ...segment.end } };
    const { context, target } = createTarget(1, 1);
    const renderer = createLightweightChartsV5TrendLinePaneRenderer(
      [mutable],
      { color: '#fff', lineWidth: 1 },
    );
    mutable.start.x = 999;

    renderer.draw(target as never);

    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
  });
});
