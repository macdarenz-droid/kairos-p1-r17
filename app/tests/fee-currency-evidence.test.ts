import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeFeeId,
  TradeFeeRecord,
  TradeId,
} from '../src/domain/trades';
import { calculateTotalFees } from '../src/domain/calculations';

function fee(id: string, amount: string, currency: string): TradeFeeRecord {
  return {
    id: id as TradeFeeId,
    tradeId: 'trade-1' as TradeId,
    executionId: null,
    amount: amount as DecimalString,
    currency,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('P11.17R1 fee currency evidence', () => {
  it('returns the authoritative currency for a non-empty same-currency fee set', () => {
    expect(calculateTotalFees([
      fee('f1', '1.2', 'AUD'),
      fee('f2', '0.8', 'AUD'),
    ])).toEqual({
      ok: true,
      totalFees: '2',
      currency: 'AUD',
    });
  });

  it('returns null currency for an authoritative empty fee set', () => {
    expect(calculateTotalFees([])).toEqual({
      ok: true,
      totalFees: '0',
      currency: null,
    });
  });

  it('still refuses mixed currencies instead of inventing normalization', () => {
    expect(calculateTotalFees([
      fee('f1', '1', 'USD'),
      fee('f2', '1', 'AUD'),
    ])).toEqual({
      ok: false,
      reason: 'mixed-currency',
    });
  });
});
