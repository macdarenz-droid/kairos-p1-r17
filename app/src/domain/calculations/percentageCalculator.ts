import type { DecimalString } from '../trades';
import {
  decimalDivide,
  decimalMultiply,
} from './decimalKernel';

export type PercentageCalculationResult =
  | { readonly ok: true; readonly value: DecimalString }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal' | 'zero-denominator';
    };

export function calculatePercentage(
  numerator: DecimalString,
  denominator: DecimalString,
): PercentageCalculationResult {
  const ratio = decimalDivide(numerator, denominator);

  if (!ratio.ok) {
    return {
      ok: false,
      reason: ratio.reason === 'division-by-zero'
        ? 'zero-denominator'
        : 'invalid-decimal',
    };
  }

  const percentage = decimalMultiply(ratio.value, '100');
  if (!percentage.ok) {
    return { ok: false, reason: 'invalid-decimal' };
  }

  return {
    ok: true,
    value: percentage.value,
  };
}
