import { describe, expect, it } from 'vitest';
import {
  decimalAbs,
  decimalAdd,
  decimalDivide,
  decimalMultiply,
  decimalSubtract,
  decimalSum,
} from '../src/domain/calculations';

describe('P11.1R1 decimal calculation kernel', () => {
  it('avoids binary floating-point drift', () => {
    expect(decimalAdd('0.1', '0.2')).toEqual({ ok: true, value: '0.3' });
  });

  it('preserves high precision from string inputs', () => {
    expect(decimalAdd('99999999999999999999.99', '0.01')).toEqual({
      ok: true,
      value: '100000000000000000000',
    });
  });

  it('supports signed arithmetic without negative zero', () => {
    expect(decimalSubtract('1', '2.5')).toEqual({ ok: true, value: '-1.5' });
    expect(decimalSubtract('1', '1')).toEqual({ ok: true, value: '0' });
    expect(decimalAbs('-1.5')).toEqual({ ok: true, value: '1.5' });
  });

  it('multiplies and divides using the locked decimal context', () => {
    expect(decimalMultiply('12.5', '4')).toEqual({ ok: true, value: '50' });
    expect(decimalDivide('1', '8')).toEqual({ ok: true, value: '0.125' });
  });

  it('refuses division by zero and malformed values', () => {
    expect(decimalDivide('1', '0')).toEqual({ ok: false, reason: 'division-by-zero' });
    expect(decimalAdd('1e3', '2')).toEqual({ ok: false, reason: 'invalid-decimal' });
  });

  it('sums decimal strings exactly', () => {
    expect(decimalSum(['0.1', '0.2', '0.3'])).toEqual({ ok: true, value: '0.6' });
  });
});
