import type { DecimalString } from '../trades';
import { decimalDivide } from './decimalKernel';

export type PositionSizeCalculationResult =
  | { readonly ok: true; readonly value: DecimalString }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal' | 'zero-risk-per-unit';
    };

export function calculatePositionSize(
  riskBudget: DecimalString,
  riskPerUnit: DecimalString,
): PositionSizeCalculationResult {
  const quotient = decimalDivide(riskBudget, riskPerUnit);

  if (!quotient.ok) {
    return {
      ok: false,
      reason: quotient.reason === 'division-by-zero'
        ? 'zero-risk-per-unit'
        : 'invalid-decimal',
    };
  }

  return {
    ok: true,
    value: quotient.value,
  };
}
