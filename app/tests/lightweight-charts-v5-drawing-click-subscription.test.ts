import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5DrawingClickSubscription,
  type LightweightChartsV5DrawingClickEventHandler,
} from '../src/features/chart/lightweightChartsV5DrawingClickSubscription';

function createChartHarness() {
  let handler: LightweightChartsV5DrawingClickEventHandler | null = null;
  const subscribeClick = vi.fn((next: LightweightChartsV5DrawingClickEventHandler) => {
    handler = next;
  });
  const unsubscribeClick = vi.fn((next: LightweightChartsV5DrawingClickEventHandler) => {
    expect(next).toBe(handler);
  });

  return {
    chart: { subscribeClick, unsubscribeClick },
    emit(event: Parameters<LightweightChartsV5DrawingClickEventHandler>[0]) {
      if (handler === null) throw new Error('test-click-handler-not-subscribed');
      handler(event);
    },
    subscribeClick,
    unsubscribeClick,
  };
}

describe('P18.26 Lightweight Charts v5 drawing click subscription lifecycle', () => {
  it('subscribes once and emits the P18.25R1 projected drawing anchor', () => {
    const harness = createChartHarness();
    const onAnchor = vi.fn();
    const series = { coordinateToPrice: vi.fn(() => 123.45) };

    createLightweightChartsV5DrawingClickSubscription(harness.chart, series, onAnchor);

    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);
    harness.emit({ time: 1_700_000_000, point: { x: 12, y: 34 } });

    expect(series.coordinateToPrice).toHaveBeenCalledWith(34);
    expect(onAnchor).toHaveBeenLastCalledWith({
      timestamp: new Date(1_700_000_000 * 1000).toISOString(),
      price: '123.45',
    });
  });

  it('emits null when provider click evidence cannot produce an anchor', () => {
    const harness = createChartHarness();
    const onAnchor = vi.fn();
    const series = { coordinateToPrice: vi.fn(() => null) };

    createLightweightChartsV5DrawingClickSubscription(harness.chart, series, onAnchor);

    harness.emit({});
    harness.emit({ time: 1_700_000_000, point: { x: 12, y: 34 } });
    expect(onAnchor.mock.calls).toEqual([[null], [null]]);
  });

  it('delegates every valid click projection to the active provider series price owner', () => {
    const harness = createChartHarness();
    const onAnchor = vi.fn();
    const series = { coordinateToPrice: vi.fn((coordinate: number) => coordinate / 10) };

    createLightweightChartsV5DrawingClickSubscription(harness.chart, series, onAnchor);

    harness.emit({ time: 1_700_000_000, point: { x: 1, y: 25 } });
    harness.emit({ time: 1_700_000_001, point: { x: 2, y: 50 } });

    expect(series.coordinateToPrice.mock.calls).toEqual([[25], [50]]);
    expect(onAnchor).toHaveBeenCalledTimes(2);
  });


  it('fans out the exact provider click event before anchor projection without a second subscription', () => {
    const harness = createChartHarness();
    const calls: string[] = [];
    const onProviderClick = vi.fn((event: Parameters<LightweightChartsV5DrawingClickEventHandler>[0]) => {
      calls.push('provider');
      expect(event.hoveredInfo?.objectId).toBe('drawing-1');
    });
    const onAnchor = vi.fn(() => {
      calls.push('anchor');
    });
    const series = { coordinateToPrice: vi.fn(() => 42) };
    const event = {
      time: 1_700_000_000,
      point: { x: 12, y: 34 },
      hoveredInfo: {
        sourceKind: 'series-primitive' as const,
        objectKind: 'primitive' as const,
        objectId: 'drawing-1',
      },
    };

    createLightweightChartsV5DrawingClickSubscription(
      harness.chart,
      series,
      onAnchor,
      onProviderClick,
    );

    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);
    harness.emit(event);
    expect(onProviderClick).toHaveBeenCalledWith(event);
    expect(onAnchor).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['provider', 'anchor']);
  });

  it('unsubscribes the same handler exactly once and ignores later delivery', () => {
    const harness = createChartHarness();
    const onAnchor = vi.fn();
    const series = { coordinateToPrice: vi.fn(() => 10) };
    const subscription = createLightweightChartsV5DrawingClickSubscription(
      harness.chart,
      series,
      onAnchor,
    );

    subscription.destroy();
    subscription.destroy();

    expect(harness.unsubscribeClick).toHaveBeenCalledTimes(1);
    harness.emit({ time: 1_700_000_000, point: { x: 12, y: 34 } });
    expect(onAnchor).not.toHaveBeenCalled();
  });
});
