import type { DecimalString } from '../trades';
import { decimalDivide } from './decimalKernel';

export type LeverageCalculationResult =
  | { readonly ok: true; readonly value: DecimalString }
  | {
      readonly ok: false;
      readonly reason: 'invalid-decimal' | 'zero-equity';
    };

export function calculateLeverageRatio(
  exposure: DecimalString,
  equity: DecimalString,
): LeverageCalculationResult {
  const quotient = decimalDivide(exposure, equity);

  if (!quotient.ok) {
    return {
      ok: false,
      reason: quotient.reason === 'division-by-zero'
        ? 'zero-equity'
        : 'invalid-decimal',
    };
  }

  return {
    ok: true,
    value: quotient.value,
  };
}
