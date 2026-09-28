import { describe, expect, it } from 'vitest';
import { parseDecimalString, type TradeId } from '../src/domain/trades';
import {
  projectAnalysisSavedTradeRiskRewardReference,
} from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const tradeId = 'trade-risk-reward-reference' as TradeId;
const extent = { start: '2026-09-01T00:00:00Z', end: '2026-09-01T04:00:00Z' } as const;

function readyReference(
  planned: { readonly entry: string | null; readonly stop: string | null; readonly target: string | null } = {
    entry: '2000.25', stop: '1950', target: '2100.75',
  },
  side: 'long' | 'short' = 'long',
): AnalysisSavedTradeChartReferenceProjection {
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
        entry: planned.entry === null ? null : decimal(planned.entry),
        stop: planned.stop === null ? null : decimal(planned.stop),
        target: planned.target === null ? null : decimal(planned.target),
      }),
      executedEntries: Object.freeze([]),
      executedExits: Object.freeze([]),
    }),
  });
}

describe('Analysis saved-trade Risk/Reward reference projection', () => {
  it('delegates exact planned levels and caller time extent through released P19 owners', () => {
    const result = projectAnalysisSavedTradeRiskRewardReference(readyReference(), extent);
    expect(result.kind).toBe('risk-reward-ready');
    if (result.kind !== 'risk-reward-ready') throw new Error('expected risk-reward-ready');

    expect(result.analysis).toEqual({
      id: `journal-risk-reward:${tradeId}`,
      side: 'long',
      levels: { entry: decimal('2000.25'), stop: decimal('1950'), target: decimal('2100.75') },
    });
    expect(result.placement).toEqual({ id: `journal-risk-reward:${tradeId}`, ...extent });
    expect(result.chartObject.levels.entry).toMatchObject({ price: decimal('2000.25'), ...extent });
    expect(result.chartObject.levels.stop).toMatchObject({ price: decimal('1950'), ...extent });
    expect(result.chartObject.levels.target).toMatchObject({ price: decimal('2100.75'), ...extent });
    expect(result.chartObject.zones).toMatchObject({
      risk: { from: decimal('2000.25'), to: decimal('1950'), ...extent },
      reward: { from: decimal('2000.25'), to: decimal('2100.75'), ...extent },
    });
  });

  it('preserves short-side source ordering without normalizing prices', () => {
    const result = projectAnalysisSavedTradeRiskRewardReference(
      readyReference({ entry: '100', stop: '110', target: '80' }, 'short'),
      extent,
    );
    expect(result.kind).toBe('risk-reward-ready');
    if (result.kind !== 'risk-reward-ready') throw new Error('expected risk-reward-ready');
    expect(result.chartObject.side).toBe('short');
    expect(result.chartObject.zones.risk).toMatchObject({ from: decimal('100'), to: decimal('110') });
    expect(result.chartObject.zones.reward).toMatchObject({ from: decimal('100'), to: decimal('80') });
  });

  it.each([
    [{ entry: null, stop: '90', target: '120' }, 'planned-entry-missing'],
    [{ entry: '100', stop: null, target: '120' }, 'planned-stop-missing'],
    [{ entry: '100', stop: '90', target: null }, 'planned-target-missing'],
  ] as const)('keeps missing planned evidence explicit instead of substituting executions or candle prices', (planned, reason) => {
    expect(projectAnalysisSavedTradeRiskRewardReference(readyReference(planned), extent)).toEqual({
      kind: 'unavailable', reason, referenceReason: null,
    });
  });

  it('treats an exact zero DecimalString as present rather than missing', () => {
    const result = projectAnalysisSavedTradeRiskRewardReference(
      readyReference({ entry: '0', stop: '-1', target: '1' }),
      extent,
    );
    expect(result.kind).toBe('risk-reward-ready');
    if (result.kind !== 'risk-reward-ready') throw new Error('expected risk-reward-ready');
    expect(result.analysis.levels.entry).toBe(decimal('0'));
  });

  it('propagates exact chart-reference unavailability without creating Risk/Reward facts', () => {
    const unavailable: AnalysisSavedTradeChartReferenceProjection = {
      kind: 'unavailable', reason: 'symbol-mismatch', tradeId, tradeSymbol: 'BTCUSDT',
      chartInstrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, chartQuoteAsset: 'USDT',
    };
    expect(projectAnalysisSavedTradeRiskRewardReference(unavailable, extent)).toEqual({
      kind: 'unavailable', reason: 'reference-unavailable', referenceReason: 'symbol-mismatch',
    });
  });

  it.each([
    [{ start: 'not-a-time', end: extent.end }],
    [{ start: extent.start, end: 'not-a-time' }],
    [{ start: extent.end, end: extent.start }],
  ])('fails closed for invalid or reversed caller time evidence', (invalidExtent) => {
    expect(projectAnalysisSavedTradeRiskRewardReference(readyReference(), invalidExtent)).toEqual({
      kind: 'unavailable', reason: 'extent-invalid', referenceReason: null,
    });
  });

  it('freezes the complete projection without mutating the caller reference', () => {
    const reference = readyReference();
    const result = projectAnalysisSavedTradeRiskRewardReference(reference, extent);
    expect(result.kind).toBe('risk-reward-ready');
    if (result.kind !== 'risk-reward-ready') throw new Error('expected risk-reward-ready');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.analysis.levels)).toBe(true);
    expect(Object.isFrozen(result.semantics.zones.risk)).toBe(true);
    expect(Object.isFrozen(result.style.reward)).toBe(true);
    expect(Object.isFrozen(result.placement)).toBe(true);
    expect(Object.isFrozen(result.chartObject.levels.entry)).toBe(true);
    expect(reference.kind).toBe('reference-ready');
    if (reference.kind !== 'reference-ready') throw new Error('expected reference-ready');
    expect(reference.facts.planned.entry).toBe(decimal('2000.25'));
  });
});
