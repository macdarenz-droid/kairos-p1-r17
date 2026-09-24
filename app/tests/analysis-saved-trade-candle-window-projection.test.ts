import { describe, expect, it } from 'vitest';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';
import { projectAnalysisSavedTradeCandleWindow } from '../src/app/analysisSavedTradeCandleWindowProjection';
import { parseDecimalString } from '../src/domain/trades';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const chartInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const reference: AnalysisSavedTradeChartReferenceProjection = {
  kind: 'reference-ready', tradeId: 'trade-1' as never, tradeSymbol: 'ETHUSDT', chartInstrument,
  chartQuoteAsset: 'USDT', executionVenue: null,
  facts: {
    tradeId: 'trade-1' as never, symbol: 'ETHUSDT', side: 'long', status: 'closed',
    planned: { entry: decimal('100'), stop: decimal('90'), target: decimal('120') },
    executedEntries: [
      { executionId: 'entry-open' as never, price: decimal('101.25'), quantity: decimal('2'), executedAt: '2026-09-01T01:00:00.000Z' },
      { executionId: 'entry-close' as never, price: decimal('102.5'), quantity: decimal('1'), executedAt: '2026-09-01T01:00:59.999Z' },
      { executionId: 'entry-gap' as never, price: decimal('103'), quantity: decimal('1'), executedAt: '2026-09-01T01:01:30.000Z' },
    ],
    executedExits: [
      { executionId: 'exit-before' as never, price: decimal('99'), quantity: decimal('1'), executedAt: '2026-09-01T00:59:59.999Z' },
      { executionId: 'exit-after' as never, price: decimal('110'), quantity: decimal('1'), executedAt: '2026-09-01T01:03:00.000Z' },
    ],
  },
};

function snapshot(overrides: Partial<MarketCandleHistorySnapshot> = {}): MarketCandleHistorySnapshot {
  return {
    source: 'market-reference', timeZone: 'UTC', observedAt: '2026-09-01T01:04:00.000Z',
    request: { instrument: chartInstrument, interval: '1m', limit: 500 },
    candles: [
      { openTime: '2026-09-01T01:00:00.000Z', closeTime: '2026-09-01T01:00:59.999Z', open: decimal('100'), high: decimal('104'), low: decimal('99'), close: decimal('103') },
      { openTime: '2026-09-01T01:02:00.000Z', closeTime: '2026-09-01T01:02:59.999Z', open: decimal('103'), high: decimal('111'), low: decimal('102'), close: decimal('110') },
    ],
    ...overrides,
  };
}

describe('Analysis saved-trade candle-window projection', () => {
  it('places exact execution instants at inclusive authoritative candle bounds without changing execution facts', () => {
    const result = projectAnalysisSavedTradeCandleWindow(reference, snapshot());
    expect(result.kind).toBe('window-ready');
    if (result.kind !== 'window-ready') throw new Error('expected window-ready');
    expect(result.executions.slice(0, 2)).toEqual([
      { executionId: 'entry-open', executionType: 'entry', price: decimal('101.25'), quantity: decimal('2'), executedAt: '2026-09-01T01:00:00.000Z', placement: { kind: 'inside-candle', candleIndex: 0, candleOpenTime: '2026-09-01T01:00:00.000Z', candleCloseTime: '2026-09-01T01:00:59.999Z' } },
      { executionId: 'entry-close', executionType: 'entry', price: decimal('102.5'), quantity: decimal('1'), executedAt: '2026-09-01T01:00:59.999Z', placement: { kind: 'inside-candle', candleIndex: 0, candleOpenTime: '2026-09-01T01:00:00.000Z', candleCloseTime: '2026-09-01T01:00:59.999Z' } },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.executions)).toBe(true);
    expect(Object.isFrozen(result.executions[0])).toBe(true);
    expect(Object.isFrozen(result.executions[0].placement)).toBe(true);
  });

  it('keeps gap, before-history and after-history outcomes explicit instead of snapping to a candle', () => {
    const result = projectAnalysisSavedTradeCandleWindow(reference, snapshot());
    if (result.kind !== 'window-ready') throw new Error('expected window-ready');
    expect(result.executions.map((execution) => execution.placement)).toEqual([
      expect.objectContaining({ kind: 'inside-candle', candleIndex: 0 }),
      expect.objectContaining({ kind: 'inside-candle', candleIndex: 0 }),
      { kind: 'outside-window', reason: 'not-covered' },
      { kind: 'outside-window', reason: 'before-history' },
      { kind: 'outside-window', reason: 'after-history' },
    ]);
  });

  it('fails closed for an unavailable reference, wrong scope, empty history or invalid windows', () => {
    const unavailable: AnalysisSavedTradeChartReferenceProjection = {
      kind: 'unavailable', reason: 'symbol-mismatch', tradeId: 'trade-1' as never,
      tradeSymbol: 'ETHUSDT', chartInstrument, chartQuoteAsset: 'USDT',
    };
    expect(projectAnalysisSavedTradeCandleWindow(unavailable, snapshot())).toEqual({ kind: 'unavailable', reason: 'reference-unavailable', referenceReason: 'symbol-mismatch' });
    expect(projectAnalysisSavedTradeCandleWindow(reference, snapshot({ request: { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '1m', limit: 500 } }))).toEqual({ kind: 'unavailable', reason: 'history-scope-mismatch', referenceReason: null });
    expect(projectAnalysisSavedTradeCandleWindow(reference, snapshot({ candles: [] }))).toEqual({ kind: 'unavailable', reason: 'history-empty', referenceReason: null });
    expect(projectAnalysisSavedTradeCandleWindow(reference, snapshot({ candles: [
      { ...snapshot().candles[0], closeTime: 'invalid' },
    ] }))).toEqual({ kind: 'unavailable', reason: 'history-window-invalid', referenceReason: null });
  });

  it('marks an invalid execution timestamp unavailable without inventing time or price', () => {
    const invalidReference = {
      ...reference,
      facts: { ...reference.facts, executedEntries: [{ ...reference.facts.executedEntries[0], executedAt: 'invalid' }], executedExits: [] },
    };
    const result = projectAnalysisSavedTradeCandleWindow(invalidReference, snapshot());
    if (result.kind !== 'window-ready') throw new Error('expected window-ready');
    expect(result.executions).toEqual([expect.objectContaining({
      price: decimal('101.25'), executedAt: 'invalid', placement: { kind: 'outside-window', reason: 'execution-time-invalid' },
    })]);
  });
});
