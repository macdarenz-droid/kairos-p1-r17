import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import type { RendererChartDrawing } from '../src/features/chart/chartDrawingProjection';
import {
  createLightweightChartsV5DrawingHoverPort,
  type LightweightChartsV5DrawingHoverEventHandler,
} from '../src/features/chart';

const series = {} as ChartEngineSeriesHandle;
const drawings: readonly RendererChartDrawing[] = [
  {
    id: 'trend-1',
    kind: 'trend-line',
    start: { time: 100, value: 10 },
    end: { time: 200, value: 20 },
  },
];

function createHoverChartHarness() {
  let handler: LightweightChartsV5DrawingHoverEventHandler | null = null;
  const subscribeCrosshairMove = vi.fn((next: LightweightChartsV5DrawingHoverEventHandler) => {
    handler = next;
  });
  const unsubscribeCrosshairMove = vi.fn((next: LightweightChartsV5DrawingHoverEventHandler) => {
    expect(next).toBe(handler);
  });

  return {
    chart: { subscribeCrosshairMove, unsubscribeCrosshairMove },
    emit(event: { hoveredObjectId?: string }) {
      if (handler === null) throw new Error('test-handler-not-subscribed');
      handler(event);
    },
    subscribeCrosshairMove,
    unsubscribeCrosshairMove,
  };
}

describe('P18.19 Lightweight Charts v5 drawing hover port composition', () => {
  it('connects the neutral hover port to the existing provider hover binding', () => {
    const harness = createHoverChartHarness();
    const resolveChart = vi.fn(() => harness.chart as never);
    const onHover = vi.fn();

    const session = createLightweightChartsV5DrawingHoverPort({ resolveChart }).attach(
      series,
      drawings,
      onHover,
    );

    expect(resolveChart).toHaveBeenCalledTimes(1);
    expect(resolveChart).toHaveBeenCalledWith(series);
    expect(harness.subscribeCrosshairMove).toHaveBeenCalledTimes(1);

    harness.emit({ hoveredObjectId: 'trend-1' });
    expect(onHover).toHaveBeenLastCalledWith({ kind: 'drawing-hover', drawingId: 'trend-1' });

    harness.emit({ hoveredObjectId: 'other-provider-object' });
    expect(onHover).toHaveBeenLastCalledWith(null);

    session.destroy();
    session.destroy();
    expect(harness.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
  });

  it('fails closed through the existing provider binding when hover capability is unavailable', () => {
    const onHover = vi.fn();
    const port = createLightweightChartsV5DrawingHoverPort({ resolveChart: () => ({}) as never });

    expect(() => port.attach(series, drawings, onHover)).toThrow(
      'chart-drawing-hover-capability-unavailable',
    );
    expect(onHover).not.toHaveBeenCalled();
  });
});
