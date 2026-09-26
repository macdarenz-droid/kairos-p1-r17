import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import {
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  type LightweightChartsV5DrawingClickEventHandler,
} from '../src/features/chart';

const handle = {} as ChartEngineSeriesHandle;

function createClickHarness(price = 456.78) {
  let handler: LightweightChartsV5DrawingClickEventHandler | null = null;
  const subscribeClick = vi.fn((next: LightweightChartsV5DrawingClickEventHandler) => {
    handler = next;
  });
  const unsubscribeClick = vi.fn((next: LightweightChartsV5DrawingClickEventHandler) => {
    expect(next).toBe(handler);
  });
  const coordinateToPrice = vi.fn(() => price);

  return {
    binding: {
      resolveChart: vi.fn(() => ({ subscribeClick, unsubscribeClick }) as never),
      resolveSeries: vi.fn(() => ({ coordinateToPrice }) as never),
    },
    emit(event: Parameters<LightweightChartsV5DrawingClickEventHandler>[0]) {
      if (handler === null) throw new Error('test-click-handler-not-subscribed');
      handler(event);
    },
    subscribeClick,
    unsubscribeClick,
    coordinateToPrice,
  };
}

describe('P18.30 Lightweight Charts v5 trend-line draft interaction composition', () => {
  it('routes provider click anchors into the existing P18.29 draft interaction session', () => {
    const harness = createClickHarness();
    const observed: string[] = [];
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      (state) => observed.push(state.status),
    );

    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit({ time: 1_700_000_000, point: { x: 12, y: 34 } });

    expect(session.getState()).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([
      {
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
        price: '456.78',
      },
    ]);

    harness.emit({ time: 1_700_000_060, point: { x: 22, y: 44 } });

    expect(session.getState()).toEqual({ status: 'preview', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([
      {
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
        price: '456.78',
      },
      {
        timestamp: new Date(1_700_000_060 * 1000).toISOString(),
        price: '456.78',
      },
    ]);
    expect(observed).toEqual(['tool-selected', 'drawing', 'preview']);
  });

  it('keeps provider null-anchor evidence a no-op through the existing owners', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
    );

    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit({ point: { x: 12, y: 34 } });

    expect(session.getState()).toEqual({ status: 'tool-selected', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([]);
    expect(harness.coordinateToPrice).not.toHaveBeenCalled();
  });

  it('preserves P18.29 cancel/reset lifecycle behavior while provider click delivery remains attached', () => {
    const harness = createClickHarness(100.25);
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
    );

    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit({ time: 1_700_000_000, point: { x: 1, y: 2 } });
    expect(session.getAnchors()).toHaveLength(1);

    session.dispatch({ type: 'cancel-interaction' });
    expect(session.getAnchors()).toEqual([]);

    session.dispatch({ type: 'reset-interaction' });
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit({ time: 1_700_000_060, point: { x: 3, y: 4 } });

    expect(session.getState()).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(session.getAnchors()).toHaveLength(1);
  });

  it('fails closed on provider capability setup and detaches clicks before neutral session destruction', () => {
    expect(() =>
      createLightweightChartsV5TrendLineDraftInteractionFromBinding(
        {
          resolveChart: () => ({}) as never,
          resolveSeries: () => ({ coordinateToPrice: () => 10 }) as never,
        },
        handle,
        vi.fn(),
      ),
    ).toThrow('chart-drawing-click-capability-unavailable');

    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
    );

    session.destroy();
    session.destroy();

    expect(harness.unsubscribeClick).toHaveBeenCalledTimes(1);
    expect(() => session.getState()).toThrow('chart-trend-line-draft-interaction-destroyed');
  });
});
