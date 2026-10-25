import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeExecutionRecord,
  TradeFeeId,
  TradeFeeRecord,
  TradeId,
} from '../src/domain/trades';
import { calculateTradeMetrics } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;
const tradeId = 'trade-p11-closure' as TradeId;

function execution(
  id: string,
  type: 'entry' | 'exit',
  price: string,
  quantity: string,
): TradeExecutionRecord {
  return {
    id: id as TradeExecutionId,
    tradeId,
    type,
    price: decimal(price),
    quantity: decimal(quantity),
    executedAt: '2026-09-02T00:00:00.000Z',
    createdAt: '2026-09-02T00:00:00.000Z',
  };
}

function fee(id: string, amount: string, currency: string): TradeFeeRecord {
  return {
    id: id as TradeFeeId,
    tradeId,
    executionId: null,
    amount: decimal(amount),
    currency,
    createdAt: '2026-09-02T00:00:00.000Z',
  };
}

describe('P11.24 Calculation Brain closure orchestration', () => {
  it('composes a fully evidenced realized trade through the existing calculation owners', () => {
    const result = calculateTradeMetrics(
      'long',
      [
        execution('entry-1', 'entry', '100', '2'),
        execution('exit-1', 'exit', '120', '2'),
      ],
      undefined,
      [fee('fee-1', '5', 'USD')],
      { grossPnlCurrency: 'USD' },
      { resultAmount: decimal('35'), basisAmount: decimal('200') },
      { resultAmount: decimal('35'), initialRiskAmount: decimal('20') },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      grossPnl: '40',
      totalFees: '5',
      totalFeesCurrency: 'USD',
      netPnl: '35',
      netPnlCurrency: 'USD',
      pnlPercent: '17.5',
      initialRisk: '20',
      realizedR: '1.75',
      averageEntryPrice: '100',
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
        hasTotalFees: true,
        hasNetPnl: true,
        hasPnlPercent: true,
        hasInitialRisk: true,
        hasRealizedR: true,
      },
    });
  });

  it('preserves unknown financial evidence as unavailable rather than zero', () => {
    const result = calculateTradeMetrics('long', [
      execution('entry-2', 'entry', '100', '1'),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.grossPnl).toBeNull();
    expect(result.value.totalFees).toBeNull();
    expect(result.value.netPnl).toBeNull();
    expect(result.value.pnlPercent).toBeNull();
    expect(result.value.initialRisk).toBeNull();
    expect(result.value.realizedR).toBeNull();
    expect(result.value.completeness).toMatchObject({
      hasGrossPnl: false,
      hasTotalFees: false,
      hasNetPnl: false,
      hasPnlPercent: false,
      hasInitialRisk: false,
      hasRealizedR: false,
    });
  });

  it('does not compose nonzero fee evidence across currencies without FX', () => {
    const result = calculateTradeMetrics(
      'short',
      [
        execution('entry-3', 'entry', '120', '1'),
        execution('exit-3', 'exit', '100', '1'),
      ],
      undefined,
      [fee('fee-2', '2', 'EUR')],
      { grossPnlCurrency: 'USD' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.grossPnl).toBe('20');
    expect(result.value.totalFees).toBe('2');
    expect(result.value.netPnl).toBeNull();
    expect(result.value.netPnlCurrency).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(false);
  });
});
