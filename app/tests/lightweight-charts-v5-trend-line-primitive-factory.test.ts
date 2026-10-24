import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5TrendLinePrimitiveFactory,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawing: RendererChartDrawing = {
  id: 'trend-1',
  kind: 'trend-line',
  start: { time: 10, value: 20 },
  end: { time: 30, value: 40 },
};

function attachAndDraw(primitive: ReturnType<ReturnType<typeof createLightweightChartsV5TrendLinePrimitiveFactory>['create']>) {
  primitive.attached({
    chart: { timeScale: () => ({ timeToCoordinate: (time) => time + 1 }) },
    series: { priceToCoordinate: (price) => price + 2 },
    requestUpdate: vi.fn(),
  });
  primitive.updateAllViews();

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

describe('P18.8 Lightweight Charts v5 trend-line primitive factory', () => {
  it('binds P18.7 primitive creation to injected presentation style', () => {
    const factory = createLightweightChartsV5TrendLinePrimitiveFactory({ color: '#abc', lineWidth: 2 });
    const primitive = factory.create([drawing]);
    const context = attachAndDraw(primitive);

    expect(context.strokeStyle).toBe('#abc');
    expect(context.lineWidth).toBe(2);
    expect(context.moveTo).toHaveBeenCalledWith(11, 22);
    expect(context.lineTo).toHaveBeenCalledWith(31, 42);
  });

  it('creates a fresh primitive for each P18.4 replacement cycle', () => {
    const factory = createLightweightChartsV5TrendLinePrimitiveFactory({ color: '#fff', lineWidth: 1 });
    expect(factory.create([drawing])).not.toBe(factory.create([drawing]));
  });

  it('snapshots presentation style at factory construction', () => {
    const style = { color: '#111', lineWidth: 1 };
    const factory = createLightweightChartsV5TrendLinePrimitiveFactory(style);
    style.color = '#f00';
    style.lineWidth = 9;

    const context = attachAndDraw(factory.create([drawing]));
    expect(context.strokeStyle).toBe('#111');
    expect(context.lineWidth).toBe(1);
  });
});
