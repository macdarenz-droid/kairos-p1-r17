import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5TrendLinePrimitive,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawing: RendererChartDrawing = {
  id: 'trend-1',
  kind: 'trend-line',
  start: { time: 10, value: 20 },
  end: { time: 30, value: 40 },
};

function drawCalls(primitive: ReturnType<typeof createLightweightChartsV5TrendLinePrimitive>) {
  const context = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: '', lineWidth: 0,
  };
  const target = {
    useBitmapCoordinateSpace(draw: (scope: any) => void) {
      draw({ context, horizontalPixelRatio: 1, verticalPixelRatio: 1 });
    },
  };
  primitive.paneViews()[0].renderer().draw(target as never);
  return context;
}

describe('P18.7 Lightweight Charts v5 trend-line primitive view composition', () => {
  it('projects through attached provider scales during updateAllViews and exposes the P18.6 renderer', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    primitive.attached({
      chart: { timeScale: () => ({ timeToCoordinate: (time) => time + 1 }) },
      series: { priceToCoordinate: (price) => price + 2 },
      requestUpdate: vi.fn(),
    });

    primitive.updateAllViews();
    const context = drawCalls(primitive);

    expect(context.moveTo).toHaveBeenCalledWith(11, 22);
    expect(context.lineTo).toHaveBeenCalledWith(31, 42);
  });

  it('keeps a stable pane-view array while refreshing only its renderer frame', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    const firstViews = primitive.paneViews();
    primitive.attached({
      chart: { timeScale: () => ({ timeToCoordinate: (time) => time }) },
      series: { priceToCoordinate: (price) => price },
      requestUpdate: vi.fn(),
    });
    primitive.updateAllViews();

    expect(primitive.paneViews()).toBe(firstViews);
  });

  it('clears provider presentation geometry when detached', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    primitive.attached({
      chart: { timeScale: () => ({ timeToCoordinate: (time) => time }) },
      series: { priceToCoordinate: (price) => price },
      requestUpdate: vi.fn(),
    });
    primitive.updateAllViews();
    primitive.detached();

    const context = drawCalls(primitive);
    expect(context.stroke).not.toHaveBeenCalled();
  });
});
