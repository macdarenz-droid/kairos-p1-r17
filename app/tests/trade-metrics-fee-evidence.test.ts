import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeFeeId,
  TradeFeeRecord,
  TradeId,
} from '../src/domain/trades';
import { calculateTradeMetrics } from '../src/domain/calculations';

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

describe('P11.18R1 TradeMetrics fee evidence wiring', () => {
  it('keeps fees unknown when authoritative fee evidence is absent', () => {
    const result = calculateTradeMetrics('long', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.totalFees).toBeNull();
    expect(result.value.totalFeesCurrency).toBeNull();
    expect(result.value.completeness.hasTotalFees).toBe(false);
    expect(result.value.netPnl).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(false);
  });

  it('treats an explicit empty fee set as authoritative zero without inventing currency', () => {
    const result = calculateTradeMetrics('long', [], undefined, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.totalFees).toBe('0');
    expect(result.value.totalFeesCurrency).toBeNull();
    expect(result.value.completeness.hasTotalFees).toBe(true);
    expect(result.value.netPnl).toBeNull();
  });

  it('wires exact same-currency fee total and currency evidence', () => {
    const result = calculateTradeMetrics('long', [], undefined, [
      fee('f1', '0.1', 'AUD'),
      fee('f2', '0.2', 'AUD'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.totalFees).toBe('0.3');
    expect(result.value.totalFeesCurrency).toBe('AUD');
    expect(result.value.completeness.hasTotalFees).toBe(true);
    expect(result.value.netPnl).toBeNull();
  });

  it('rejects mixed fee currencies explicitly', () => {
    expect(calculateTradeMetrics('long', [], undefined, [
      fee('f1', '1', 'USD'),
      fee('f2', '1', 'AUD'),
    ])).toEqual({ ok: false, reason: 'mixed-fee-currency' });
  });

  it('rejects malformed fee decimals explicitly', () => {
    expect(calculateTradeMetrics('long', [], undefined, [
      fee('f1', 'not-a-decimal', 'USD'),
    ])).toEqual({ ok: false, reason: 'invalid-fee-decimal' });
  });
});
