import type { DecimalString } from '../trades';
import { decimalDivide } from './decimalKernel';

export type RMultipleCalculationResult =
  | { readonly ok: true; readonly value: DecimalString }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal' | 'zero-initial-risk';
    };

export function calculateRMultiple(
  resultAmount: DecimalString,
  initialRisk: DecimalString,
): RMultipleCalculationResult {
  const quotient = decimalDivide(resultAmount, initialRisk);

  if (!quotient.ok) {
    return {
      ok: false,
      reason: quotient.reason === 'division-by-zero'
        ? 'zero-initial-risk'
        : 'invalid-decimal',
    };
  }

  return {
    ok: true,
    value: quotient.value,
  };
}
