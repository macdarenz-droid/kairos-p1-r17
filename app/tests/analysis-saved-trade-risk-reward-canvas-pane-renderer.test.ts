import { describe, expect, it, vi } from 'vitest';
import { parseDecimalString, type TradeId } from '../src/domain/trades';
import { projectAnalysisSavedTradeRiskRewardReference } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import { projectAnalysisSavedTradeRiskRewardRenderer } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import { projectAnalysisSavedTradeRiskRewardCoordinates } from '../src/app/analysisSavedTradeRiskRewardCoordinateProjection';
import { projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const tradeId = 'trade-risk-reward-canvas' as TradeId;
const extent = { start: '2026-09-01T00:00:00Z', end: '2026-09-01T04:00:00Z' } as const;

function coordinateReady(side: 'long' | 'short' = 'long') {
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
        entry: decimal(side === 'long' ? '2000' : '100'),
        stop: decimal(side === 'long' ? '1900' : '110'),
        target: decimal(side === 'long' ? '2200' : '80'),
      }),
      executedEntries: Object.freeze([]),
      executedExits: Object.freeze([]),
    }),
  });
  const logical = projectAnalysisSavedTradeRiskRewardReference(reference, extent);
  const renderer = projectAnalysisSavedTradeRiskRewardRenderer(logical);
  const coordinate = projectAnalysisSavedTradeRiskRewardCoordinates(
    renderer,
    { timeToCoordinate: (time) => time === 1788220800 ? 10 : 90 },
    { priceToCoordinate: (price) => price / 10 },
  );
  if (coordinate.kind !== 'coordinate-ready') throw new Error('expected coordinate-ready fixture');
  return coordinate;
}

function styleSource(overrides: Partial<{ lineWidth: number; zoneOpacity: number }> = {}) {
  return {
    lineWidth: overrides.lineWidth ?? 2,
    zoneOpacity: overrides.zoneOpacity ?? 0.25,
    resolveToken: (token: string): string | null => `resolved:${token}`,
  };
}

function createTarget(horizontalPixelRatio = 2, verticalPixelRatio = 3) {
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
    lineWidth: 0,
    globalAlpha: 1,
  };
  const useBitmapCoordinateSpace = vi.fn((draw: (scope: any) => void) => {
    draw({ context, horizontalPixelRatio, verticalPixelRatio });
  });
  return { context, target: { useBitmapCoordinateSpace } };
}

describe('Analysis saved-trade Risk/Reward Canvas pane renderer', () => {
  it('draws exact risk/reward zones before exact entry/stop/target levels in bitmap space', () => {
    const projection = coordinateReady();
    const result = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(projection, styleSource());
    if (result.kind !== 'pane-ready') throw new Error('expected pane-ready');
    const { context, target } = createTarget();

    result.paneRenderer.draw(target as never);

    expect(context.fillRect).toHaveBeenNthCalledWith(1, 20, 600, 160, -30);
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 20, 600, 160, 60);
    expect(context.lineWidth).toBe(4);
    expect(context.moveTo).toHaveBeenNthCalledWith(1, 20, 600);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 180, 600);
    expect(context.moveTo).toHaveBeenNthCalledWith(2, 20, 570);
    expect(context.moveTo).toHaveBeenNthCalledWith(3, 20, 660);
    expect(context.stroke).toHaveBeenCalledTimes(3);
    expect(context.fillRect.mock.invocationCallOrder[1]).toBeLessThan(context.stroke.mock.invocationCallOrder[0]);
  });

  it('resolves and applies only the exact semantic tokens supplied by Gate450', () => {
    const projection = coordinateReady();
    const resolveToken = vi.fn((token: string) => `color:${token}`);
    const result = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
      projection,
      { ...styleSource(), resolveToken },
    );
    if (result.kind !== 'pane-ready') throw new Error('expected pane-ready');
    const { context, target } = createTarget(1, 1);

    result.paneRenderer.draw(target as never);

    expect(resolveToken.mock.calls.map(([token]) => token)).toEqual([
      projection.screenObject.levels.entry.token,
      projection.screenObject.levels.stop.token,
      projection.screenObject.levels.target.token,
      projection.screenObject.zones.risk.token,
      projection.screenObject.zones.reward.token,
    ]);
    expect(context.fillStyle).toBe(`color:${projection.screenObject.zones.reward.token}`);
    expect(context.strokeStyle).toBe(`color:${projection.screenObject.levels.target.token}`);
  });

  it('preserves short-side coordinate ordering without financial or price normalization', () => {
    const result = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(coordinateReady('short'), styleSource());
    if (result.kind !== 'pane-ready') throw new Error('expected pane-ready');
    const { context, target } = createTarget(1, 1);
    result.paneRenderer.draw(target as never);
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 10, 10, 80, 1);
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 10, 10, 80, -2);
  });

  it('preserves exact Gate450 unavailable evidence without resolving styles', () => {
    const unavailable = Object.freeze({ kind: 'unavailable' as const, reason: 'planned-entry-missing' as const });
    const resolveToken = vi.fn(() => '#fff');
    const result = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
      unavailable,
      { ...styleSource(), resolveToken },
    );
    expect(result).toBe(unavailable);
    expect(resolveToken).not.toHaveBeenCalled();
  });

  it.each([
    { lineWidth: 0 },
    { lineWidth: Number.NaN },
    { zoneOpacity: -0.1 },
    { zoneOpacity: 1.1 },
  ])('fails closed for invalid Canvas style evidence %#', (overrides) => {
    expect(projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
      coordinateReady(),
      styleSource(overrides),
    )).toEqual({ kind: 'unavailable', reason: 'canvas-evidence-invalid' });
  });

  it.each([null, '', '   '])('fails closed for unavailable resolved token value %s', (value) => {
    expect(projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
      coordinateReady(),
      { ...styleSource(), resolveToken: () => value },
    )).toEqual({ kind: 'unavailable', reason: 'canvas-evidence-invalid' });
  });

  it('fails closed when the token resolver throws', () => {
    expect(projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
      coordinateReady(),
      { ...styleSource(), resolveToken: () => { throw new Error('detached document'); } },
    )).toEqual({ kind: 'unavailable', reason: 'canvas-evidence-invalid' });
  });

  it('fails closed when Gate450 screen evidence is internally inconsistent', () => {
    const source = coordinateReady();
    const invalid = {
      ...source,
      screenObject: {
        ...source.screenObject,
        zones: {
          ...source.screenObject.zones,
          risk: { ...source.screenObject.zones.risk, toY: 999 },
        },
      },
    } as typeof source;
    expect(projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(invalid, styleSource())).toEqual({
      kind: 'unavailable', reason: 'canvas-evidence-invalid',
    });
  });

  it('retains exact Gate450 evidence by identity and freezes the pane result and renderer', () => {
    const source = coordinateReady();
    const result = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(source, styleSource());
    if (result.kind !== 'pane-ready') throw new Error('expected pane-ready');
    expect(result.coordinateProjection).toBe(source);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.paneRenderer)).toBe(true);
  });

  it('restores Canvas state even when a drawing operation throws', () => {
    const result = projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(coordinateReady(), styleSource());
    if (result.kind !== 'pane-ready') throw new Error('expected pane-ready');
    const { context, target } = createTarget();
    context.fillRect.mockImplementationOnce(() => { throw new Error('lost context'); });
    expect(() => result.paneRenderer.draw(target as never)).toThrow('lost context');
    expect(context.restore).toHaveBeenCalledTimes(1);
  });
});
