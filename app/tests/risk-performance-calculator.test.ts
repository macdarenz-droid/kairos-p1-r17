import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateRiskPerformance } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.13 risk performance composition primitive', () => {
  it('composes initial risk and realized R from authoritative inputs', () => {
    expect(calculateRiskPerformance(
      decimal('250'),
      decimal('2.5'),
      decimal('40'),
    )).toEqual({
      ok: true,
      initialRisk: '100',
      realizedR: '2.5',
    });
  });

  it('preserves exact decimal composition', () => {
    expect(calculateRiskPerformance(
      decimal('0.3'),
      decimal('0.1'),
      decimal('3'),
    )).toEqual({
      ok: true,
      initialRisk: '0.3',
      realizedR: '1',
    });
  });

  it('preserves loss evidence as negative R', () => {
    expect(calculateRiskPerformance(
      decimal('-50'),
      decimal('2.5'),
      decimal('40'),
    )).toEqual({
      ok: true,
      initialRisk: '100',
      realizedR: '-0.5',
    });
  });

  it('rejects zero initial risk explicitly instead of inventing R=0', () => {
    expect(calculateRiskPerformance(
      decimal('50'),
      decimal('0'),
      decimal('40'),
    )).toEqual({
      ok: false,
      reason: 'zero-initial-risk',
    });
  });

  it('rejects malformed result amount explicitly', () => {
    expect(calculateRiskPerformance(
      'bad-result' as DecimalString,
      decimal('2'),
      decimal('10'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('rejects malformed risk-per-unit evidence explicitly', () => {
    expect(calculateRiskPerformance(
      decimal('50'),
      'bad-risk' as DecimalString,
      decimal('10'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('rejects malformed quantity evidence explicitly', () => {
    expect(calculateRiskPerformance(
      decimal('50'),
      decimal('2'),
      'bad-quantity' as DecimalString,
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });
});
