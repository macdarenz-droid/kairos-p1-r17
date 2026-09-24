import Decimal from 'decimal.js';
import { parseDecimalString, type DecimalString } from '../trades';

const KairosDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalKernelResult =
  | { readonly ok: true; readonly value: DecimalString }
  | { readonly ok: false; readonly reason: 'invalid-decimal' | 'division-by-zero' };

function read(value: DecimalString | string): Decimal | null {
  const parsed = parseDecimalString(String(value));
  if (!parsed.ok) return null;
  try {
    return new KairosDecimal(parsed.value);
  } catch {
    return null;
  }
}

function output(value: Decimal): DecimalKernelResult {
  const normalized = value.isZero() ? '0' : value.toFixed();
  const parsed = parseDecimalString(normalized);
  return parsed.ok
    ? { ok: true, value: parsed.value }
    : { ok: false, reason: 'invalid-decimal' };
}

export function decimalAdd(left: DecimalString | string, right: DecimalString | string): DecimalKernelResult {
  const a = read(left);
  const b = read(right);
  return a && b ? output(a.plus(b)) : { ok: false, reason: 'invalid-decimal' };
}

export function decimalSubtract(left: DecimalString | string, right: DecimalString | string): DecimalKernelResult {
  const a = read(left);
  const b = read(right);
  return a && b ? output(a.minus(b)) : { ok: false, reason: 'invalid-decimal' };
}

export function decimalMultiply(left: DecimalString | string, right: DecimalString | string): DecimalKernelResult {
  const a = read(left);
  const b = read(right);
  return a && b ? output(a.times(b)) : { ok: false, reason: 'invalid-decimal' };
}

export function decimalDivide(left: DecimalString | string, right: DecimalString | string): DecimalKernelResult {
  const a = read(left);
  const b = read(right);
  if (!a || !b) return { ok: false, reason: 'invalid-decimal' };
  if (b.isZero()) return { ok: false, reason: 'division-by-zero' };
  return output(a.dividedBy(b));
}

export function decimalAbs(value: DecimalString | string): DecimalKernelResult {
  const decimal = read(value);
  return decimal ? output(decimal.abs()) : { ok: false, reason: 'invalid-decimal' };
}

export function decimalSum(values: readonly (DecimalString | string)[]): DecimalKernelResult {
  let total = new KairosDecimal(0);
  for (const value of values) {
    const decimal = read(value);
    if (!decimal) return { ok: false, reason: 'invalid-decimal' };
    total = total.plus(decimal);
  }
  return output(total);
}
