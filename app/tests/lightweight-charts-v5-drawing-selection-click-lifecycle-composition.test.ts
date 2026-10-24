import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import {
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  type LightweightChartsV5DrawingClickEventHandler,
  type RendererChartDrawing,
} from '../src/features/chart';

const handle = {} as ChartEngineSeriesHandle;

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

const drawingHit = (drawingId: string) => ({
  time: 1_700_000_000,
  point: { x: 12, y: 34 },
  hoveredInfo: {
    sourceKind: 'series-primitive' as const,
    objectKind: 'primitive' as const,
    objectId: drawingId,
  },
});

describe('P18.42 Lightweight Charts v5 drawing selection click lifecycle composition', () => {
  it('routes current drawing selection through the existing single click subscription before anchor delivery', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
    );

    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);
    harness.emit(drawingHit('trend-2'));

    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'trend-2' });
    expect(session.getAnchors()).toEqual([]);
    expect(harness.coordinateToPrice).toHaveBeenCalledTimes(1);
  });

  it('reads the current renderer drawing snapshot at provider-click time and fails stale hits closed', () => {
    const harness = createClickHarness();
    let currentDrawings: readonly RendererChartDrawing[] = [];
    const getCurrentRendererDrawings = vi.fn(() => currentDrawings);
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      getCurrentRendererDrawings,
    );

    harness.emit(drawingHit('trend-1'));
    expect(session.getState()).toEqual({ status: 'idle' });

    currentDrawings = drawings;
    harness.emit(drawingHit('trend-1'));
    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'trend-1' });
    expect(getCurrentRendererDrawings).toHaveBeenCalledTimes(2);
  });

  it('keeps P18.23 tool-selected precedence while the unchanged anchor path starts the draft', () => {
    const harness = createClickHarness(100.25);
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
    );

    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit(drawingHit('trend-1'));

    expect(session.getState()).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([
      {
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
        price: '100.25',
      },
    ]);
  });

  it('keeps selection switching in the same P18.24 session and detaches the one click lifecycle once', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
    );

    harness.emit(drawingHit('trend-1'));
    harness.emit(drawingHit('trend-2'));
    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'trend-2' });

    session.destroy();
    session.destroy();
    expect(harness.unsubscribeClick).toHaveBeenCalledTimes(1);
  });
});
