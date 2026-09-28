import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculatePercentage } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.6 percentage calculator primitive', () => {
  it('calculates an exact positive percentage', () => {
    expect(calculatePercentage(decimal('20'), decimal('200'))).toEqual({
      ok: true,
      value: '10',
    });
  });

  it('preserves negative numerators instead of normalizing them', () => {
    expect(calculatePercentage(decimal('-15'), decimal('150'))).toEqual({
      ok: true,
      value: '-10',
    });
  });

  it('treats a real zero numerator as arithmetic zero', () => {
    expect(calculatePercentage(decimal('0'), decimal('125'))).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('preserves exact decimal arithmetic without native floating point', () => {
    expect(calculatePercentage(decimal('0.125'), decimal('0.5'))).toEqual({
      ok: true,
      value: '25',
    });
  });

  it('returns an explicit zero-denominator error', () => {
    expect(calculatePercentage(decimal('1'), decimal('0'))).toEqual({
      ok: false,
      reason: 'zero-denominator',
    });
  });

  it('propagates malformed decimal evidence explicitly', () => {
    expect(calculatePercentage(
      'not-a-decimal' as DecimalString,
      decimal('10'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('does not assume denominator sign semantics', () => {
    expect(calculatePercentage(decimal('5'), decimal('-20'))).toEqual({
      ok: true,
      value: '-25',
    });
  });
});
