import { describe, expect, it, vi } from 'vitest';
import type { RendererChartDrawing } from '../src/features/chart/chartDrawingProjection';
import {
  createLightweightChartsV5DrawingHoverSubscription,
  type LightweightChartsV5DrawingHoverEventHandler,
} from '../src/features/chart/lightweightChartsV5DrawingHoverSubscription';

const drawings: readonly RendererChartDrawing[] = [
  {
    id: 'trend-1',
    kind: 'trend-line',
    start: { time: 100, value: 10 },
    end: { time: 200, value: 20 },
  },
];

function createChartHarness() {
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

describe('P18.15 Lightweight Charts v5 drawing hover subscription lifecycle', () => {
  it('subscribes once and emits the P18.14 drawing-hover projection', () => {
    const harness = createChartHarness();
    const onHover = vi.fn();
    createLightweightChartsV5DrawingHoverSubscription(harness.chart, drawings, onHover);

    expect(harness.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
    harness.emit({ hoveredObjectId: 'trend-1' });
    expect(onHover).toHaveBeenLastCalledWith({ kind: 'drawing-hover', drawingId: 'trend-1' });
  });

  it('emits null for missing or unrelated provider hover ids so presentation hover can clear', () => {
    const harness = createChartHarness();
    const onHover = vi.fn();
    createLightweightChartsV5DrawingHoverSubscription(harness.chart, drawings, onHover);

    harness.emit({});
    harness.emit({ hoveredObjectId: 'series-marker-1' });
    expect(onHover.mock.calls).toEqual([[null], [null]]);
  });

  it('uses an immutable drawing snapshot for subscription lifetime', () => {
    const mutable = drawings.map((drawing) => ({ ...drawing, start: { ...drawing.start }, end: { ...drawing.end } }));
    const harness = createChartHarness();
    const onHover = vi.fn();
    createLightweightChartsV5DrawingHoverSubscription(harness.chart, mutable, onHover);

    mutable[0].id = 'changed-after-subscribe';
    harness.emit({ hoveredObjectId: 'trend-1' });
    expect(onHover).toHaveBeenLastCalledWith({ kind: 'drawing-hover', drawingId: 'trend-1' });
  });

  it('unsubscribes the same handler exactly once and ignores later delivery', () => {
    const harness = createChartHarness();
    const onHover = vi.fn();
    const subscription = createLightweightChartsV5DrawingHoverSubscription(harness.chart, drawings, onHover);

    subscription.destroy();
    subscription.destroy();
    expect(harness.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
    harness.emit({ hoveredObjectId: 'trend-1' });
    expect(onHover).not.toHaveBeenCalled();
  });
});
