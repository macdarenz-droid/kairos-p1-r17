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

const decimal = (value: string) => value as DecimalString;

describe('P11.14 TradeMetrics risk evidence wiring', () => {
  it('keeps risk metrics unavailable when no authoritative risk evidence is supplied', () => {
    const result = calculateTradeMetrics('long', [
      execution('e1', 'entry', '100', '1'),
      execution('x1', 'exit', '120', '1'),
    ]);

    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: '20',
        initialRisk: null,
        realizedR: null,
        completeness: {
          hasInitialRisk: false,
          hasRealizedR: false,
        },
      },
    });
  });

  it('wires authoritative initial risk and R without changing gross P&L ownership', () => {
    const result = calculateTradeMetrics(
      'long',
      [
        execution('e1', 'entry', '100', '1'),
        execution('x1', 'exit', '120', '1'),
      ],
      {
        resultAmount: decimal('20'),
        riskPerUnit: decimal('5'),
        quantity: decimal('1'),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: '20',
        initialRisk: '5',
        realizedR: '4',
        completeness: {
          hasGrossPnl: true,
          hasInitialRisk: true,
          hasRealizedR: true,
        },
      },
    });
  });

  it('does not require resultAmount to equal gross P&L inside TradeMetrics', () => {
    const result = calculateTradeMetrics(
      'long',
      [
        execution('e1', 'entry', '100', '1'),
        execution('x1', 'exit', '120', '1'),
      ],
      {
        resultAmount: decimal('18'),
        riskPerUnit: decimal('5'),
        quantity: decimal('1'),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: '20',
        initialRisk: '5',
        realizedR: '3.6',
      },
    });
  });

  it('preserves loss evidence as a negative realized R', () => {
    const result = calculateTradeMetrics(
      'long',
      [
        execution('e1', 'entry', '100', '1'),
        execution('x1', 'exit', '90', '1'),
      ],
      {
        resultAmount: decimal('-10'),
        riskPerUnit: decimal('5'),
        quantity: decimal('1'),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        grossPnl: '-10',
        initialRisk: '5',
        realizedR: '-2',
      },
    });
  });

  it('fails explicitly when supplied risk evidence would create zero initial risk', () => {
    expect(calculateTradeMetrics(
      'long',
      [execution('e1', 'entry', '100', '1')],
      {
        resultAmount: decimal('5'),
        riskPerUnit: decimal('0'),
        quantity: decimal('1'),
      },
    )).toEqual({
      ok: false,
      reason: 'zero-initial-risk',
    });
  });

  it('fails explicitly on malformed supplied risk evidence', () => {
    expect(calculateTradeMetrics(
      'long',
      [execution('e1', 'entry', '100', '1')],
      {
        resultAmount: decimal('5'),
        riskPerUnit: 'bad-risk' as DecimalString,
        quantity: decimal('1'),
      },
    )).toEqual({
      ok: false,
      reason: 'invalid-risk-performance-decimal',
    });
  });
});
