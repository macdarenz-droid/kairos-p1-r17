import { describe, expect, it } from 'vitest';
import { parseDecimalString, type TradeId } from '../src/domain/trades';
import { projectAnalysisSavedTradeRiskRewardReference } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import { projectAnalysisSavedTradeRiskRewardRenderer } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const tradeId = 'trade-risk-reward-renderer' as TradeId;
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
  const result = projectAnalysisSavedTradeRiskRewardReference(reference(side), extent);
  if (result.kind !== 'risk-reward-ready') throw new Error('expected risk-reward-ready');
  return result;
}

describe('Analysis saved-trade Risk/Reward renderer projection', () => {
  it('delegates exact timestamps and Decimal strings through released P17 renderer conversions', () => {
    const source = ready();
    const result = projectAnalysisSavedTradeRiskRewardRenderer(source);
    expect(result.kind).toBe('renderer-ready');
    if (result.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
    expect(result.rendererObject).toMatchObject({
      id: `journal-risk-reward:${tradeId}`,
      side: 'long',
      levels: {
        entry: { role: 'entry', start: 1788220800, end: 1788235200, price: 2000.25 },
        stop: { role: 'stop', start: 1788220800, end: 1788235200, price: 1950 },
        target: { role: 'target', start: 1788220800, end: 1788235200, price: 2100.75 },
      },
      zones: {
        risk: { role: 'risk', start: 1788220800, end: 1788235200, from: 2000.25, to: 1950 },
        reward: { role: 'reward', start: 1788220800, end: 1788235200, from: 2000.25, to: 2100.75 },
      },
    });
  });

  it('preserves exact logical evidence and semantic token references separately from renderer numbers', () => {
    const source = ready();
    const result = projectAnalysisSavedTradeRiskRewardRenderer(source);
    if (result.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
    expect(result.logicalObject).toBe(source.chartObject);
    expect(result.rendererObject.levels.entry.token).toBe(source.chartObject.levels.entry.token);
    expect(result.rendererObject.zones.reward.token).toBe(source.chartObject.zones.reward.token);
    expect(source.chartObject.levels.entry.price).toBe(decimal('2000.25'));
    expect(source.chartObject.levels.entry.start).toBe(extent.start);
  });

  it('preserves short-side source ordering without normalizing renderer prices', () => {
    const result = projectAnalysisSavedTradeRiskRewardRenderer(ready('short'));
    if (result.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
    expect(result.rendererObject.side).toBe('short');
    expect(result.rendererObject.zones.risk).toMatchObject({ from: 100, to: 110 });
    expect(result.rendererObject.zones.reward).toMatchObject({ from: 100, to: 80 });
  });

  it('propagates exact Gate448 unavailable evidence without manufacturing renderer values', () => {
    expect(projectAnalysisSavedTradeRiskRewardRenderer(Object.freeze({
      kind: 'unavailable' as const,
      reason: 'planned-stop-missing' as const,
      referenceReason: null,
    }))).toEqual({ kind: 'unavailable', reason: 'planned-stop-missing' });
  });

  it.each([
    ['identity', (source: ReturnType<typeof ready>) => ({ ...source, chartObject: { ...source.chartObject, id: 'other' } })],
    ['token', (source: ReturnType<typeof ready>) => ({ ...source, chartObject: { ...source.chartObject, levels: { ...source.chartObject.levels, entry: { ...source.chartObject.levels.entry, token: '--other' } } } })],
    ['extent', (source: ReturnType<typeof ready>) => ({ ...source, chartObject: { ...source.chartObject, zones: { ...source.chartObject.zones, risk: { ...source.chartObject.zones.risk, end: '2026-09-01T05:00:00Z' } } } })],
  ])('fails closed for inconsistent released %s evidence', (_name, mutate) => {
    expect(projectAnalysisSavedTradeRiskRewardRenderer(mutate(ready()))).toEqual({
      kind: 'unavailable', reason: 'renderer-evidence-invalid',
    });
  });

  it('fails closed for invalid renderer conversion evidence', () => {
    const source = ready();
    const invalid = {
      ...source,
      placement: { ...source.placement, start: 'not-a-time' },
      chartObject: {
        ...source.chartObject,
        levels: {
          entry: { ...source.chartObject.levels.entry, start: 'not-a-time' },
          stop: { ...source.chartObject.levels.stop, start: 'not-a-time' },
          target: { ...source.chartObject.levels.target, start: 'not-a-time' },
        },
        zones: {
          risk: { ...source.chartObject.zones.risk, start: 'not-a-time' },
          reward: { ...source.chartObject.zones.reward, start: 'not-a-time' },
        },
      },
    } as unknown as typeof source;
    expect(projectAnalysisSavedTradeRiskRewardRenderer(invalid)).toEqual({
      kind: 'unavailable', reason: 'renderer-evidence-invalid',
    });
  });

  it('deeply freezes renderer output without mutating Gate448 evidence', () => {
    const source = ready();
    const result = projectAnalysisSavedTradeRiskRewardRenderer(source);
    if (result.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rendererObject)).toBe(true);
    expect(Object.isFrozen(result.rendererObject.levels)).toBe(true);
    expect(Object.isFrozen(result.rendererObject.levels.entry)).toBe(true);
    expect(Object.isFrozen(result.rendererObject.zones)).toBe(true);
    expect(Object.isFrozen(result.rendererObject.zones.risk)).toBe(true);
    expect(source.chartObject.levels.entry.price).toBe(decimal('2000.25'));
  });
});
