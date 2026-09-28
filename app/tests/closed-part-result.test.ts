import { describe, expect, it } from 'vitest';
import { calculateClosedPartResult, calculateTradeMetrics } from '../src/domain/calculations';
import type { DecimalString, TradeExecutionId, TradeExecutionRecord, TradeId } from '../src/domain/trades';

let next = 0;
function fill(type: 'entry' | 'exit', price: string, quantity: string, time = '09:00'): TradeExecutionRecord {
  next += 1;
  return {
    id: `x${next}` as TradeExecutionId,
    tradeId: 'trade-1' as TradeId,
    type,
    price: price as DecimalString,
    quantity: quantity as DecimalString,
    executedAt: `2026-09-01T${time}:00.000Z`,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('T-050c the closed part of a partly closed trade', () => {
  it('works out the closed part of a long, with the quantities from the aggregate', () => {
    expect(calculateClosedPartResult('long', [fill('entry', '100', '2'), fill('exit', '110', '1', '10:00')])).toEqual({
      ok: true, available: true, resultBeforeFees: '10', closedQuantity: '1', enteredQuantity: '2', openQuantity: '1',
    });
  });

  it('closes the oldest entries first', () => {
    const result = calculateClosedPartResult('long', [fill('entry', '100', '1', '09:00'), fill('entry', '110', '1', '09:30'), fill('exit', '120', '1', '10:00')]);
    expect(result).toMatchObject({ available: true, resultBeforeFees: '20' });
  });

  it('keeps a later entry out of the closed part', () => {
    const result = calculateClosedPartResult('long', [fill('entry', '100', '2', '09:00'), fill('exit', '110', '1', '10:00'), fill('entry', '120', '1', '11:00')]);
    expect(result).toMatchObject({ available: true, resultBeforeFees: '10', enteredQuantity: '3', openQuantity: '2' });
  });

  it('splits an exit across lots', () => {
    const result = calculateClosedPartResult('long', [fill('entry', '100', '1'), fill('entry', '104', '1', '09:10'), fill('exit', '110', '1.5', '10:00')]);
    expect(result).toMatchObject({ available: true, resultBeforeFees: '13' });
  });

  it('works out a short both ways', () => {
    expect(calculateClosedPartResult('short', [fill('entry', '100', '2'), fill('exit', '90', '1', '10:00')])).toMatchObject({ resultBeforeFees: '10' });
    expect(calculateClosedPartResult('short', [fill('entry', '100', '2'), fill('exit', '105', '1', '10:00')])).toMatchObject({ resultBeforeFees: '-5' });
  });

  it('counts an entry before an exit at the same instant', () => {
    const result = calculateClosedPartResult('long', [fill('exit', '110', '1', '09:00'), fill('entry', '100', '2', '09:00')]);
    expect(result).toMatchObject({ ok: true, available: true, resultBeforeFees: '10' });
  });

  it('says a flat trade and a trade with no exit are not partly closed', () => {
    expect(calculateClosedPartResult('long', [fill('entry', '100', '1'), fill('exit', '110', '1', '10:00')])).toEqual({ ok: true, available: false, reason: 'not-partly-closed' });
    expect(calculateClosedPartResult('long', [fill('entry', '100', '1')])).toEqual({ ok: true, available: false, reason: 'not-partly-closed' });
  });

  it('refuses an exit before the only entry', () => {
    expect(calculateClosedPartResult('long', [fill('exit', '110', '1', '09:00'), fill('entry', '100', '2', '10:00')])).toEqual({ ok: false, reason: 'exit-before-entry' });
  });

  it('refuses a time it cannot read', () => {
    const bad = { ...fill('exit', '110', '1'), executedAt: 'not a time' };
    expect(calculateClosedPartResult('long', [fill('entry', '100', '2'), bad])).toEqual({ ok: false, reason: 'invalid-time' });
  });

  it('stays exact on real prices, and the full result is still not given', () => {
    const fills = [fill('entry', '85854.34', '0.1'), fill('entry', '85854.34', '0.1', '09:05'), fill('exit', '85792.01', '0.1', '10:00')];
    expect(calculateClosedPartResult('long', fills)).toMatchObject({ available: true, resultBeforeFees: '-6.233' });
    expect(calculateTradeMetrics('long', fills)).toMatchObject({ ok: true, value: { grossPnl: null } });
  });
});
