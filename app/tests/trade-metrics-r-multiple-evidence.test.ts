import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateTradeMetrics } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.23 TradeMetrics R-multiple evidence wiring', () => {
  it('keeps realized R unavailable when no explicit R evidence is supplied', () => {
    const result = calculateTradeMetrics('long', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.realizedR).toBeNull();
    expect(result.value.completeness.hasRealizedR).toBe(false);
  });

  it('calculates exact realized R from explicit result and initial-risk evidence', () => {
    const result = calculateTradeMetrics('long', [], undefined, undefined, undefined, undefined, {
      resultAmount: decimal('225'),
      initialRiskAmount: decimal('90'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.initialRisk).toBe('90');
    expect(result.value.realizedR).toBe('2.5');
    expect(result.value.completeness.hasInitialRisk).toBe(true);
    expect(result.value.completeness.hasRealizedR).toBe(true);
  });

  it('preserves a losing result as negative R', () => {
    const result = calculateTradeMetrics('short', [], undefined, undefined, undefined, undefined, {
      resultAmount: decimal('-45'),
      initialRiskAmount: decimal('30'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.realizedR).toBe('-1.5');
  });

  it('rejects zero initial risk explicitly', () => {
    expect(calculateTradeMetrics('long', [], undefined, undefined, undefined, undefined, {
      resultAmount: decimal('10'),
      initialRiskAmount: decimal('0'),
    })).toEqual({ ok: false, reason: 'zero-initial-risk' });
  });

  it('rejects malformed R-multiple evidence explicitly', () => {
    expect(calculateTradeMetrics('long', [], undefined, undefined, undefined, undefined, {
      resultAmount: 'bad' as DecimalString,
      initialRiskAmount: decimal('10'),
    })).toEqual({ ok: false, reason: 'invalid-risk-performance-decimal' });
  });

  it('preserves the existing risk-performance owner when both evidence forms are supplied', () => {
    const result = calculateTradeMetrics('long', [], {
      resultAmount: decimal('100'), riskPerUnit: decimal('10'), quantity: decimal('5'),
    }, undefined, undefined, undefined, {
      resultAmount: decimal('999'), initialRiskAmount: decimal('1'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.initialRisk).toBe('50');
    expect(result.value.realizedR).toBe('2');
  });
});
