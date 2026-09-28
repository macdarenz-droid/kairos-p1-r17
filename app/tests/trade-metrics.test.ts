import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeExecutionRecord,
  TradeId,
} from '../src/domain/trades';
import { calculateTradeMetrics } from '../src/domain/calculations';

function execution(
  id: string,
  type: 'entry' | 'exit',
  price: string,
  quantity: string,
): TradeExecutionRecord {
  return {
    id: id as TradeExecutionId,
    tradeId: 'trade-1' as TradeId,
    type,
    price: price as DecimalString,
    quantity: quantity as DecimalString,
    executedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('P11.5 TradeMetrics foundation', () => {
  it('keeps an empty trade explicitly incomplete', () => {
    expect(calculateTradeMetrics('long', [])).toEqual({
      ok: true,
      value: {
        grossPnl: null,
        totalFees: null,
        totalFeesCurrency: null,
        netPnl: null,
        netPnlCurrency: null,
        pnlPercent: null,
        initialRisk: null,
        realizedR: null,
        averageEntryPrice: null,
        averageExitPrice: null,
        totalEnteredQuantity: '0',
        totalExitedQuantity: '0',
        remainingQuantity: '0',
        state: null,
        completeness: {
          hasEntryExecutions: false,
          hasExitExecutions: false,
          hasAverageEntryPrice: false,
          hasAverageExitPrice: false,
          hasGrossPnl: false,
          hasTotalFees: false,
          hasNetPnl: false,
          hasPnlPercent: false,
          hasInitialRisk: false,
          hasRealizedR: false,
        },
      },
    });
  });

  it('composes an unrealized open-trade metric view without inventing P&L', () => {
    const result = calculateTradeMetrics('long', [
      execution('e1', 'entry', '100', '2'),
    ]);
    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: null,
        averageEntryPrice: '100',
        averageExitPrice: null,
        totalEnteredQuantity: '2',
        totalExitedQuantity: '0',
        remainingQuantity: '2',
        state: 'unrealized',
        completeness: {
          hasEntryExecutions: true,
          hasExitExecutions: false,
          hasGrossPnl: false,
          hasTotalFees: false,
          hasNetPnl: false,
        },
      },
    });
  });

  it('marks partial execution evidence as partially realized but gross P&L unavailable', () => {
    const result = calculateTradeMetrics('long', [
      execution('e1', 'entry', '100', '2'),
      execution('x1', 'exit', '110', '1'),
    ]);
    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: null,
        averageEntryPrice: '100',
        averageExitPrice: '110',
        totalEnteredQuantity: '2',
        totalExitedQuantity: '1',
        remainingQuantity: '1',
        state: 'partially-realized',
        completeness: {
          hasExitExecutions: true,
          hasAverageExitPrice: true,
          hasGrossPnl: false,
        },
      },
    });
  });

  it('composes fully realized flat-trade metrics for a long', () => {
    const result = calculateTradeMetrics('long', [
      execution('e1', 'entry', '100', '1'),
      execution('e2', 'entry', '110', '1'),
      execution('x1', 'exit', '120', '2'),
    ]);
    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: '30',
        averageEntryPrice: '105',
        averageExitPrice: '120',
        totalEnteredQuantity: '2',
        totalExitedQuantity: '2',
        remainingQuantity: '0',
        state: 'realized',
        completeness: {
          hasEntryExecutions: true,
          hasExitExecutions: true,
          hasAverageEntryPrice: true,
          hasAverageExitPrice: true,
          hasGrossPnl: true,
          hasTotalFees: false,
          hasNetPnl: false,
          hasPnlPercent: false,
          hasInitialRisk: false,
          hasRealizedR: false,
        },
      },
    });
  });

  it('preserves short direction through the composed gross P&L result', () => {
    const result = calculateTradeMetrics('short', [
      execution('e1', 'entry', '100', '3'),
      execution('x1', 'exit', '80', '3'),
    ]);
    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: '60',
        state: 'realized',
      },
    });
  });

  it('propagates impossible execution evidence instead of emitting metrics', () => {
    expect(calculateTradeMetrics('long', [
      execution('e1', 'entry', '10', '1'),
      execution('x1', 'exit', '12', '2'),
    ])).toEqual({
      ok: false,
      reason: 'over-exited',
    });
  });
});
