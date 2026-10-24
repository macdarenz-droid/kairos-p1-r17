import { describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import {
  createLightweightChartsV5TrendLineDraftInteractionFromBinding,
  createLightweightChartsV5TrendLinePrimitive,
  hitTestLightweightChartsV5TrendLineEditEndpoints,
  hitTestLightweightChartsV5TrendLineSegments,
  paintLightweightChartsV5RiskRewardBox,
  projectChartRiskBoxDrawing,
  type ChartDrawingInteractionStatus,
  type LightweightChartsV5DrawingClickEventHandler,
  type LightweightChartsV5TrendLineScreenSegment,
  type RendererChartDrawing,
} from '../src/features/chart';

// A damaged saved box can carry any text, so the tests brand plain strings.
const d = (value: string) => value as DecimalString;

const colors = { entry: 'E', stop: 'S', target: 'T', risk: 'R', reward: 'W' };

function recordingContext() {
  const calls: unknown[][] = [];
  const context: Record<string, unknown> = {};
  for (const name of ['save', 'restore', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillText']) {
    context[name] = (...args: unknown[]) => calls.push([name, ...args]);
  }
  for (const name of ['globalAlpha', 'lineWidth', 'fillStyle', 'strokeStyle', 'font']) {
    let value: unknown = undefined;
    Object.defineProperty(context, name, {
      get: () => value,
      set: (next) => {
        value = next;
        calls.push([`${name}=`, next]);
      },
    });
  }
  return { context, calls };
}

describe('T-022b shared risk/reward box paint', () => {
  it('paints a long box: zones at the zone opacity, then the three lines', () => {
    const { context, calls } = recordingContext();
    paintLightweightChartsV5RiskRewardBox(context as never, 2, 3, { startX: 10, endX: 50, entryY: 100, stopY: 120, targetY: 60 }, colors, 1.4, 0.2);
    expect(calls).toEqual([
      ['save'],
      ['globalAlpha=', 0.2],
      ['fillStyle=', 'R'], ['fillRect', 20, 300, 80, 60],
      ['fillStyle=', 'W'], ['fillRect', 20, 300, 80, -120],
      ['globalAlpha=', 1],
      ['lineWidth=', 3],
      ['strokeStyle=', 'E'], ['beginPath'], ['moveTo', 20, 300], ['lineTo', 100, 300], ['stroke'],
      ['strokeStyle=', 'S'], ['beginPath'], ['moveTo', 20, 360], ['lineTo', 100, 360], ['stroke'],
      ['strokeStyle=', 'T'], ['beginPath'], ['moveTo', 20, 180], ['lineTo', 100, 180], ['stroke'],
      ['restore'],
    ]);
  });

  it('paints a short box with the signs kept', () => {
    const { context, calls } = recordingContext();
    paintLightweightChartsV5RiskRewardBox(context as never, 1, 1, { startX: 5, endX: 15, entryY: 50, stopY: 40, targetY: 80 }, colors, 1, 1);
    expect(calls.filter((call) => call[0] === 'fillRect')).toEqual([
      ['fillRect', 5, 50, 10, -10],
      ['fillRect', 5, 50, 10, 30],
    ]);
    expect(calls.filter((call) => call[0] === 'moveTo')).toEqual([['moveTo', 5, 50], ['moveTo', 5, 40], ['moveTo', 5, 80]]);
  });
});

describe('T-022b risk box renderer kind', () => {
  it('projects prices and times to numbers', () => {
    expect(projectChartRiskBoxDrawing({
      id: 'box-1', entry: d('100'), stop: d('95.5'), target: d('110'), start: '2026-01-01T10:00:00.000Z', end: '2026-01-01T10:25:00.000Z', label: 'Long',
    })).toEqual({
      id: 'box-1',
      kind: 'risk-box',
      start: { time: Date.parse('2026-01-01T10:00:00.000Z') / 1000, value: 100 },
      end: { time: Date.parse('2026-01-01T10:25:00.000Z') / 1000, value: 95.5 },
      target: 110,
      label: 'Long',
    });
  });

  it('gives null for a time or price that does not parse', () => {
    const base = { id: 'b', entry: d('100'), stop: d('95'), target: d('110'), start: '2026-01-01T10:00:00.000Z', end: '2026-01-01T10:25:00.000Z', label: '' };
    expect(projectChartRiskBoxDrawing({ ...base, start: 'not a time' })).toBeNull();
    expect(projectChartRiskBoxDrawing({ ...base, target: d('x') })).toBeNull();
  });
});

const box: RendererChartDrawing = {
  id: 'box-1', kind: 'risk-box', start: { time: 10, value: 100 }, end: { time: 50, value: 120 }, target: 60, label: 'Long · Reward is 2× the risk',
};

function attachedPrimitive(drawings: readonly RendererChartDrawing[], style: Parameters<typeof createLightweightChartsV5TrendLinePrimitive>[1]) {
  const primitive = createLightweightChartsV5TrendLinePrimitive(drawings, style);
  primitive.attached({
    chart: { timeScale: () => ({ timeToCoordinate: (time) => time }) },
    series: { priceToCoordinate: (price) => price },
    requestUpdate: vi.fn(),
  });
  primitive.updateAllViews();
  return primitive;
}

function draw(primitive: ReturnType<typeof createLightweightChartsV5TrendLinePrimitive>) {
  const { context, calls } = recordingContext();
  primitive.paneViews()[0].renderer().draw({
    useBitmapCoordinateSpace(paint: (scope: unknown) => void) {
      paint({ context, horizontalPixelRatio: 1, verticalPixelRatio: 1 });
    },
  } as never);
  return calls;
}

describe('T-022b risk box on the drawing layer', () => {
  it('draws the zones, three lines, the label and three handle squares', () => {
    const calls = draw(attachedPrimitive([box], { color: '#fff', lineWidth: 1, riskBox: colors }));
    const fills = calls.filter((call) => call[0] === 'fillRect');
    expect(fills.slice(0, 2)).toEqual([['fillRect', 10, 100, 40, 20], ['fillRect', 10, 100, 40, -40]]);
    expect(fills.slice(2)).toEqual([['fillRect', 7, 97, 6, 6], ['fillRect', 47, 117, 6, 6], ['fillRect', 47, 57, 6, 6]]);
    expect(calls.filter((call) => call[0] === 'stroke')).toHaveLength(3);
    expect(calls.filter((call) => call[0] === 'fillText')).toEqual([['fillText', 'Long · Reward is 2× the risk', 14, 96]]);
    const labelIndex = calls.findIndex((call) => call[0] === 'fillText');
    expect(calls.slice(0, labelIndex).filter((call) => call[0] === 'fillStyle=').at(-1)).toEqual(['fillStyle=', 'E']);
    expect(calls.find((call) => call[0] === 'globalAlpha=')).toEqual(['globalAlpha=', 1]);
  });

  it('draws the box before zones and lines', () => {
    const line: RendererChartDrawing = { id: 'l', kind: 'trend-line', start: { time: 0, value: 0 }, end: { time: 5, value: 5 } };
    const calls = draw(attachedPrimitive([line, box], { color: '#fff', lineWidth: 1, riskBox: colors }));
    const labelIndex = calls.findIndex((call) => call[0] === 'fillText');
    const lineMove = calls.findIndex((call) => call[0] === 'moveTo' && call[1] === 0);
    expect(labelIndex).toBeGreaterThan(-1);
    expect(lineMove).toBeGreaterThan(labelIndex);
  });

  it('draws nothing for a box without risk box colours', () => {
    const calls = draw(attachedPrimitive([box], { color: '#fff', lineWidth: 1 }));
    expect(calls.filter((call) => ['fillRect', 'stroke', 'fillText'].includes(call[0] as string))).toEqual([]);
  });

  it('skips a box whose target has no coordinate', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([box], { color: '#fff', lineWidth: 1, riskBox: colors });
    primitive.attached({
      chart: { timeScale: () => ({ timeToCoordinate: (time) => time }) },
      series: { priceToCoordinate: (price) => (price === 60 ? null : price) },
      requestUpdate: vi.fn(),
    });
    primitive.updateAllViews();
    expect(draw(primitive).filter((call) => call[0] === 'fillRect')).toEqual([]);
    expect(primitive.hitTest(20, 110)).toBeNull();
  });

  it('gives a box hit priority 0', () => {
    const primitive = attachedPrimitive([box], { color: '#fff', lineWidth: 1, riskBox: colors });
    expect(primitive.hitTest(20, 80)).toMatchObject({ externalId: 'box-1', hitTestPriority: 0 });
  });
});

describe('T-022b risk box hit test', () => {
  const boxSegment: LightweightChartsV5TrendLineScreenSegment = {
    id: 'box-1', kind: 'risk-box', start: { x: 10, y: 100 }, end: { x: 50, y: 120 }, target: { x: 50, y: 60 }, label: 'Long',
  };

  it('hits inside the box, between the highest and lowest level, grown by the tolerance', () => {
    expect(hitTestLightweightChartsV5TrendLineSegments([boxSegment], 30, 70, 4)).toEqual({ id: 'box-1', kind: 'risk-box', cursorStyle: 'pointer' });
    expect(hitTestLightweightChartsV5TrendLineSegments([boxSegment], 30, 57, 4)?.id).toBe('box-1');
    expect(hitTestLightweightChartsV5TrendLineSegments([boxSegment], 30, 50, 4)).toBeNull();
    expect(hitTestLightweightChartsV5TrendLineSegments([boxSegment], 60, 100, 4)).toBeNull();
  });

  it('lets a line over the box win', () => {
    const line: LightweightChartsV5TrendLineScreenSegment = { id: 'line', kind: 'trend-line', start: { x: 0, y: 80 }, end: { x: 100, y: 80 } };
    expect(hitTestLightweightChartsV5TrendLineSegments([line, boxSegment], 30, 80, 4)?.id).toBe('line');
  });

  it('finds a box entry, stop and target squares in the endpoint hit test (T-022e)', () => {
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([boxSegment], 10, 100, 4)).toEqual({ id: 'box-1', kind: 'trend-line-edit-endpoint', endpoint: 'start' });
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([boxSegment], 50, 118, 4)?.endpoint).toBe('end');
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([boxSegment], 50, 61, 4)?.endpoint).toBe('target');
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([boxSegment], 30, 80, 4)).toBeNull();
  });

  it('fails closed on an exact tie between a box stop and target squares', () => {
    const tight: LightweightChartsV5TrendLineScreenSegment = { ...boxSegment, end: { x: 50, y: 104 }, target: { x: 50, y: 96 } };
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([tight], 50, 100, 4)).toBeNull();
  });

  it('keeps line and zone endpoint hits unchanged', () => {
    const lineSegment: LightweightChartsV5TrendLineScreenSegment = { id: 'line', kind: 'trend-line', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } };
    const zoneSegment: LightweightChartsV5TrendLineScreenSegment = { id: 'zone', kind: 'zone', start: { x: 200, y: 0 }, end: { x: 300, y: 50 } };
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([lineSegment, zoneSegment], 1, 1, 4)).toEqual({ id: 'line', kind: 'trend-line-edit-endpoint', endpoint: 'start' });
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([lineSegment, zoneSegment], 299, 49, 4)).toEqual({ id: 'zone', kind: 'trend-line-edit-endpoint', endpoint: 'end' });
  });
});

const handle = {} as ChartEngineSeriesHandle;

function createClickHarness() {
  let handler: LightweightChartsV5DrawingClickEventHandler | null = null;
  return {
    binding: {
      resolveChart: vi.fn(() => ({
        subscribeClick: (next: LightweightChartsV5DrawingClickEventHandler) => { handler = next; },
        unsubscribeClick: () => undefined,
      }) as never),
      resolveSeries: vi.fn(() => ({ coordinateToPrice: () => 100 }) as never),
    },
    emit(event: Parameters<LightweightChartsV5DrawingClickEventHandler>[0]) {
      if (handler === null) throw new Error('not subscribed');
      handler(event);
    },
  };
}

describe('T-022b anchor seam', () => {
  it('consumes an intercepted anchor: it reaches neither the draft nor the edit', () => {
    const harness = createClickHarness();
    const seen: ChartDrawingInteractionStatus[] = [];
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding, handle, () => undefined, undefined, undefined, undefined,
      (anchor, preClickStatus) => {
        seen.push(preClickStatus);
        expect(anchor.price).toBe('100');
        return true;
      },
    );
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit({ time: 1_700_000_000, point: { x: 1, y: 2 } });
    expect(seen).toEqual(['tool-selected']);
    expect(session.getAnchors()).toEqual([]);
    expect(session.getState()).toEqual({ status: 'tool-selected', tool: 'trend-line' });
  });

  it('passes the status from before the click, even when the click changed the selection', () => {
    const harness = createClickHarness();
    const seen: ChartDrawingInteractionStatus[] = [];
    const segments: LightweightChartsV5TrendLineScreenSegment[] = [
      { id: 'line', kind: 'trend-line', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
    ];
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding, handle, () => undefined,
      () => [],
      { getCurrentSegments: () => segments, tolerancePx: 4 },
      undefined,
      (_anchor, preClickStatus) => {
        seen.push(preClickStatus);
        return false;
      },
    );
    harness.emit({ time: 1_700_000_000, point: { x: 50, y: 50 } });
    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'line' });
    expect(seen).toEqual(['idle']);
  });

  it('keeps the trend-line draft working when the interceptor returns false', () => {
    const harness = createClickHarness();
    const intercept = vi.fn(() => false);
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(
      harness.binding, handle, () => undefined, undefined, undefined, undefined, intercept,
    );
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    harness.emit({ time: 1_700_000_000, point: { x: 1, y: 2 } });
    harness.emit({ time: 1_700_000_060, point: { x: 3, y: 4 } });
    expect(intercept).toHaveBeenCalledTimes(2);
    expect(session.getState()).toEqual({ status: 'preview', tool: 'trend-line' });
    expect(session.getAnchors()).toHaveLength(2);
  });

  it('accepts the risk-box tool word without drafting two anchors for it', () => {
    const harness = createClickHarness();
    const session = createLightweightChartsV5TrendLineDraftInteractionFromBinding(harness.binding, handle, () => undefined);
    expect(session.dispatch({ type: 'select-tool', tool: 'risk-box' })).toEqual({ status: 'tool-selected', tool: 'risk-box' });
  });
});
