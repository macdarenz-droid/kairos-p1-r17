import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeFeeId,
  TradeFeeRecord,
  TradeId,
} from '../src/domain/trades';
import { calculateTotalFees } from '../src/domain/calculations';

function fee(
  id: string,
  amount: string,
  currency = 'USD',
  executionId: string | null = null,
): TradeFeeRecord {
  return {
    id: id as TradeFeeId,
    tradeId: 'trade-1' as TradeId,
    executionId: executionId as TradeExecutionId | null,
    amount: amount as DecimalString,
    currency,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('P11.15 fee aggregation primitive', () => {
  it('returns genuine zero when authoritative fee evidence is an empty set', () => {
    expect(calculateTotalFees([])).toEqual({
      ok: true,
      totalFees: '0',
      currency: null,
    });
  });

  it('sums same-currency trade and execution fees exactly', () => {
    expect(calculateTotalFees([
      fee('f1', '0.1'),
      fee('f2', '0.2', 'USD', 'execution-1'),
      fee('f3', '1.25'),
    ])).toEqual({
      ok: true,
      totalFees: '1.55',
      currency: 'USD',
    });
  });

  it('preserves exact decimal precision rather than binary floating point', () => {
    expect(calculateTotalFees([
      fee('f1', '0.1'),
      fee('f2', '0.2'),
    ])).toEqual({
      ok: true,
      totalFees: '0.3',
      currency: 'USD',
    });
  });

  it('rejects malformed fee amounts explicitly', () => {
    expect(calculateTotalFees([
      fee('f1', 'bad-amount'),
    ])).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('rejects mixed currencies instead of silently adding unlike money', () => {
    expect(calculateTotalFees([
      fee('f1', '1', 'USD'),
      fee('f2', '2', 'AUD'),
    ])).toEqual({
      ok: false,
      reason: 'mixed-currency',
    });
  });
});
