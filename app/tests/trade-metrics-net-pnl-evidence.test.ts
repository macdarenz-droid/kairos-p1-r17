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

function fee(id: string, amount: string, currency = 'AUD'): TradeFeeRecord {
  return {
    id: id as TradeFeeId,
    tradeId: 'trade-1' as TradeId,
    executionId: null,
    amount: amount as DecimalString,
    currency,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

const realizedLong = [
  execution('e1', 'entry', '100', '2'),
  execution('x1', 'exit', '110', '2'),
];

describe('P11.21 TradeMetrics net P&L evidence wiring', () => {
  it('keeps net P&L unavailable when authoritative fee evidence is absent', () => {
    const result = calculateTradeMetrics('long', realizedLong);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.grossPnl).toBe('20');
    expect(result.value.totalFees).toBeNull();
    expect(result.value.netPnl).toBeNull();
    expect(result.value.netPnlCurrency).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(false);
  });

  it('composes realized gross P&L with an explicit authoritative zero-fee set', () => {
    const result = calculateTradeMetrics('long', realizedLong, undefined, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.grossPnl).toBe('20');
    expect(result.value.totalFees).toBe('0');
    expect(result.value.netPnl).toBe('20');
    expect(result.value.netPnlCurrency).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(true);
  });

  it('composes same-currency nonzero fees only with explicit gross P&L currency evidence', () => {
    const result = calculateTradeMetrics(
      'long',
      realizedLong,
      undefined,
      [fee('f1', '1.25', 'AUD')],
      { grossPnlCurrency: 'AUD' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.totalFees).toBe('1.25');
    expect(result.value.totalFeesCurrency).toBe('AUD');
    expect(result.value.netPnl).toBe('18.75');
    expect(result.value.netPnlCurrency).toBe('AUD');
    expect(result.value.completeness.hasNetPnl).toBe(true);
  });

  it('does not infer a missing gross P&L currency for nonzero fees', () => {
    const result = calculateTradeMetrics(
      'long',
      realizedLong,
      undefined,
      [fee('f1', '1', 'AUD')],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.netPnl).toBeNull();
    expect(result.value.netPnlCurrency).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(false);
  });

  it('keeps net P&L unavailable when explicit currencies do not match', () => {
    const result = calculateTradeMetrics(
      'long',
      realizedLong,
      undefined,
      [fee('f1', '1', 'USD')],
      { grossPnlCurrency: 'AUD' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.netPnl).toBeNull();
    expect(result.value.netPnlCurrency).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(false);
  });

  it('does not create net P&L for an unrealized trade even with explicit fees', () => {
    const result = calculateTradeMetrics(
      'long',
      [execution('e1', 'entry', '100', '2')],
      undefined,
      [fee('f1', '1', 'AUD')],
      { grossPnlCurrency: 'AUD' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.grossPnl).toBeNull();
    expect(result.value.netPnl).toBeNull();
    expect(result.value.completeness.hasNetPnl).toBe(false);
  });
});
