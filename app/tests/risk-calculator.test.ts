import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateRiskPriceDistance } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.8 risk price-distance primitive', () => {
  it('calculates long-style entry-to-stop distance', () => {
    expect(calculateRiskPriceDistance(
      decimal('100'),
      decimal('95'),
    )).toEqual({
      ok: true,
      value: '5',
    });
  });

  it('calculates the same absolute distance when stop is above entry', () => {
    expect(calculateRiskPriceDistance(
      decimal('100'),
      decimal('105'),
    )).toEqual({
      ok: true,
      value: '5',
    });
  });

  it('preserves exact fractional precision', () => {
    expect(calculateRiskPriceDistance(
      decimal('0.3000000000000000001'),
      decimal('0.1'),
    )).toEqual({
      ok: true,
      value: '0.2000000000000000001',
    });
  });

  it('allows a genuine zero price distance as arithmetic evidence', () => {
    expect(calculateRiskPriceDistance(
      decimal('25'),
      decimal('25'),
    )).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('handles negative canonical prices without native arithmetic assumptions', () => {
    expect(calculateRiskPriceDistance(
      decimal('-10'),
      decimal('-12.5'),
    )).toEqual({
      ok: true,
      value: '2.5',
    });
  });

  it('propagates malformed entry evidence explicitly', () => {
    expect(calculateRiskPriceDistance(
      'not-a-decimal' as DecimalString,
      decimal('10'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('propagates malformed stop evidence explicitly', () => {
    expect(calculateRiskPriceDistance(
      decimal('10'),
      'not-a-decimal' as DecimalString,
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });
});
