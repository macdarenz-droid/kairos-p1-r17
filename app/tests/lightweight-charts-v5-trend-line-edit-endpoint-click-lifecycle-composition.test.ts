import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import {
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  type LightweightChartsV5DrawingClickEventHandler,
  type LightweightChartsV5TrendLineScreenSegment,
  type RendererChartDrawing,
} from '../src/features/chart';

const handle = {} as ChartEngineSeriesHandle;

const drawings: readonly RendererChartDrawing[] = [
  {
    id: 'trend-58-selected',
    kind: 'trend-line',
    start: { time: 10, value: 20 },
    end: { time: 30, value: 40 },
  },
  {
    id: 'trend-58-other',
    kind: 'trend-line',
    start: { time: 40, value: 50 },
    end: { time: 60, value: 70 },
  },
];

const segments: readonly LightweightChartsV5TrendLineScreenSegment[] = [
  {
    id: 'trend-58-selected',
    kind: 'trend-line',
    start: { x: 10, y: 20 },
    end: { x: 50, y: 60 },
  },
  {
    id: 'trend-58-other',
    kind: 'trend-line',
    start: { x: 70, y: 80 },
    end: { x: 110, y: 120 },
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

const drawingHit = (drawingId: string, x: number, y: number) => ({
  time: 1_700_000_000,
  point: { x, y },
  hoveredInfo: {
    sourceKind: 'series-primitive' as const,
    objectKind: 'primitive' as const,
    objectId: drawingId,
  },
});

describe('P18.58 Lightweight Charts v5 trend-line edit endpoint-click lifecycle composition', () => {
  it('routes a selected endpoint through P18.57 inside the existing single click lifecycle', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
      { getCurrentSegments: () => segments, tolerancePx: 2 },
    );

    session.dispatch({ type: 'select-drawing', drawingId: 'trend-58-selected' });
    harness.emit(drawingHit('trend-58-selected', 49, 59));

    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({
      status: 'editing',
      drawingId: 'trend-58-selected',
      endpoint: 'end',
    });
    expect(session.getAnchors()).toEqual([]);
  });

  it('evaluates edit identity before selection so another drawing endpoint selects but does not edit in the same click', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
      { getCurrentSegments: () => segments, tolerancePx: 1 },
    );

    session.dispatch({ type: 'select-drawing', drawingId: 'trend-58-selected' });
    harness.emit(drawingHit('trend-58-other', 70, 80));

    expect(session.getState()).toEqual({
      status: 'selected',
      drawingId: 'trend-58-other',
    });
  });

  it('keeps a selected line-body click out of editing while preserving selection', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
      { getCurrentSegments: () => segments, tolerancePx: 2 },
    );

    session.dispatch({ type: 'select-drawing', drawingId: 'trend-58-selected' });
    harness.emit(drawingHit('trend-58-selected', 30, 40));

    expect(session.getState()).toEqual({
      status: 'selected',
      drawingId: 'trend-58-selected',
    });
  });

  it('reads the current projected endpoint segment snapshot at click time', () => {
    const harness = createClickHarness();
    let currentSegments: readonly LightweightChartsV5TrendLineScreenSegment[] = [];
    const getCurrentSegments = vi.fn(() => currentSegments);
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
      { getCurrentSegments, tolerancePx: 2 },
    );

    session.dispatch({ type: 'select-drawing', drawingId: 'trend-58-selected' });
    harness.emit(drawingHit('trend-58-selected', 10, 20));
    expect(session.getState()).toEqual({
      status: 'selected',
      drawingId: 'trend-58-selected',
    });

    currentSegments = segments;
    harness.emit(drawingHit('trend-58-selected', 10, 20));
    expect(session.getState()).toEqual({
      status: 'editing',
      drawingId: 'trend-58-selected',
      endpoint: 'start',
    });
    expect(getCurrentSegments).toHaveBeenCalledTimes(2);
  });

  it('preserves one exact provider unsubscribe lifecycle after endpoint-edit composition', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => drawings,
      { getCurrentSegments: () => segments, tolerancePx: 2 },
    );

    session.destroy();
    session.destroy();
    expect(harness.unsubscribeClick).toHaveBeenCalledTimes(1);
  });
});
