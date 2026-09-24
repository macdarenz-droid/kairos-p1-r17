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

/**
 * Rounds to `places` decimal places: 'down' toward zero, 'half-up' half away from zero.
 * `places` must be a whole number from 0 to 20; anything else is invalid-decimal.
 */
export function decimalRound(value: DecimalString | string, places: number, mode: 'down' | 'half-up'): DecimalKernelResult {
  if (!Number.isInteger(places) || places < 0 || places > 20) return { ok: false, reason: 'invalid-decimal' };
  const decimal = read(value);
  return decimal
    ? output(decimal.toDecimalPlaces(places, mode === 'down' ? KairosDecimal.ROUND_DOWN : KairosDecimal.ROUND_HALF_UP))
    : { ok: false, reason: 'invalid-decimal' };
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

/** Orders two decimal strings exactly; null when either is not a decimal string. */
export function decimalCompare(left: DecimalString | string, right: DecimalString | string): -1 | 0 | 1 | null {
  const a = read(left);
  const b = read(right);
  if (!a || !b) return null;
  const order = a.comparedTo(b);
  return order < 0 ? -1 : order > 0 ? 1 : 0;
}

/**
 * For drawing only. The result is a count of steps, never money.
 * Computes value / max × steps exactly, rounds half up to a whole step and
 * clamps it to 0…steps. Null for an invalid input, max <= 0, or steps that
 * are not a positive safe integer.
 */
export function decimalScaleToSteps(value: DecimalString | string, max: DecimalString | string, steps: number): number | null {
  if (!Number.isSafeInteger(steps) || steps <= 0) return null;
  const a = read(value);
  const b = read(max);
  if (!a || !b || b.lte(0)) return null;
  const scaled = a.times(steps).dividedBy(b).toDecimalPlaces(0, KairosDecimal.ROUND_HALF_UP).toNumber();
  return Math.min(steps, Math.max(0, scaled));
}
