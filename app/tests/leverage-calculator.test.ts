import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateLeverageRatio } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.11 leverage calculator primitive', () => {
  it('calculates leverage as authoritative exposure divided by authoritative equity', () => {
    expect(calculateLeverageRatio(
      decimal('10000'),
      decimal('2000'),
    )).toEqual({
      ok: true,
      value: '5',
    });
  });

  it('preserves exact decimal division', () => {
    expect(calculateLeverageRatio(
      decimal('1500'),
      decimal('600'),
    )).toEqual({
      ok: true,
      value: '2.5',
    });
  });

  it('allows genuine zero exposure to produce zero leverage', () => {
    expect(calculateLeverageRatio(
      decimal('0'),
      decimal('2500'),
    )).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('returns an explicit error for zero equity', () => {
    expect(calculateLeverageRatio(
      decimal('1000'),
      decimal('0'),
    )).toEqual({
      ok: false,
      reason: 'zero-equity',
    });
  });

  it('propagates malformed exposure evidence explicitly', () => {
    expect(calculateLeverageRatio(
      'bad-exposure' as DecimalString,
      decimal('1000'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('propagates malformed equity evidence explicitly', () => {
    expect(calculateLeverageRatio(
      decimal('1000'),
      'bad-equity' as DecimalString,
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('does not silently normalize negative evidence', () => {
    expect(calculateLeverageRatio(
      decimal('1000'),
      decimal('-500'),
    )).toEqual({
      ok: true,
      value: '-2',
    });
  });
});
