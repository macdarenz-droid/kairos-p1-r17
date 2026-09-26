import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import {
  createLightweightChartsV5DrawingClickSubscriptionFromBinding,
  type LightweightChartsV5DrawingClickEventHandler,
} from '../src/features/chart';

const handle = {} as ChartEngineSeriesHandle;

function createClickChartHarness() {
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

describe('P18.27 Lightweight Charts v5 drawing click binding composition', () => {
  it('resolves provider chart and series for the neutral handle and delegates click projection', () => {
    const harness = createClickChartHarness();
    const series = { coordinateToPrice: vi.fn(() => 456.78) };
    const resolveChart = vi.fn(() => harness.chart as never);
    const resolveSeries = vi.fn(() => series as never);
    const onAnchor = vi.fn();

    createLightweightChartsV5DrawingClickSubscriptionFromBinding(
      { resolveChart, resolveSeries },
      handle,
      onAnchor,
    );

    expect(resolveChart).toHaveBeenCalledWith(handle);
    expect(resolveSeries).toHaveBeenCalledWith(handle);
    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);

    harness.emit({ time: 1_700_000_000, point: { x: 12, y: 34 } });
    expect(series.coordinateToPrice).toHaveBeenCalledWith(34);
    expect(onAnchor).toHaveBeenLastCalledWith({
      timestamp: new Date(1_700_000_000 * 1000).toISOString(),
      price: '456.78',
    });
  });

  it('fails closed before subscription when the resolved chart lacks click capability', () => {
    const resolveChart = vi.fn(() => ({}) as never);
    const resolveSeries = vi.fn(() => ({ coordinateToPrice: vi.fn(() => 10) }) as never);

    expect(() =>
      createLightweightChartsV5DrawingClickSubscriptionFromBinding(
        { resolveChart, resolveSeries },
        handle,
        vi.fn(),
      ),
    ).toThrow('chart-drawing-click-capability-unavailable');
  });

  it('fails closed before subscription when the resolved series lacks price-coordinate capability', () => {
    const harness = createClickChartHarness();
    const resolveChart = vi.fn(() => harness.chart as never);
    const resolveSeries = vi.fn(() => ({}) as never);

    expect(() =>
      createLightweightChartsV5DrawingClickSubscriptionFromBinding(
        { resolveChart, resolveSeries },
        handle,
        vi.fn(),
      ),
    ).toThrow('chart-drawing-anchor-price-capability-unavailable');
    expect(harness.subscribeClick).not.toHaveBeenCalled();
  });


  it('forwards raw provider click evidence through P18.26 while keeping one subscription', () => {
    const harness = createClickChartHarness();
    const series = { coordinateToPrice: vi.fn(() => 90) };
    const onAnchor = vi.fn();
    const onProviderClick = vi.fn();
    const event = {
      time: 1_700_000_000,
      point: { x: 12, y: 34 },
      hoveredInfo: {
        sourceKind: 'series-primitive' as const,
        objectKind: 'primitive' as const,
        objectId: 'drawing-2',
      },
    };

    createLightweightChartsV5DrawingClickSubscriptionFromBinding(
      {
        resolveChart: () => harness.chart as never,
        resolveSeries: () => series as never,
      },
      handle,
      onAnchor,
      onProviderClick,
    );

    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);
    harness.emit(event);
    expect(onProviderClick).toHaveBeenCalledWith(event);
    expect(onAnchor).toHaveBeenCalledTimes(1);
  });

  it('delegates destroy to P18.26 so the exact click handler is unsubscribed once', () => {
    const harness = createClickChartHarness();
    const subscription = createLightweightChartsV5DrawingClickSubscriptionFromBinding(
      {
        resolveChart: () => harness.chart as never,
        resolveSeries: () => ({ coordinateToPrice: () => 10 }) as never,
      },
      handle,
      vi.fn(),
    );

    subscription.destroy();
    subscription.destroy();
    expect(harness.unsubscribeClick).toHaveBeenCalledTimes(1);
  });
});
