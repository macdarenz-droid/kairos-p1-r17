import { describe, expect, it, vi } from 'vitest';
import { parseDecimalString, type TradeId } from '../src/domain/trades';
import { projectAnalysisSavedTradeRiskRewardReference } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import { projectAnalysisSavedTradeRiskRewardRenderer } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import {
  createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive,
} from '../src/app/analysisSavedTradeRiskRewardLightweightChartsV5Primitive';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const tradeId = 'trade-risk-reward-primitive' as TradeId;
const extent = { start: '2026-09-01T00:00:00Z', end: '2026-09-01T04:00:00Z' } as const;

function rendererReady(side: 'long' | 'short' = 'long') {
  const reference: AnalysisSavedTradeChartReferenceProjection = Object.freeze({
    kind: 'reference-ready' as const,
    tradeId,
    tradeSymbol: 'ETHUSDT',
    chartInstrument: Object.freeze({ venue: 'binance-spot', symbol: 'ETHUSDT' }),
    chartQuoteAsset: 'USDT',
    executionVenue: null,
    facts: Object.freeze({
      tradeId,
      symbol: 'ETHUSDT',
      side,
      status: 'closed' as const,
      planned: Object.freeze({
        entry: decimal(side === 'long' ? '2000.25' : '100'),
        stop: decimal(side === 'long' ? '1950' : '110'),
        target: decimal(side === 'long' ? '2100.75' : '80'),
      }),
      executedEntries: Object.freeze([]),
      executedExits: Object.freeze([]),
    }),
  });
  const logical = projectAnalysisSavedTradeRiskRewardReference(reference, extent);
  const renderer = projectAnalysisSavedTradeRiskRewardRenderer(logical);
  if (renderer.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
  return renderer;
}

function styleSource(overrides: Partial<{ lineWidth: number; zoneOpacity: number }> = {}) {
  return {
    lineWidth: overrides.lineWidth ?? 2,
    zoneOpacity: overrides.zoneOpacity ?? 0.2,
    resolveToken: vi.fn((token: string) => `resolved:${token}`),
  };
}

function attachedScales(overrides: Partial<{ time: number | null; price: number | null }> = {}) {
  const timeToCoordinate = vi.fn(() => overrides.time ?? 12);
  const priceToCoordinate = vi.fn((price: number) => overrides.price ?? price / 10);
  return {
    parameter: {
      chart: { timeScale: () => ({ timeToCoordinate }) },
      series: { priceToCoordinate },
      requestUpdate: vi.fn(),
    },
    timeToCoordinate,
    priceToCoordinate,
  };
}

function drawContext() {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 0,
  };
  return {
    context,
    target: {
      useBitmapCoordinateSpace(draw: (scope: unknown) => void) {
        draw({ context, horizontalPixelRatio: 1, verticalPixelRatio: 1 });
      },
    },
  };
}

describe('Analysis saved-trade Risk/Reward Lightweight Charts v5 primitive', () => {
  it('preserves exact Gate449 unavailable evidence without resolving styles or scales', () => {
    const source = Object.freeze({ kind: 'unavailable' as const, reason: 'planned-stop-missing' as const });
    const style = styleSource();
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(source, style);
    expect(result).toBe(source);
    expect(style.resolveToken).not.toHaveBeenCalled();
  });

  it('delegates provider scales through Gate450 and exposes only Gate451 pane output', () => {
    const source = rendererReady();
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(source, styleSource());
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    const scales = attachedScales();
    result.primitive.attached(scales.parameter);
    result.primitive.updateAllViews();

    expect(result.rendererProjection).toBe(source);
    expect(result.primitive.currentCanvasProjection()?.kind).toBe('pane-ready');
    expect(result.primitive.paneViews()).toHaveLength(1);
    expect(scales.timeToCoordinate).toHaveBeenCalledTimes(2);
    expect(scales.priceToCoordinate).toHaveBeenCalledTimes(7);
  });

  it('keeps one stable pane view while replacing only the released renderer frame', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      styleSource(),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales().parameter);
    result.primitive.updateAllViews();
    const firstViews = result.primitive.paneViews();
    const firstRenderer = firstViews[0].renderer();
    result.primitive.updateAllViews();

    expect(result.primitive.paneViews()).toBe(firstViews);
    expect(result.primitive.paneViews()[0].renderer()).not.toBe(firstRenderer);
  });

  it('draws the exact Gate451 Canvas frame after provider update', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      styleSource(),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales().parameter);
    result.primitive.updateAllViews();
    const { context, target } = drawContext();
    result.primitive.paneViews()[0].renderer().draw(target as never);

    expect(context.fillRect).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledTimes(3);
  });

  it('preserves short-side coordinate ordering without financial normalization', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady('short'),
      styleSource(),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales().parameter);
    result.primitive.updateAllViews();
    const projection = result.primitive.currentCanvasProjection();
    if (projection?.kind !== 'pane-ready') throw new Error('expected pane-ready');
    expect(projection.coordinateProjection.screenObject.zones).toMatchObject({
      risk: { fromY: 10, toY: 11 },
      reward: { fromY: 10, toY: 8 },
    });
  });

  it('fails closed with no pane when Gate450 rejects provider scale evidence', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      styleSource(),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales({ time: Number.NaN }).parameter);
    result.primitive.updateAllViews();

    expect(result.primitive.currentCanvasProjection()).toEqual({
      kind: 'unavailable', reason: 'coordinate-evidence-invalid',
    });
    expect(result.primitive.paneViews()).toEqual([]);
  });

  it('fails closed with no pane when Gate451 rejects style evidence', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      styleSource({ lineWidth: 0 }),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales().parameter);
    result.primitive.updateAllViews();

    expect(result.primitive.currentCanvasProjection()).toEqual({
      kind: 'unavailable', reason: 'canvas-evidence-invalid',
    });
    expect(result.primitive.paneViews()).toEqual([]);
  });

  it('clears presentation evidence and retained pane access on detach', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      styleSource(),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales().parameter);
    result.primitive.updateAllViews();
    const retainedView = result.primitive.paneViews()[0];
    result.primitive.detached();
    const { context, target } = drawContext();
    retainedView.renderer().draw(target as never);

    expect(result.primitive.currentCanvasProjection()).toBeNull();
    expect(result.primitive.paneViews()).toEqual([]);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it('does not project or resolve presentation before attachment', () => {
    const style = styleSource();
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      style,
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.updateAllViews();
    expect(result.primitive.currentCanvasProjection()).toBeNull();
    expect(result.primitive.paneViews()).toEqual([]);
    expect(style.resolveToken).not.toHaveBeenCalled();
  });

  it('freezes the primitive projection and provider-facing resources', () => {
    const result = createAnalysisSavedTradeRiskRewardLightweightChartsV5Primitive(
      rendererReady(),
      styleSource(),
    );
    if (result.kind !== 'primitive-ready') throw new Error('expected primitive-ready');
    result.primitive.attached(attachedScales().parameter);
    result.primitive.updateAllViews();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.primitive)).toBe(true);
    expect(Object.isFrozen(result.primitive.paneViews())).toBe(true);
    expect(Object.isFrozen(result.primitive.paneViews()[0])).toBe(true);
  });
});
