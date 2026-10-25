import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculatePositionSize } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.10 position-size calculator primitive', () => {
  it('calculates position size from risk budget and risk per unit', () => {
    expect(calculatePositionSize(
      decimal('100'),
      decimal('2'),
    )).toEqual({
      ok: true,
      value: '50',
    });
  });

  it('preserves exact decimal division', () => {
    expect(calculatePositionSize(
      decimal('12.5'),
      decimal('0.5'),
    )).toEqual({
      ok: true,
      value: '25',
    });
  });

  it('allows a genuine zero risk budget to produce zero size', () => {
    expect(calculatePositionSize(
      decimal('0'),
      decimal('2.5'),
    )).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('returns an explicit error when risk per unit is zero', () => {
    expect(calculatePositionSize(
      decimal('100'),
      decimal('0'),
    )).toEqual({
      ok: false,
      reason: 'zero-risk-per-unit',
    });
  });

  it('propagates malformed risk-budget evidence explicitly', () => {
    expect(calculatePositionSize(
      'bad-budget' as DecimalString,
      decimal('2'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('propagates malformed risk-per-unit evidence explicitly', () => {
    expect(calculatePositionSize(
      decimal('100'),
      'bad-risk' as DecimalString,
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('does not silently normalize negative evidence', () => {
    expect(calculatePositionSize(
      decimal('100'),
      decimal('-4'),
    )).toEqual({
      ok: true,
      value: '-25',
    });
  });
});
