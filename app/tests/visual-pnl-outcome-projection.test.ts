import { describe, expect, it } from 'vitest';
import { calculateTradeMetrics } from '../src/domain/calculations';
import {
  createTradeDomainId,
  parseDecimalString,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
} from '../src/domain/trades';
import { projectVisualPnlOutcome } from '../src/application/visual-pnl';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid fixture decimal: ${value}`);
  return parsed.value;
}

function execution(type: 'entry' | 'exit', price: string, quantity = '1'): TradeExecutionRecord {
  return {
    id: createTradeDomainId<TradeExecutionId>(),
    tradeId: createTradeDomainId<TradeId>(),
    type,
    price: dec(price),
    quantity: dec(quantity),
    executedAt: '2026-09-02T00:00:00.000Z',
    createdAt: '2026-09-02T00:00:00.000Z',
  };
}

function fee(amount: string, currency = 'USD'): TradeFeeRecord {
  return {
    id: createTradeDomainId<TradeFeeId>(),
    tradeId: createTradeDomainId<TradeId>(),
    executionId: null,
    amount: dec(amount),
    currency,
    createdAt: '2026-09-02T00:00:00.000Z',
  };
}

function metricsFor(exitPrice: string, fees: readonly TradeFeeRecord[], grossPnlCurrency?: string) {
  const result = calculateTradeMetrics(
    'long',
    [execution('entry', '100'), execution('exit', exitPrice)],
    undefined,
    fees,
    grossPnlCurrency === undefined ? undefined : { grossPnlCurrency },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('P13.1 Visual P&L outcome projection', () => {
  it('uses comparable net P&L as the authoritative visual outcome source', () => {
    const metrics = metricsFor('120', [fee('5', 'USD')], 'USD');
    expect(projectVisualPnlOutcome(metrics)).toEqual({
      outcome: 'profit',
      label: 'Profit',
      amount: '15',
      currency: 'USD',
      source: 'net-pnl',
    });
  });

  it('distinguishes loss and break-even with explicit text semantics', () => {
    const loss = metricsFor('95', [], undefined);
    const flat = metricsFor('100', [], undefined);

    expect(projectVisualPnlOutcome(loss)).toMatchObject({ outcome: 'loss', label: 'Loss', amount: '-5' });
    expect(projectVisualPnlOutcome(flat)).toMatchObject({ outcome: 'breakeven', label: 'Break-even', amount: '0' });
  });

  it('respects P11 zero-fee net P&L and keeps the explicit-zero-fee gross fallback compatible', () => {
    const metrics = metricsFor('110', [], undefined);
    expect(metrics.netPnl).toBe('10');
    expect(metrics.totalFees).toBe('0');
    expect(projectVisualPnlOutcome(metrics)).toEqual({
      outcome: 'profit',
      label: 'Profit',
      amount: '10',
      currency: null,
      source: 'net-pnl',
    });

    const legacyZeroFeeMetrics = {
      ...metrics,
      netPnl: null,
      netPnlCurrency: null,
      completeness: { ...metrics.completeness, hasNetPnl: false },
    };
    expect(projectVisualPnlOutcome(legacyZeroFeeMetrics)).toEqual({
      outcome: 'profit',
      label: 'Profit',
      amount: '10',
      currency: null,
      source: 'gross-pnl-zero-fees',
    });
  });

  it('does not infer a result when non-zero fees exist but net P&L currency comparability is missing', () => {
    const metrics = metricsFor('110', [fee('20', 'USD')], undefined);
    expect(metrics.grossPnl).toBe('10');
    expect(metrics.totalFees).toBe('20');
    expect(metrics.netPnl).toBeNull();
    expect(projectVisualPnlOutcome(metrics)).toEqual({
      outcome: 'unavailable',
      label: 'Not available',
      amount: null,
      currency: null,
      source: 'none',
    });
  });

  it('keeps missing metrics unavailable', () => {
    expect(projectVisualPnlOutcome(null)).toEqual({
      outcome: 'unavailable',
      label: 'Not available',
      amount: null,
      currency: null,
      source: 'none',
    });
  });
});
