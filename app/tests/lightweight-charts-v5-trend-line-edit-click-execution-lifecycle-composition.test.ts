import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import {
  createChartDrawingCollectionPort,
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  type ChartDrawing,
  type LightweightChartsV5DrawingClickEventHandler,
  type LightweightChartsV5TrendLineScreenSegment,
  type RendererChartDrawing,
} from '../src/features/chart';
import type { ChartDrawingPresentationDrawingRefreshSession } from '../src/features/chart/chartDrawingPresentationPort';

const handle = {} as ChartEngineSeriesHandle;

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const original: ChartDrawing = {
  id: 'trend-59-selected',
  kind: 'trend-line',
  start: { timestamp: '2023-11-14T22:13:20.000Z', price: decimal('100') },
  end: { timestamp: '2023-11-14T22:14:20.000Z', price: decimal('110') },
};

const rendererDrawings: readonly RendererChartDrawing[] = [
  {
    id: original.id,
    kind: 'trend-line',
    start: { time: 1_700_000_000, value: 100 },
    end: { time: 1_700_000_060, value: 110 },
  },
];

const segments: readonly LightweightChartsV5TrendLineScreenSegment[] = [
  {
    id: original.id,
    kind: 'trend-line',
    start: { x: 10, y: 20 },
    end: { x: 50, y: 60 },
  },
];

function presentation(replaceDrawings = vi.fn()): ChartDrawingPresentationDrawingRefreshSession {
  return {
    replace: vi.fn(),
    replaceDrawings,
    destroy: vi.fn(),
  };
}

function createClickHarness() {
  let handler: LightweightChartsV5DrawingClickEventHandler | null = null;
  let projectedPrice: number | null = 205.5;
  const subscribeClick = vi.fn((next: LightweightChartsV5DrawingClickEventHandler) => {
    handler = next;
  });
  const unsubscribeClick = vi.fn((next: LightweightChartsV5DrawingClickEventHandler) => {
    expect(next).toBe(handler);
  });
  const coordinateToPrice = vi.fn(() => projectedPrice);

  return {
    binding: {
      resolveChart: vi.fn(() => ({ subscribeClick, unsubscribeClick }) as never),
      resolveSeries: vi.fn(() => ({ coordinateToPrice }) as never),
    },
    emit(event: Parameters<LightweightChartsV5DrawingClickEventHandler>[0]) {
      if (handler === null) throw new Error('test-click-handler-not-subscribed');
      handler(event);
    },
    setProjectedPrice(value: number | null) {
      projectedPrice = value;
    },
    subscribeClick,
    unsubscribeClick,
    coordinateToPrice,
  };
}

const endpointClick = (time = 1_700_000_000) => ({
  time,
  point: { x: 50, y: 60 },
  hoveredInfo: {
    sourceKind: 'series-primitive' as const,
    objectKind: 'primitive' as const,
    objectId: original.id,
  },
});

const replacementClick = (time = 1_700_000_120) => ({
  time,
  point: { x: 80, y: 90 },
});

describe('P18.59 Lightweight Charts v5 trend-line edit click execution lifecycle composition', () => {
  it('keeps the endpoint-initiation click as edit intent only, then executes the edit from a later provider click anchor', () => {
    const harness = createClickHarness();
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    const replaceDrawings = vi.fn();

    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => rendererDrawings,
      { getCurrentSegments: () => segments, tolerancePx: 2 },
      { collection, presentation: presentation(replaceDrawings) },
    );

    session.dispatch({ type: 'select-drawing', drawingId: original.id });
    harness.emit(endpointClick());

    expect(session.getState()).toEqual({
      status: 'editing',
      drawingId: original.id,
      endpoint: 'end',
    });
    expect(collection.getDrawing(original.id)).toEqual(original);
    expect(replaceDrawings).not.toHaveBeenCalled();

    harness.emit(replacementClick());

    expect(session.getState()).toEqual({ status: 'idle' });
    expect(collection.getDrawing(original.id)).toEqual({
      id: original.id,
      kind: 'trend-line',
      start: original.start,
      end: {
        timestamp: '2023-11-14T22:15:20.000Z',
        price: decimal('205.5'),
      },
    });
    expect(replaceDrawings).toHaveBeenCalledTimes(1);
    expect(harness.subscribeClick).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a null replacement anchor and preserves authoritative editing state for a later retry click', () => {
    const harness = createClickHarness();
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    const replaceDrawings = vi.fn();

    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => rendererDrawings,
      { getCurrentSegments: () => segments, tolerancePx: 2 },
      { collection, presentation: presentation(replaceDrawings) },
    );

    session.dispatch({ type: 'select-drawing', drawingId: original.id });
    harness.emit(endpointClick());
    harness.setProjectedPrice(null);
    harness.emit(replacementClick());

    expect(session.getState()).toEqual({
      status: 'editing',
      drawingId: original.id,
      endpoint: 'end',
    });
    expect(collection.getDrawing(original.id)).toEqual(original);
    expect(replaceDrawings).not.toHaveBeenCalled();

    harness.setProjectedPrice(207.25);
    harness.emit(replacementClick(1_700_000_240));

    expect(session.getState()).toEqual({ status: 'idle' });
    expect(collection.getDrawing(original.id)).toEqual({
      id: original.id,
      kind: 'trend-line',
      start: original.start,
      end: {
        timestamp: '2023-11-14T22:17:20.000Z',
        price: decimal('207.25'),
      },
    });
    expect(replaceDrawings).toHaveBeenCalledTimes(1);
  });

  it('preserves one exact provider unsubscribe lifecycle after edit execution composition', () => {
    const harness = createClickHarness();
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(original);
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding,
      handle,
      () => undefined,
      () => rendererDrawings,
      { getCurrentSegments: () => segments, tolerancePx: 2 },
      { collection, presentation: presentation() },
    );

    session.destroy();
    session.destroy();

    expect(harness.unsubscribeClick).toHaveBeenCalledTimes(1);
  });
});
