import { describe, expect, it } from 'vitest';
import { parseDecimalString, type TradeId } from '../src/domain/trades';
import { projectAnalysisSavedTradeRiskRewardReference } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import { projectAnalysisSavedTradeRiskRewardRenderer } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import { projectAnalysisSavedTradeRiskRewardCoordinates } from '../src/app/analysisSavedTradeRiskRewardCoordinateProjection';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const tradeId = 'trade-risk-reward-coordinate' as TradeId;
const extent = { start: '2026-09-01T00:00:00Z', end: '2026-09-01T04:00:00Z' } as const;

function reference(side: 'long' | 'short' = 'long'): AnalysisSavedTradeChartReferenceProjection {
  return Object.freeze({
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
}

function ready(side: 'long' | 'short' = 'long') {
  const logical = projectAnalysisSavedTradeRiskRewardReference(reference(side), extent);
  const renderer = projectAnalysisSavedTradeRiskRewardRenderer(logical);
  if (renderer.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
  return renderer;
}

const timeScale = {
  timeToCoordinate(time: number): number | null {
    if (time === 1788220800) return 12;
    if (time === 1788235200) return 88;
    return null;
  },
};
const series = { priceToCoordinate: (price: number): number | null => price / 10 };

describe('Analysis saved-trade Risk/Reward coordinate projection', () => {
  it('delegates exact Gate449 renderer values through caller-owned chart scales', () => {
    const result = projectAnalysisSavedTradeRiskRewardCoordinates(ready(), timeScale, series);
    expect(result.kind).toBe('coordinate-ready');
    if (result.kind !== 'coordinate-ready') throw new Error('expected coordinate-ready');
    expect(result.screenObject).toMatchObject({
      id: `journal-risk-reward:${tradeId}`,
      side: 'long',
      levels: {
        entry: { role: 'entry', start: { x: 12, y: 200.025 }, end: { x: 88, y: 200.025 } },
        stop: { role: 'stop', start: { x: 12, y: 195 }, end: { x: 88, y: 195 } },
        target: { role: 'target', start: { x: 12, y: 210.075 }, end: { x: 88, y: 210.075 } },
      },
      zones: {
        risk: { role: 'risk', startX: 12, endX: 88, fromY: 200.025, toY: 195 },
        reward: { role: 'reward', startX: 12, endX: 88, fromY: 200.025, toY: 210.075 },
      },
    });
  });

  it('preserves exact logical and renderer evidence plus semantic token references by identity', () => {
    const source = ready();
    const result = projectAnalysisSavedTradeRiskRewardCoordinates(source, timeScale, series);
    if (result.kind !== 'coordinate-ready') throw new Error('expected coordinate-ready');
    expect(result.logicalObject).toBe(source.logicalObject);
    expect(result.rendererObject).toBe(source.rendererObject);
    expect(result.screenObject.levels.entry.token).toBe(source.rendererObject.levels.entry.token);
    expect(result.screenObject.zones.reward.token).toBe(source.rendererObject.zones.reward.token);
  });

  it('preserves short-side source ordering without normalizing screen coordinates', () => {
    const result = projectAnalysisSavedTradeRiskRewardCoordinates(ready('short'), timeScale, series);
    if (result.kind !== 'coordinate-ready') throw new Error('expected coordinate-ready');
    expect(result.screenObject.zones.risk).toMatchObject({ fromY: 10, toY: 11 });
    expect(result.screenObject.zones.reward).toMatchObject({ fromY: 10, toY: 8 });
  });

  it('propagates exact Gate449 unavailable evidence without consulting provider scales', () => {
    let calls = 0;
    const unavailable = Object.freeze({ kind: 'unavailable' as const, reason: 'planned-stop-missing' as const });
    const result = projectAnalysisSavedTradeRiskRewardCoordinates(
      unavailable,
      { timeToCoordinate: () => { calls += 1; return 1; } },
      { priceToCoordinate: () => { calls += 1; return 1; } },
    );
    expect(result).toBe(unavailable);
    expect(calls).toBe(0);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails closed for unavailable or non-finite time coordinate %s',
    (coordinate) => {
      expect(projectAnalysisSavedTradeRiskRewardCoordinates(
        ready(),
        { timeToCoordinate: () => coordinate },
        series,
      )).toEqual({ kind: 'unavailable', reason: 'coordinate-evidence-invalid' });
    },
  );

  it.each([null, Number.NaN, Number.NEGATIVE_INFINITY])(
    'fails closed for unavailable or non-finite price coordinate %s',
    (coordinate) => {
      expect(projectAnalysisSavedTradeRiskRewardCoordinates(
        ready(),
        timeScale,
        { priceToCoordinate: () => coordinate },
      )).toEqual({ kind: 'unavailable', reason: 'coordinate-evidence-invalid' });
    },
  );

  it('fails closed when Gate449 renderer evidence is internally inconsistent', () => {
    const source = ready();
    const invalid = {
      ...source,
      rendererObject: {
        ...source.rendererObject,
        zones: {
          ...source.rendererObject.zones,
          risk: { ...source.rendererObject.zones.risk, to: 999 },
        },
      },
    } as typeof source;
    expect(projectAnalysisSavedTradeRiskRewardCoordinates(invalid, timeScale, series)).toEqual({
      kind: 'unavailable', reason: 'coordinate-evidence-invalid',
    });
  });

  it('fails closed when a caller-owned provider scale throws', () => {
    expect(projectAnalysisSavedTradeRiskRewardCoordinates(
      ready(),
      timeScale,
      { priceToCoordinate: () => { throw new Error('detached'); } },
    )).toEqual({ kind: 'unavailable', reason: 'coordinate-evidence-invalid' });
  });

  it('deeply freezes new screen evidence without cloning released objects', () => {
    const source = ready();
    const result = projectAnalysisSavedTradeRiskRewardCoordinates(source, timeScale, series);
    if (result.kind !== 'coordinate-ready') throw new Error('expected coordinate-ready');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.screenObject)).toBe(true);
    expect(Object.isFrozen(result.screenObject.levels)).toBe(true);
    expect(Object.isFrozen(result.screenObject.levels.entry)).toBe(true);
    expect(Object.isFrozen(result.screenObject.levels.entry.start)).toBe(true);
    expect(Object.isFrozen(result.screenObject.zones)).toBe(true);
    expect(Object.isFrozen(result.screenObject.zones.risk)).toBe(true);
    expect(result.rendererObject).toBe(source.rendererObject);
  });
});
