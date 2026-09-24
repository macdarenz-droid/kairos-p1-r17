import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateTradeMetrics } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.22 TradeMetrics P&L percentage evidence wiring', () => {
  it('keeps P&L percentage unavailable when no explicit percentage evidence is supplied', () => {
    const result = calculateTradeMetrics('long', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pnlPercent).toBeNull();
    expect(result.value.completeness.hasPnlPercent).toBe(false);
  });

  it('calculates an exact percentage only from explicit result and basis evidence', () => {
    const result = calculateTradeMetrics('long', [], undefined, undefined, undefined, {
      resultAmount: decimal('25'),
      basisAmount: decimal('200'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pnlPercent).toBe('12.5');
    expect(result.value.completeness.hasPnlPercent).toBe(true);
  });

  it('preserves negative performance evidence', () => {
    const result = calculateTradeMetrics('short', [], undefined, undefined, undefined, {
      resultAmount: decimal('-7.5'),
      basisAmount: decimal('150'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pnlPercent).toBe('-5');
  });

  it('rejects a zero basis instead of inventing a percentage', () => {
    expect(calculateTradeMetrics('long', [], undefined, undefined, undefined, {
      resultAmount: decimal('10'),
      basisAmount: decimal('0'),
    })).toEqual({ ok: false, reason: 'zero-pnl-percentage-basis' });
  });

  it('rejects malformed percentage evidence explicitly', () => {
    expect(calculateTradeMetrics('long', [], undefined, undefined, undefined, {
      resultAmount: 'bad' as DecimalString,
      basisAmount: decimal('100'),
    })).toEqual({ ok: false, reason: 'invalid-pnl-percentage-decimal' });
  });
});
