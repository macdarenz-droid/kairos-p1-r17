import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  commitChartTrendLineDraftToCollection,
  createChartDrawingCollectionPort,
  createChartTrendLineDraftInteractionPort,
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  createLightweightChartsV5TrendLinePaneRenderer,
  createLightweightChartsV5TrendLinePrimitive,
  executeChartTrendLineEdit,
  hitTestLightweightChartsV5TrendLineSegments,
  type ChartDrawing,
  type LightweightChartsV5DrawingClickEventHandler,
  type LightweightChartsV5TrendLineScreenSegment,
  type RendererChartDrawing,
} from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}
const first = { timestamp: '2026-09-05T10:00:00.000Z' as const, price: decimal('100') };
const second = { timestamp: '2026-09-05T10:05:00.000Z' as const, price: decimal('90') };

const zoneSegment: LightweightChartsV5TrendLineScreenSegment = { id: 'zone-1', kind: 'zone', start: { x: 10, y: 10 }, end: { x: 60, y: 40 } };
const lineSegment: LightweightChartsV5TrendLineScreenSegment = { id: 'line-1', kind: 'trend-line', start: { x: 0, y: 25 }, end: { x: 100, y: 25 } };

function fakeTarget(ratio = 1) {
  const calls: string[] = [];
  const context = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(() => calls.push('stroke')), fillRect: vi.fn(() => calls.push('fillRect')), strokeRect: vi.fn(() => calls.push('strokeRect')),
    strokeStyle: '', fillStyle: '', lineWidth: 0, alphas: [] as number[],
    set globalAlpha(value: number) { this.alphas.push(value); },
  };
  const target = { useBitmapCoordinateSpace: (draw: (scope: unknown) => void) => draw({ context, horizontalPixelRatio: ratio, verticalPixelRatio: ratio }) };
  return { context, target, calls };
}

describe('zone draft and commit', () => {
  it('drafts a zone with two anchors and commits it with a fresh id', () => {
    const session = createChartTrendLineDraftInteractionPort().create(() => undefined);
    session.dispatch({ type: 'select-tool', tool: 'zone' });
    session.acceptAnchor(first);
    expect(session.acceptAnchor(second)).toEqual({ status: 'preview', tool: 'zone' });
    const collection = createChartDrawingCollectionPort().create();
    const committed = commitChartTrendLineDraftToCollection(session, collection);
    expect(committed).toMatchObject({ kind: 'zone', start: first, end: second });
    expect(committed?.id).toEqual(expect.any(String));
    expect(collection.getDrawings()).toEqual([committed]);
  });

  it('keeps the trend-line flow unchanged', () => {
    const session = createChartTrendLineDraftInteractionPort().create(() => undefined);
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    session.acceptAnchor(first);
    session.acceptAnchor(second);
    expect(commitChartTrendLineDraftToCollection(session, createChartDrawingCollectionPort().create())).toMatchObject({ kind: 'trend-line', start: first, end: second });
  });
});

describe('zone drawing', () => {
  it('fills and strokes the rectangle, marks both placed corners, and draws lines last', () => {
    const { context, target, calls } = fakeTarget(2);
    createLightweightChartsV5TrendLinePaneRenderer([lineSegment, zoneSegment], { color: '#fff', lineWidth: 1, zoneColor: '#abc', zoneFillOpacity: 0.3 }).draw(target as never);
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 20, 20, 100, 60);
    expect(context.strokeRect).toHaveBeenCalledWith(20, 20, 100, 60);
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 14, 14, 12, 12);
    expect(context.fillRect).toHaveBeenNthCalledWith(3, 114, 74, 12, 12);
    expect(context.alphas).toEqual([0.3, 1]);
    expect(context.fillStyle).toBe('#abc');
    expect(calls.indexOf('stroke')).toBeGreaterThan(calls.lastIndexOf('fillRect'));
  });

  it('uses the line colour and 0.15 when no zone style is given', () => {
    const { context, target } = fakeTarget();
    createLightweightChartsV5TrendLinePaneRenderer([zoneSegment], { color: '#123', lineWidth: 1 }).draw(target as never);
    expect(context.fillStyle).toBe('#123');
    expect(context.alphas[0]).toBe(0.15);
  });
});

describe('zone hit test', () => {
  it('hits inside a zone, lets a crossing line win, and misses beyond the tolerance', () => {
    expect(hitTestLightweightChartsV5TrendLineSegments([zoneSegment], 30, 30, 4)).toEqual({ id: 'zone-1', kind: 'zone', cursorStyle: 'pointer' });
    expect(hitTestLightweightChartsV5TrendLineSegments([zoneSegment, lineSegment], 30, 25, 4)).toMatchObject({ id: 'line-1', kind: 'trend-line' });
    expect(hitTestLightweightChartsV5TrendLineSegments([zoneSegment], 66, 30, 4)).toBeNull();
    expect(hitTestLightweightChartsV5TrendLineSegments([zoneSegment], 63, 30, 4)).toMatchObject({ kind: 'zone' });
  });

  it('ranks a zone as a covered region and a line as a stroke', () => {
    const drawings: RendererChartDrawing[] = [
      { id: 'zone-1', kind: 'zone', start: { time: 1, value: 10 }, end: { time: 5, value: 40 } },
      { id: 'line-1', kind: 'trend-line', start: { time: 1, value: 100 }, end: { time: 5, value: 100 } },
    ];
    const primitive = createLightweightChartsV5TrendLinePrimitive(drawings, { color: '#fff', lineWidth: 1 });
    primitive.attached({
      chart: { timeScale: () => ({ timeToCoordinate: (time: number) => time * 10 }) },
      series: { priceToCoordinate: (price: number) => price },
      requestUpdate: () => undefined,
    } as never);
    primitive.updateAllViews?.();
    expect(primitive.hitTest(30, 25)).toMatchObject({ externalId: 'zone-1', hitTestPriority: 0 });
    expect(primitive.hitTest(30, 100)).toMatchObject({ externalId: 'line-1', hitTestPriority: 1 });
  });
});

const handle = {} as ChartEngineSeriesHandle;
function createClickHarness(price = 95) {
  let handler: LightweightChartsV5DrawingClickEventHandler | null = null;
  return {
    binding: {
      resolveChart: vi.fn(() => ({ subscribeClick: (next: LightweightChartsV5DrawingClickEventHandler) => { handler = next; }, unsubscribeClick: () => undefined }) as never),
      resolveSeries: vi.fn(() => ({ coordinateToPrice: () => price }) as never),
    },
    emit(event: Parameters<LightweightChartsV5DrawingClickEventHandler>[0]) {
      if (handler === null) throw new Error('no handler');
      handler(event);
    },
  };
}
const rendererZone: RendererChartDrawing = { id: 'zone-1', kind: 'zone', start: { time: 1, value: 10 }, end: { time: 6, value: 40 } };

describe('selecting by tap position', () => {
  it('selects a zone from the tap point when there is no hover info', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(harness.binding, handle, () => undefined, () => [rendererZone], { getCurrentSegments: () => [zoneSegment], tolerancePx: 4 });
    harness.emit({ time: 1_700_000_000, point: { x: 30, y: 30 } } as never);
    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'zone-1' });
  });

  it('still selects from hover info alone', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(harness.binding, handle, () => undefined, () => [rendererZone], { getCurrentSegments: () => [zoneSegment], tolerancePx: 4 });
    harness.emit({ time: 1_700_000_000, hoveredInfo: { sourceKind: 'series-primitive', objectKind: 'primitive', objectId: 'zone-1' } } as never);
    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'zone-1' });
  });

  it('selects nothing while drafting', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(harness.binding, handle, () => undefined, () => [rendererZone], { getCurrentSegments: () => [zoneSegment], tolerancePx: 4 });
    session.dispatch({ type: 'select-tool', tool: 'zone' });
    session.dispatch({ type: 'start-drawing' });
    harness.emit({ time: 1_700_000_000, point: { x: 30, y: 30 } } as never);
    expect(session.getState().status).toBe('drawing');
  });
});

describe('moving a zone corner', () => {
  it('enters editing on a placed corner, then moves that corner and keeps the zone', () => {
    const zone: ChartDrawing = { id: 'zone-1', kind: 'zone', start: first, end: second };
    const collection = createChartDrawingCollectionPort().create();
    collection.addDrawing(zone);
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(harness.binding, handle, () => undefined, () => [rendererZone], { getCurrentSegments: () => [zoneSegment], tolerancePx: 4 });
    session.dispatch({ type: 'select-drawing', drawingId: 'zone-1' });
    harness.emit({ time: 1_700_000_000, point: { x: 60, y: 40 } } as never);
    expect(session.getState()).toEqual({ status: 'editing', drawingId: 'zone-1', endpoint: 'end' });
    const moved = { timestamp: '2026-09-05T10:10:00.000Z' as const, price: decimal('85') };
    expect(executeChartTrendLineEdit(session, collection, moved)).toEqual({ ...zone, end: moved });
    expect(collection.getDrawings()[0].kind).toBe('zone');
  });
});
