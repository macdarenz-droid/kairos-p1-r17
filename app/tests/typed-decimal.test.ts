import { describe, expect, it } from 'vitest';
import { readTypedDecimal } from '../src/domain/trades';

describe('T-049d readTypedDecimal', () => {
  it.each([
    ['1,234.50', '1234.50', true],
    ['1.234,50', '1234.50', true],
    ['1 234,50', '1234.50', true],
    ["1'234.50", '1234.50', true],
    ['0,5', '0.5', true],
    ['1,5', '1.5', true],
    ['1,2345', '1.2345', true],
    ['0,123', '0.123', true],
    ['1.234', '1.234', false],
    ['1,234,567', '1234567', true],
    ['1.234.567', '1234567', true],
    ['12,34,567.50', '1234567.50', true],
    ['-1,234.5', '-1234.5', true],
    ['−5', '-5', true],
    ['007.50', '7.50', true],
    ['.5', '0.5', true],
    ['  42  ', '42', false],
    ['1234,567', '1234.567', true],
    ['1 234,567', '1234.567', true],
    ["1'234,500", '1234.500', true],
  ])('reads %j as %s', (input, value, changed) => {
    expect(readTypedDecimal(input)).toEqual({ ok: true, value, changed });
  });

  it.each([
    ['1,234', ['1234', '1.234']],
    ['12,345', ['12345', '12.345']],
    ['123,456', ['123456', '123.456']],
    ['-1,234', ['-1234', '-1.234']],
  ])('asks about %j instead of guessing', (input, readings) => {
    expect(readTypedDecimal(input)).toEqual({ ok: false, reason: 'unclear-separator', readings });
  });

  it.each(['', '   '])('calls %j empty', input => {
    expect(readTypedDecimal(input)).toEqual({ ok: false, reason: 'empty' });
  });

  it.each(['$1,234', '1e5', '1,234.5.6', '1,23.45', '1 234,567.1', '12--3', '5.'])('refuses %j', input => {
    expect(readTypedDecimal(input)).toEqual({ ok: false, reason: 'not-a-number' });
  });
});
