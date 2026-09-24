import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import type { RendererChartDrawing } from '../src/features/chart/chartDrawingProjection';
import {
  createLightweightChartsV5DrawingHoverSubscriptionFromBinding,
  type LightweightChartsV5DrawingHoverEventHandler,
} from '../src/features/chart';

const handle = {} as ChartEngineSeriesHandle;
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

describe('P18.17 Lightweight Charts v5 drawing hover binding composition', () => {
  it('resolves the provider chart for the neutral handle and delegates hover lifecycle/projection', () => {
    const harness = createHoverChartHarness();
    const resolveChart = vi.fn(() => harness.chart as never);
    const onHover = vi.fn();

    createLightweightChartsV5DrawingHoverSubscriptionFromBinding(
      { resolveChart },
      handle,
      drawings,
      onHover,
    );

    expect(resolveChart).toHaveBeenCalledTimes(1);
    expect(resolveChart).toHaveBeenCalledWith(handle);
    expect(harness.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
    harness.emit({ hoveredObjectId: 'trend-1' });
    expect(onHover).toHaveBeenLastCalledWith({ kind: 'drawing-hover', drawingId: 'trend-1' });
  });

  it('fails closed when the resolved provider chart does not expose hover subscription capability', () => {
    const resolveChart = vi.fn(() => ({}) as never);
    const onHover = vi.fn();

    expect(() =>
      createLightweightChartsV5DrawingHoverSubscriptionFromBinding(
        { resolveChart },
        handle,
        drawings,
        onHover,
      ),
    ).toThrow('chart-drawing-hover-capability-unavailable');
    expect(onHover).not.toHaveBeenCalled();
  });

  it('delegates destroy to P18.15R1 so the exact provider handler is unsubscribed once', () => {
    const harness = createHoverChartHarness();
    const subscription = createLightweightChartsV5DrawingHoverSubscriptionFromBinding(
      { resolveChart: () => harness.chart as never },
      handle,
      drawings,
      vi.fn(),
    );

    subscription.destroy();
    subscription.destroy();
    expect(harness.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
  });
});
