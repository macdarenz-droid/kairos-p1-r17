import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateRMultiple } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.7 R-multiple calculator primitive', () => {
  it('calculates a positive realized R multiple', () => {
    expect(calculateRMultiple(decimal('200'), decimal('100'))).toEqual({
      ok: true,
      value: '2',
    });
  });

  it('preserves a losing result as negative R', () => {
    expect(calculateRMultiple(decimal('-75'), decimal('50'))).toEqual({
      ok: true,
      value: '-1.5',
    });
  });

  it('returns zero R for a genuine zero result', () => {
    expect(calculateRMultiple(decimal('0'), decimal('125'))).toEqual({
      ok: true,
      value: '0',
    });
  });

  it('preserves exact decimal precision', () => {
    expect(calculateRMultiple(decimal('0.3'), decimal('0.2'))).toEqual({
      ok: true,
      value: '1.5',
    });
  });

  it('returns an explicit zero-risk error', () => {
    expect(calculateRMultiple(decimal('10'), decimal('0'))).toEqual({
      ok: false,
      reason: 'zero-initial-risk',
    });
  });

  it('propagates malformed decimal evidence explicitly', () => {
    expect(calculateRMultiple(
      'not-a-decimal' as DecimalString,
      decimal('10'),
    )).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('does not silently normalize a negative risk input', () => {
    expect(calculateRMultiple(decimal('10'), decimal('-5'))).toEqual({
      ok: true,
      value: '-2',
    });
  });
});
