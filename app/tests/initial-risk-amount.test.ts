import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateInitialRiskAmount } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.12 initial risk amount primitive', () => {
  it('calculates monetary initial risk from authoritative risk-per-unit and quantity', () => {
    expect(calculateInitialRiskAmount(
      decimal('2.5'),
      decimal('40'),
    )).toEqual({
      ok: true,
      value: '100',
    });
  });

  it('preserves exact decimal multiplication', () => {
    expect(calculateInitialRiskAmount(
      decimal('0.125'),
      decimal('8'),
    )).toEqual({
      ok: true,
      value: '1',
    });
  });

  it('preserves a genuine zero risk-per-unit as zero initial risk', () => {
    expect(calculateInitialRiskAmount(
      decimal('0'),
      decimal('10'),
    )).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('preserves a genuine zero quantity as zero initial risk', () => {
    expect(calculateInitialRiskAmount(
      decimal('2'),
      decimal('0'),
    )).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('rejects malformed risk-per-unit evidence explicitly', () => {
    expect(calculateInitialRiskAmount(
      'bad-risk' as DecimalString,
      decimal('10'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('rejects malformed quantity evidence explicitly', () => {
    expect(calculateInitialRiskAmount(
      decimal('2'),
      'bad-quantity' as DecimalString,
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('does not silently normalize negative evidence', () => {
    expect(calculateInitialRiskAmount(
      decimal('-2'),
      decimal('10'),
    )).toEqual({
      ok: true,
      value: '-20',
    });
  });
});
