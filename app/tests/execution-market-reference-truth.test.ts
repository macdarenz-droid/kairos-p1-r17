import { describe, expect, it } from 'vitest';
import type { DecimalString, TradeExecutionId, TradeId } from '../src/domain/trades';
import { projectExecutionMarketReferenceTruth } from '../src/application/market-reference';

describe('P16.10 execution vs market-reference truth contract', () => {
  it('preserves disagreeing execution and market prices side by side without reconciliation', () => {
    const execution = {
      id: 'execution-1' as TradeExecutionId,
      tradeId: 'trade-1' as TradeId,
      type: 'entry' as const,
      price: '100.00' as DecimalString,
      quantity: '1' as DecimalString,
      executedAt: '2026-09-03T01:00:00.000Z',
      createdAt: '2026-09-03T01:01:00.000Z',
    };
    const observation = {
      instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
      price: '101.00' as DecimalString,
      observedAt: '2026-09-03T01:00:01.000Z',
      sourceTimestamp: '2026-09-03T01:00:00.500Z',
    };

    const result = projectExecutionMarketReferenceTruth(execution, observation);

    expect(result.execution.price).toBe('100.00');
    expect(result.execution.executedAt).toBe(execution.executedAt);
    expect(result.marketReference.price).toBe('101.00');
    expect(result.marketReference.venue).toBe('binance-spot');
    expect(result.marketReference.sourceTimestamp).toBe(observation.sourceTimestamp);
    expect(result.reconciliation).toBe('none');
    expect(result.mayOverwriteExecution).toBe(false);
    expect(execution.price).toBe('100.00');
  });

  it('retains nullable provider source time without inventing execution evidence', () => {
    const result = projectExecutionMarketReferenceTruth({
      id: 'execution-2' as TradeExecutionId,
      tradeId: 'trade-2' as TradeId,
      type: 'exit',
      price: '99.50' as DecimalString,
      quantity: '0.5' as DecimalString,
      executedAt: '2026-09-03T02:00:00.000Z',
      createdAt: '2026-09-03T02:00:10.000Z',
    }, {
      instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
      price: '99.75' as DecimalString,
      observedAt: '2026-09-03T02:00:01.000Z',
      sourceTimestamp: null,
    });

    expect(result.marketReference.sourceTimestamp).toBeNull();
    expect(result.execution.price).toBe('99.50');
    expect(result.marketReference.price).toBe('99.75');
  });
});
