import { describe, expect, it } from 'vitest';
import type {
  DecimalString,
  TradeExecutionId,
  TradeExecutionRecord,
  TradeId,
} from '../src/domain/trades';
import { calculateFlatTradeGrossRealizedPnl } from '../src/domain/calculations';

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

describe('P11.4 flat-trade gross realized P&L', () => {
  it('calculates positive long P&L from exact notionals', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '100', '2'),
      execution('x1', 'exit', '110', '2'),
    ])).toEqual({
      ok: true,
      available: true,
      grossRealizedPnl: '20',
    });
  });

  it('calculates negative long P&L', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '100', '1.5'),
      execution('x1', 'exit', '90', '1.5'),
    ])).toEqual({
      ok: true,
      available: true,
      grossRealizedPnl: '-15',
    });
  });

  it('reverses direction correctly for profitable short trades', () => {
    expect(calculateFlatTradeGrossRealizedPnl('short', [
      execution('e1', 'entry', '100', '3'),
      execution('x1', 'exit', '80', '3'),
    ])).toEqual({
      ok: true,
      available: true,
      grossRealizedPnl: '60',
    });
  });

  it('calculates negative short P&L when exits cost more than entries', () => {
    expect(calculateFlatTradeGrossRealizedPnl('short', [
      execution('e1', 'entry', '100', '2'),
      execution('x1', 'exit', '105', '2'),
    ])).toEqual({
      ok: true,
      available: true,
      grossRealizedPnl: '-10',
    });
  });

  it('uses total notionals across multiple fills when flat', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '100', '1'),
      execution('e2', 'entry', '110', '1'),
      execution('x1', 'exit', '120', '0.5'),
      execution('x2', 'exit', '115', '1.5'),
    ])).toEqual({
      ok: true,
      available: true,
      grossRealizedPnl: '22.5',
    });
  });

  it('returns unavailable instead of estimating an open trade', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '100', '2'),
    ])).toEqual({
      ok: true,
      available: false,
      reason: 'open',
    });
  });

  it('returns unavailable instead of choosing a partial-exit accounting policy', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '100', '2'),
      execution('x1', 'exit', '110', '1'),
    ])).toEqual({
      ok: true,
      available: false,
      reason: 'partially-exited',
    });
  });

  it('preserves decimal precision for flat fractional fills', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '0.1', '0.2'),
      execution('x1', 'exit', '0.3', '0.2'),
    ])).toEqual({
      ok: true,
      available: true,
      grossRealizedPnl: '0.04',
    });
  });

  it('propagates impossible execution balance instead of calculating P&L', () => {
    expect(calculateFlatTradeGrossRealizedPnl('long', [
      execution('e1', 'entry', '10', '1'),
      execution('x1', 'exit', '12', '2'),
    ])).toEqual({
      ok: false,
      reason: 'over-exited',
    });
  });
});
